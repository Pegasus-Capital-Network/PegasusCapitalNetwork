/* ============================================================================
   PEGASUS — Profile Ecosystem Layer · profile-system.js
   Modular, additive orchestrator. Plugs into existing globals:
     window.Pegasus  (boot, store, mountApp, toast, profileUrl, slugify)
     window.PegStore (get, set, hydrate, isAdmin)
     window.PegSB    (ready -> supabase client)
     window.PegAPI   (updateProfile, listAppetites, ...)
   Exposes: window.PegProfile
   Does NOT modify core architecture. Safe to remove by deleting these files
   and reverting the 3 profile-system-owned pages.
   ============================================================================ */
(function () {
  'use strict';

  async function sb() { try { return await window.PegSB.ready; } catch (e) { return null; } }
  function store() { return window.PegStore; }

  /* ── Auth / ownership ───────────────────────────────────────────────────── */
  function currentUser() {
    var st = store().get();
    return (st && st.mode === 'live' && st.user && st.user.id !== 'demo') ? st.user : null;
  }
  function isSignedIn() { return !!currentUser(); }

  /* ── Completion scoring (single source of truth) ────────────────────────── */
  function calcCompletion(p) {
    p = p || {};
    var pts = 0;
    if ((p.full_name || '').trim())            pts += 15;
    if ((p.role || '').trim())                 pts += 10;
    if ((p.professional_title || p.headline || '').trim()) pts += 10;
    if ((p.headline || '').trim())             pts += 10;
    if ((p.bio || '').trim())                  pts += 15;
    if (((p.markets) || []).length)            pts += 10;
    if (((p.specialties) || []).length)        pts += 10;
    if ((p.avatar_url || '').trim())           pts += 10;
    if ((p.banner_url || '').trim())           pts += 5;
    if (((p.credentials) || []).length)        pts += 5;
    return Math.min(100, pts);
  }

  function missingFields(p) {
    p = p || {};
    var m = [];
    if (!(p.full_name || '').trim())   m.push('Display name');
    if (!(p.headline || '').trim())    m.push('Headline');
    if (!(p.bio || '').trim())         m.push('Bio');
    if (!((p.markets) || []).length)   m.push('Markets');
    if (!((p.specialties) || []).length) m.push('Specialties');
    if (!(p.avatar_url || '').trim())  m.push('Profile photo');
    return m;
  }

  /* ── Load: own profile (from hydrated store) ────────────────────────────── */
  function ownProfile() {
    var st = store().get();
    return st && st.profile ? st.profile : null;
  }

  /* Public profile columns intentionally exclude email, access/referral data,
     and internal moderation fields that migration 045 withholds from anon.
     Signed-in members retain the existing full-profile read path. */
  var PUBLIC_PROFILE_FIELDS = [
    'id','full_name','role','company_name','created_at','updated_at',
    'headline','bio','markets','specialties','location','website','avatar_color',
    'verification_status','onboarding_complete','profile_completion','profile_slug',
    'professional_title','current_focus','ecosystem_contribution','ecosystem_goals',
    'ecosystem_role','expertise_areas','featured_modules','additional_roles',
    'ambassador_status','avatar_url','institutional_visibility','verified_identity',
    'linkedin_url','facebook_url','instagram_url','x_url','youtube_url','tiktok_url'
  ].join(',');
  var PUBLIC_PROFILE_FIELDS_CORE = [
    'id','full_name','role','company_name','created_at','updated_at',
    'headline','bio','markets','specialties','location','website','avatar_color',
    'verification_status','onboarding_complete','profile_completion','profile_slug',
    'professional_title','current_focus','avatar_url'
  ].join(',');

  /* ── Load: any profile by slug or id (for public view) ──────────────────── */
  async function loadProfile(opts) {
    opts = opts || {};
    var c = await sb();
    if (!c) return null;
    try {
      var signedIn = isSignedIn();
      var usr = signedIn ? currentUser() : null, own = ownProfile();
      /* Own profile keeps the full read path. Anyone else's profile is read from
         the member_directory view: signed-in members can only SELECT their own
         row in profiles (RLS), so reading others there returned nothing. */
      var isOwn = !!(usr && ((opts.id && opts.id === usr.id) ||
                    (opts.slug && own && own.profile_slug === opts.slug)));
      var src = isOwn ? 'profiles' : 'member_directory';
      var q = c.from(src).select(isOwn ? '*' : PUBLIC_PROFILE_FIELDS);
      q = opts.slug ? q.eq('profile_slug', opts.slug) : q.eq('id', opts.id);
      var res = await q.maybeSingle();
      if ((!res || res.error || !res.data) && !isOwn) {
        var q2 = c.from('profiles').select(PUBLIC_PROFILE_FIELDS_CORE);
        q2 = opts.slug ? q2.eq('profile_slug', opts.slug) : q2.eq('id', opts.id);
        var res2 = await q2.maybeSingle();
        if (res2 && !res2.error && res2.data) res = res2;
      }
      return (res && !res.error) ? (res.data || null) : null;
    } catch (e) {
      console.warn('[PegProfile] loadProfile failed:', e && e.message);
      return null;
    }
  }

  /* ── Save: upsert own profile, re-fetch to confirm (delegates to PegAPI) ── */
  async function saveProfile(patch) {
    var usr = currentUser();
    if (!usr) throw new Error('Not signed in');

    // ensure completion is recalculated against the merged record
    var merged = Object.assign({}, ownProfile() || {}, patch);
    patch.profile_completion = calcCompletion(merged);
    patch.updated_at = new Date().toISOString();

    // Pass the MERGED record so upsert never wipes existing fields
    merged.profile_completion = patch.profile_completion;
    merged.updated_at = patch.updated_at;
    var saved = await window.PegAPI.updateProfile(merged);
    return saved;
  }

  /* ── Admin save: write a patch to a SPECIFIC member's id (not own) ──────────
     Recalculates completion against the target's merged record, then delegates
     to PegAPI.updateProfileForId. RLS (prof_admin_u) enforces admin-only. */
  async function saveProfileForId(targetId, patch) {
    if (!targetId) throw new Error('Missing target profile id');
    var base = patch || {};
    base.profile_completion = calcCompletion(Object.assign({}, base));
    base.updated_at = new Date().toISOString();
    return await window.PegAPI.updateProfileForId(targetId, base);
  }

  /* ── Activity log (real, member-owned; empty when none) ─────────────────── */
  async function loadActivity(userId, limit) {
    var c = await sb(); if (!c) return [];
    try {
      var res = await c.from('profile_activity')
        .select('*').eq('user_id', userId)
        .order('created_at', { ascending: false }).limit(limit || 8);
      return res.data || [];
    } catch (e) { return []; }
  }

  async function logActivity(kind, label, meta) {
    var usr = currentUser(); if (!usr) return;
    var c = await sb(); if (!c) return;
    try {
      await c.from('profile_activity').insert({
        user_id: usr.id, kind: kind, label: label, meta: meta || {}
      });
    } catch (e) { /* non-fatal */ }
  }

  /* ── Reputation tags derived from REAL profile fields (no fabrication) ──── */
  function reputationTags(p) {
    p = p || {};
    var tags = [];
    if (p.verification_status === 'verified') tags.push({ label: 'Verified', tone: 'green' });
    if (p.ambassador_status || p.featured_kind === 'ambassador') tags.push({ label: 'Ambassador', tone: 'gold' });
    if (p.featured_status || p.featured) tags.push({ label: 'Featured Member', tone: 'blue' });
    if (p.featured_kind === 'speaker') tags.push({ label: 'Speaker', tone: 'teal' });
    if (p.featured_kind === 'authority') tags.push({ label: 'Institutional', tone: 'blue' });
    var role = (p.role || '').toLowerCase();
    if (role === 'investor' || role === 'rwa_partner') tags.push({ label: 'Capital Partner', tone: 'gold' });
    if (role === 'developer' || role === 'borrower') tags.push({ label: 'Founder', tone: 'teal' });
    return tags;
  }

  window.PegProfile = {
    sb: sb,
    isSignedIn: isSignedIn,
    currentUser: currentUser,
    ownProfile: ownProfile,
    loadProfile: loadProfile,
    saveProfile: saveProfile,
    saveProfileForId: saveProfileForId,
    calcCompletion: calcCompletion,
    missingFields: missingFields,
    loadActivity: loadActivity,
    logActivity: logActivity,
    reputationTags: reputationTags,
  };
})();
