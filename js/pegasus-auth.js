/* ============================================================================
   PEGASUS v69 — Auth. Real Supabase auth with graceful preview fallback.
   ============================================================================ */
(function(){
  const SB = window.PegSB; const C = window.PEG_CONFIG;
  async function client(){ return await SB.ready; }

  async function signUp({email,password,full_name,role,access_code,headline,location}){
    const sb = await client(); if(!sb) throw new Error('Auth unavailable');
    const redirectTo = (typeof window!=='undefined' && window.location && window.location.origin)
      ? window.location.origin + '/auth-callback.html'
      : 'https://pegasuscapitalnetwork.com/auth-callback.html';
    const meta = { full_name, role };
    if(access_code) meta.access_code = access_code;
    /* Small-profile onboarding: carry the one-line focus + optional location
       through user_metadata so they survive the email-confirmation round-trip
       and seed the profile on first callback. Both optional — omitted when blank
       so nothing about the existing auth payload changes for users who skip them. */
    if(headline) meta.headline = String(headline).slice(0,160);
    if(location) meta.location = String(location).slice(0,120);
    const { data, error } = await sb.auth.signUp({ email, password,
      options:{ data:meta, emailRedirectTo: redirectTo } });
    if(error) throw error; return data;
  }
  async function signIn({email,password}){
    const sb = await client(); if(!sb) throw new Error('Auth unavailable');
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if(error) throw error; return data;
  }
  async function signOut(){
    // Bulletproof sign-out: a failing/slow Supabase call must never leave the
    // user stuck. We attempt a server sign-out, but ALWAYS clear local auth
    // traces and redirect home regardless of the outcome.
    try{
      const sb = await Promise.race([
        client(),
        new Promise(function(res){ setTimeout(function(){ res(null); }, 2500); })
      ]);
      if(sb && sb.auth && sb.auth.signOut){
        try{ await sb.auth.signOut({ scope:'local' }); }
        catch(e){ try{ await sb.auth.signOut(); }catch(_){} }
      }
    }catch(e){ /* client unavailable — fall through to local cleanup */ }
    // Remove every local auth trace so the returning-member gateway on "/" treats
    // this browser as anonymous (storageKey is 'pegasus.auth').
    try{
      localStorage.removeItem('pegasus.auth');
      localStorage.removeItem('peg_authed');
      localStorage.removeItem('peg_slug');
      for(var i=localStorage.length-1;i>=0;i--){
        var k=localStorage.key(i);
        if(k && (k.indexOf('sb-')===0 || k.toLowerCase().indexOf('supabase')>=0 || k==='pegasus.auth')){
          localStorage.removeItem(k);
        }
      }
    }catch(e){}
    location.replace('/');
  }
  async function signInWithGoogle(){
    const sb = await client(); if(!sb) throw new Error('Auth unavailable');
    const redirectTo = (typeof window!=='undefined' && window.location && window.location.origin)
      ? window.location.origin + '/auth-callback.html'
      : 'https://pegasuscapitalnetwork.com/auth-callback.html';
    const { data, error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectTo }
    });
    if(error) throw error; return data;
  }
  async function signInWithApple(){
    const sb = await client(); if(!sb) throw new Error('Auth unavailable');
    const redirectTo = (typeof window!=='undefined' && window.location && window.location.origin)
      ? window.location.origin + '/auth-callback.html'
      : 'https://pegasuscapitalnetwork.com/auth-callback.html';
    const { data, error } = await sb.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: redirectTo }
    });
    if(error) throw error; return data;
  }
  async function getSession(){
    const sb = await client(); if(!sb) return null;
    const { data } = await sb.auth.getSession(); return data ? data.session : null;
  }
  function onChange(cb){ client().then(sb=>{ if(sb) sb.auth.onAuthStateChange((_e,s)=>cb(s)); }); }

  // route guards — call at top of a page; redirect if unmet (unless demo fallback)
  async function requireAuth(){
    const s = await getSession();
    if(!s){ if(C.ALLOW_DEMO_FALLBACK) return null; location.href='/'; }
    return s;
  }
  window.PegAuth = { signUp, signIn, signOut, signInWithGoogle, signInWithApple, getSession, onChange, requireAuth };
})();
