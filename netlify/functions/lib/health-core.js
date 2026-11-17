/**
 * PEGASUS — Health Check Core Library
 * Shared between run-health-check.js (manual) and scheduled-health-check.js (weekly).
 * All checks run purely server-side — no browser, no frontend required.
 *
 * Node 18+ required (built-in fetch). Netlify Functions use Node 18+ by default.
 */

'use strict';

const { createClient } = require('@supabase/supabase-js');

/* ── Issue builder ─────────────────────────────────────────── */
function iss(severity, check, message) {
  return { severity, check, message };
}

/* ── HEAD request helper ───────────────────────────────────── */
async function head(url, timeoutMs = 8000) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { method: 'HEAD', signal: ctrl.signal, redirect: 'follow' });
    clearTimeout(timer);
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

/* ════════════════════════════════════════════════════════════
   CHECK 1 — Route Reachability
   Verifies each page returns HTTP 200 via HEAD request.
   ════════════════════════════════════════════════════════════ */
async function checkRoutes(baseUrl) {
  const routes = [
    { path: '/',                     name: 'Homepage' },
    { path: '/signup.html',          name: 'Signup' },
    { path: '/signin.html',          name: 'Sign In' },
    { path: '/membership.html',      name: 'Pricing/Membership' },
    { path: '/members.html',         name: 'Member Directory' },
    { path: '/growth-capital.html',  name: 'Growth Capital' },
    { path: '/capital-sessions.html',name: 'Capital Sessions' },
    { path: '/profile.html',         name: 'My Profile' },
    { path: '/profile-edit.html',    name: 'Edit Profile' },
    { path: '/public-profile.html',  name: 'Public Profile' },
    { path: '/dashboard.html',       name: 'Dashboard' },
    { path: '/deal-rooms.html',      name: 'Deal Rooms' },
    { path: '/match-engine.html',    name: 'Match Engine' },
    { path: '/admin.html',           name: 'Admin Console' },
  ];

  const issues = [];
  let passed = 0;

  await Promise.all(routes.map(async (r) => {
    const res = await head(baseUrl + r.path);
    if (!res.ok) {
      issues.push(iss('CRITICAL', 'Routes', `${r.name} (${r.path}) returned ${res.status || 'network error'}`));
    } else {
      passed++;
    }
  }));

  return {
    name: 'Route Reachability',
    icon: '🗺',
    score: routes.length ? Math.round(100 * passed / routes.length) : 100,
    passed,
    total: routes.length,
    issues,
  };
}

/* ════════════════════════════════════════════════════════════
   CHECK 2 — Auth Routes
   ════════════════════════════════════════════════════════════ */
async function checkAuth(baseUrl) {
  const authRoutes = [
    { path: '/signup.html',          name: 'Signup' },
    { path: '/signin.html',          name: 'Sign In' },
    { path: '/forgot-password.html', name: 'Forgot Password' },
    { path: '/reset-password.html',  name: 'Reset Password' },
    { path: '/auth-callback.html',   name: 'Auth Callback' },
  ];

  const issues = [];
  let passed = 0;

  await Promise.all(authRoutes.map(async (r) => {
    const res = await head(baseUrl + r.path);
    if (!res.ok) {
      issues.push(iss('CRITICAL', 'Auth', `${r.name} not reachable (${res.status})`));
    } else {
      passed++;
    }
  }));

  return {
    name: 'Auth Routes',
    icon: '🔐',
    score: Math.round(100 * passed / authRoutes.length),
    passed,
    total: authRoutes.length,
    issues,
  };
}

/* ════════════════════════════════════════════════════════════
   CHECK 3 — Link & Button Scan
   Fetches homepage HTML and scans for dead CTAs and old routes.
   ════════════════════════════════════════════════════════════ */
async function checkLinks(baseUrl) {
  const issues = [];

  /* Pages most likely to contain interactive CTAs/buttons. */
  const pages = [
    { path: '/', name: 'Homepage' },
    { path: '/rwa-network.html', name: 'RWA Network' },
    { path: '/rwa-tokenization.html', name: 'RWA Tokenization' },
    { path: '/rwa-education.html', name: 'RWA Education' },
    { path: '/rwa-events-network.html', name: 'RWA Events' },
    { path: '/membership.html', name: 'Membership' },
    { path: '/how-it-works.html', name: 'How It Works' },
    { path: '/members.html', name: 'Members' },
    { path: '/growth-capital.html', name: 'Growth Capital' },
    { path: '/about.html', name: 'About' },
  ];

  async function fetchPage(p) {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 9000);
      const res = await fetch(baseUrl + p, { signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(to);
      if (!res.ok) return null;
      return await res.text();
    } catch (e) { return null; }
  }

  const oldRoutes = ['lender-directory.html', 'create-account.html', 'pricing.html', 'login.html'];

  await Promise.all(pages.map(async (pg) => {
    const html = await fetchPage(pg.path);
    if (html == null) return; // route check covers reachability; skip here

    /* Real dead hrefs: href="#" or empty href on a styled button.
       Exclude JS template literals like href="'+x+'" which are filled at runtime. */
    const anchorTags = html.match(/<a\b[^>]*>/g) || [];
    let deadBtns = 0;
    anchorTags.forEach((tag) => {
      const hasBtnClass = /class=["'][^"']*\bbtn/.test(tag);
      const hrefM = tag.match(/href=["']([^"']*)["']/);
      const href = hrefM ? hrefM[1] : null;
      const isTemplate = href != null && (href.includes("'+") || href.includes('${') || href.includes('+\''));
      const hasOnclick = /onclick=/.test(tag);
      if (isTemplate) return;
      if (hasBtnClass && (href === '#' || href === '' || href == null) && !hasOnclick) {
        deadBtns++;
      }
    });
    if (deadBtns > 0) {
      issues.push(iss('CRITICAL', 'Dead Buttons', `${pg.name}: ${deadBtns} button(s) with dead href (#/empty) and no click handler`));
    }

    /* Deprecated routes referenced */
    oldRoutes.forEach((old) => {
      if (html.includes('"' + old + '"') || html.includes("'" + old + "'")) {
        issues.push(iss('IMPORTANT', 'Links', `${pg.name} references deprecated route: ${old}`));
      }
    });
  }));

  /* CSS overlay regression guard: a full-bleed ::before/::after decorative layer
     WITHOUT pointer-events:none sits on top of content and eats clicks (this is
     exactly the bug that killed the CTA buttons). Scan the live stylesheet. */
  try {
    const cssRes = await fetch(baseUrl + '/css/pegasus.css', { cache: 'no-store' });
    if (cssRes.ok) {
      const css = await cssRes.text();
      const rules = css.match(/\.[\w-]+::(?:before|after)\s*\{[^}]*\}/g) || [];
      let overlayBugs = 0;
      const offenders = [];
      rules.forEach((rule) => {
        const body = rule.slice(rule.indexOf('{') + 1);
        const fullBleed = /position:\s*(absolute|fixed)/.test(body) && /inset:\s*0/.test(body);
        const guarded = /pointer-events:\s*none/.test(body);
        if (fullBleed && !guarded) {
          overlayBugs++;
          const sel = (rule.match(/^(\.[\w-]+::(?:before|after))/) || [])[1] || 'overlay';
          if (offenders.length < 5) offenders.push(sel);
        }
      });
      if (overlayBugs > 0) {
        issues.push(iss('WARNING', 'Click Overlay', `${overlayBugs} full-bleed CSS overlay(s) missing pointer-events:none — may block clicks (${offenders.join(', ')})`));
      }
    }
  } catch (e) {
    issues.push(iss('INFO', 'Click Overlay', `Could not fetch stylesheet: ${e.message}`));
  }

  const critical = issues.filter(i => i.severity === 'CRITICAL').length;
  const warning  = issues.filter(i => i.severity === 'WARNING').length;
  return {
    name: 'Link & Button Scan',
    icon: '🔗',
    score: critical > 0 ? 55 : warning > 0 ? 80 : 100,
    issues,
  };
}

/* ════════════════════════════════════════════════════════════
   CHECK 4 — Environment Variables
   Checks presence only — never logs or returns values.
   ════════════════════════════════════════════════════════════ */
function checkEnvVars() {
  const required = [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_PRICE_STARTER_MONTHLY',
    'STRIPE_PRICE_PRO_MONTHLY',
    'STRIPE_PRICE_GOLD_MONTHLY',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];

  const issues = [];
  for (const name of required) {
    if (!process.env[name]) {
      issues.push(iss('CRITICAL', 'Env Vars', `${name} is not set — related features will fail`));
    }
  }

  return {
    name: 'Environment Variables',
    icon: '🔑',
    score: Math.round(100 * (required.length - issues.length) / required.length),
    checked: required.map(n => ({ name: n, present: !!process.env[n] })),
    issues,
    emailConfigured: !!process.env.HEALTH_REPORT_EMAIL,
    telegramConfigured: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
  };
}

/* ════════════════════════════════════════════════════════════
   CHECK 5 — Stripe
   Pings Stripe API to verify key is valid and live/test mode.
   ════════════════════════════════════════════════════════════ */
async function checkStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    return {
      name: 'Stripe', icon: '💳', score: 0,
      issues: [iss('CRITICAL', 'Stripe', 'STRIPE_SECRET_KEY not configured')],
    };
  }

  const issues = [];
  const mode = process.env.STRIPE_SECRET_KEY.startsWith('sk_live') ? 'live' : 'test';

  try {
    const Stripe = require('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
    await stripe.products.list({ limit: 1 });

    /* Verify price IDs start with price_ not prod_ */
    for (const [k, v] of Object.entries({
      STARTER: process.env.STRIPE_PRICE_STARTER_MONTHLY,
      PRO:     process.env.STRIPE_PRICE_PRO_MONTHLY,
      GOLD:    process.env.STRIPE_PRICE_GOLD_MONTHLY,
    })) {
      if (v && !v.startsWith('price_')) {
        issues.push(iss('CRITICAL', 'Stripe', `STRIPE_PRICE_${k}_MONTHLY = "${v.slice(0, 8)}…" — must start with price_, not prod_`));
      }
    }

    return { name: 'Stripe', icon: '💳', score: issues.length ? 40 : 100, mode, connected: true, issues };
  } catch (e) {
    issues.push(iss('CRITICAL', 'Stripe', `Stripe API call failed: ${e.message}`));
    return { name: 'Stripe', icon: '💳', score: 0, mode, connected: false, issues };
  }
}

/* ════════════════════════════════════════════════════════════
   CHECK 6 — Supabase: Profiles + Storage Bucket
   Uses service role to read all profiles and verify buckets.
   ════════════════════════════════════════════════════════════ */
async function checkSupabase() {
  const issues = [];

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      name: 'Supabase & Storage', icon: '🗄', score: 0,
      issues: [iss('CRITICAL', 'Supabase', 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set')],
    };
  }

  const admin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  /* Storage bucket */
  try {
    const { data: buckets, error } = await admin.storage.listBuckets();
    if (error) throw error;
    const bucket = (buckets || []).find(b => b.name === 'profile-media');
    if (!bucket) {
      issues.push(iss('CRITICAL', 'Storage', '"profile-media" bucket missing — uploads will fail. Run migration 007.'));
    } else if (!bucket.public) {
      issues.push(iss('WARNING', 'Storage', '"profile-media" bucket is private — public image URLs may not load'));
    }
  } catch (e) {
    issues.push(iss('CRITICAL', 'Storage', `Bucket check failed: ${e.message}`));
  }

  /* Profiles */
  let profileCount = 0;
  try {
    const { data: profiles, error } = await admin
      .from('profiles')
      .select('id, full_name, role, profile_slug, avatar_url, profile_completion, email')
      .order('created_at', { ascending: false });

    if (error) throw error;
    profileCount = profiles?.length || 0;

    const slugMap = {};
    let incomplete = 0;

    (profiles || []).forEach((p) => {
      const label = p.full_name || p.email || p.id.slice(0, 8);

      /* Duplicate slug — CRITICAL: breaks /u/:slug routing */
      if (p.profile_slug) {
        if (slugMap[p.profile_slug]) {
          issues.push(iss('CRITICAL', 'Profiles', `Duplicate slug "${p.profile_slug}" — /u/${p.profile_slug} will error. IDs: ${slugMap[p.profile_slug].slice(0,8)}, ${p.id.slice(0,8)}`));
        }
        slugMap[p.profile_slug] = p.id;
      } else {
        issues.push(iss('WARNING', 'Profiles', `${label} — missing profile slug (public URL will 404)`));
        incomplete++;
      }

      if (!p.full_name || !p.role) incomplete++;
    });

    if (incomplete > 0) {
      issues.push(iss('WARNING', 'Profiles', `${incomplete} profile(s) missing name, role, or slug`));
    }
  } catch (e) {
    issues.push(iss('CRITICAL', 'Profiles', `Profile query failed: ${e.message}`));
  }

  /* Storage URL spot-check — first 10 avatars */
  try {
    const { data: withMedia } = await admin
      .from('profiles')
      .select('full_name, avatar_url')
      .not('avatar_url', 'is', null)
      .limit(10);

    let brokenUrls = 0;
    await Promise.all((withMedia || []).map(async (p) => {
      const res = await head(p.avatar_url);
      if (!res.ok) {
        issues.push(iss('WARNING', 'Storage', `${p.full_name || '?'} avatar URL broken (${res.status}): ${p.avatar_url.slice(0, 50)}…`));
        brokenUrls++;
      }
    }));
  } catch (_) { /* non-fatal */ }

  const critCount = issues.filter(i => i.severity === 'CRITICAL').length;
  const warnCount = issues.filter(i => i.severity === 'WARNING').length;
  const score = Math.max(0, 100 - critCount * 30 - warnCount * 10);

  return {
    name: 'Supabase & Storage',
    icon: '🗄',
    score,
    profileCount,
    issues,
  };
}

/* ════════════════════════════════════════════════════════════
   CHECK 7 — Security Config
   Verifies keys are not mixed up and mode is appropriate.
   ════════════════════════════════════════════════════════════ */
function checkSecurity() {
  const issues = [];

  const srKey   = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.SUPABASE_ANON_KEY         || '';
  if (srKey && anonKey && srKey === anonKey) {
    issues.push(iss('CRITICAL', 'Security', 'SUPABASE_SERVICE_ROLE_KEY equals SUPABASE_ANON_KEY — service role key is wrong'));
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY || '';
  if (stripeKey && !stripeKey.startsWith('sk_')) {
    issues.push(iss('CRITICAL', 'Security', 'STRIPE_SECRET_KEY does not start with "sk_" — value may be wrong'));
  }
  if (stripeKey.startsWith('pk_')) {
    issues.push(iss('CRITICAL', 'Security', 'STRIPE_SECRET_KEY appears to be a publishable key (pk_) — this is a serious security error'));
  }

  return {
    name: 'Security Config',
    icon: '🔒',
    score: issues.filter(i => i.severity === 'CRITICAL').length > 0 ? 0 : 100,
    issues,
  };
}

/* ════════════════════════════════════════════════════════════
   CHECK 8 — Content Quality (public directories)
   Watches for the presentation problems a human would otherwise
   catch only by browsing: one lender dominating /lending-programs,
   and public cards with no real logo (Pegasus placeholder).
   ════════════════════════════════════════════════════════════ */
async function checkContent() {
  const issues = [];
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { name: 'Content Quality', icon: '🧭', score: 100, issues: [iss('INFO', 'Content', 'Supabase not configured — content checks skipped')] };
  }
  const admin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
  const isHouse = (u) => !u || /\/assets\/brand\//i.test(u) || /pegasus-(symbol|mark|emblem|watermark)/i.test(u);

  /* Lending programs — lender concentration + missing logos */
  try {
    const { data, error } = await admin
      .from('public_lender_programs')
      .select('company_presence_id,company_slug,profile_slug,user_id,company_name,company_page_name,lender_name,logo_url,avatar_url,unclaimed');
    if (error) throw error;
    const rows = data || [];
    const total = rows.length;
    const groups = {};
    let noLogo = 0;
    rows.forEach((r) => {
      const key = r.company_presence_id
        || (r.company_slug ? 'c:' + r.company_slug : '')
        || (r.profile_slug ? 'p:' + r.profile_slug : '')
        || (r.user_id ? 'u:' + r.user_id : '')
        || ('n:' + String(r.company_page_name || r.company_name || r.lender_name || '').toLowerCase().trim());
      const name = r.company_page_name || r.company_name || r.lender_name || 'Lender';
      if (!groups[key]) groups[key] = { name, count: 0 };
      groups[key].count++;
      if (isHouse(r.logo_url) && isHouse(r.avatar_url)) noLogo++;
    });
    const arr = Object.keys(groups).map((k) => groups[k]).sort((a, b) => b.count - a.count);
    if (total > 0 && arr[0]) {
      const top = arr[0];
      const pct = Math.round((100 * top.count) / total);
      if (top.count >= 6 && pct >= 50) {
        issues.push(iss('WARNING', 'Directory balance', `${top.name} publishes ${top.count} of ${total} lending programs (${pct}%) — one lender dominates /lending-programs`));
      } else if (top.count >= 8) {
        issues.push(iss('INFO', 'Directory balance', `${top.name} has ${top.count} lending programs (grouped into one card)`));
      }
    }
    if (noLogo > 0) {
      issues.push(iss('INFO', 'Logos', `${noLogo} lending card(s) have no real logo (initials / "Your logo here")`));
    }
  } catch (e) {
    issues.push(iss('INFO', 'Content', `Lending-program check skipped: ${e.message}`));
  }

  /* Public company pages missing a logo */
  try {
    const { data, error } = await admin
      .from('presences')
      .select('name,logo_url')
      .eq('presence_type', 'company')
      .eq('visibility', 'public_preview')
      .eq('status', 'active')
      .limit(5000);
    if (!error) {
      const rows = data || [];
      const missing = rows.filter((r) => isHouse(r.logo_url)).length;
      if (rows.length > 0 && missing > 0) {
        const pct = Math.round((100 * missing) / rows.length);
        issues.push(iss('INFO', 'Logos', `${missing} of ${rows.length} public company pages (${pct}%) have no logo`));
      }
    }
  } catch (_) { /* non-fatal */ }

  const warn = issues.filter((i) => i.severity === 'WARNING').length;
  return { name: 'Content Quality', icon: '🧭', score: Math.max(0, 100 - warn * 10), issues };
}

/* ════════════════════════════════════════════════════════════
   RUN ALL CHECKS
   Returns combined report object.
   ════════════════════════════════════════════════════════════ */
async function runAllChecks(baseUrl, source = 'manual') {
  const BASE = baseUrl || process.env.URL || process.env.DEPLOY_URL || 'https://pegasuscapitalnetwork.com';

  const [routeResult, authResult, linkResult, envResult, stripeResult, supabaseResult, securityResult, contentResult] =
    await Promise.all([
      checkRoutes(BASE),
      checkAuth(BASE),
      checkLinks(BASE),
      Promise.resolve(checkEnvVars()),
      checkStripe(),
      checkSupabase(),
      Promise.resolve(checkSecurity()),
      checkContent(),
    ]);

  const allChecks = [routeResult, authResult, linkResult, envResult, stripeResult, supabaseResult, securityResult, contentResult];
  const allIssues = allChecks.flatMap(c => c.issues || []);

  const critical = allIssues.filter(i => i.severity === 'CRITICAL').length;
  const warning  = allIssues.filter(i => i.severity === 'WARNING').length;
  const info     = allIssues.filter(i => i.severity === 'INFO').length;
  const score    = Math.round(allChecks.reduce((s, c) => s + (c.score ?? 100), 0) / allChecks.length);
  const status   = critical > 0 ? 'critical' : warning > 0 ? 'degraded' : 'healthy';

  /* Top 5 most severe issues for summaries */
  const topIssues = allIssues
    .sort((a, b) => {
      const ord = { CRITICAL: 0, WARNING: 1, IMPORTANT: 2, INFO: 3 };
      return (ord[a.severity] ?? 9) - (ord[b.severity] ?? 9);
    })
    .slice(0, 5);

  return {
    source,
    generated_at: new Date().toISOString(),
    base_url: BASE,
    score,
    status,
    critical_count: critical,
    warning_count: warning,
    info_count: info,
    summary: `${status.toUpperCase()}: ${critical} critical, ${warning} warnings. Score: ${score}/100.`,
    top_issues: topIssues,
    checks: {
      routes:    routeResult,
      auth:      authResult,
      links:     linkResult,
      env:       envResult,
      stripe:    stripeResult,
      supabase:  supabaseResult,
      security:  securityResult,
      content:   contentResult,
    },
    delivery: {
      emailConfigured:    !!process.env.HEALTH_REPORT_EMAIL,
      telegramConfigured: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
      resendConfigured:   !!process.env.RESEND_API_KEY,
    },
  };
}

/* ════════════════════════════════════════════════════════════
   SAVE REPORT to health_reports table
   ════════════════════════════════════════════════════════════ */
async function saveReport(report, userId = null) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;

  const admin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  const { data, error } = await admin.from('health_reports').insert({
    created_by:     userId,
    status:         report.status,
    score:          report.score,
    critical_count: report.critical_count,
    warning_count:  report.warning_count,
    info_count:     report.info_count,
    report_json:    report,
    summary:        report.summary,
    source:         report.source || 'manual',
  }).select('id').single();

  if (error) console.error('[health-core] save error:', error.message);
  return data?.id || null;
}

/* ════════════════════════════════════════════════════════════
   SEND EMAIL via Resend
   ════════════════════════════════════════════════════════════ */
async function sendEmail(report) {
  const toEmail = process.env.HEALTH_REPORT_EMAIL;
  const apiKey  = process.env.RESEND_API_KEY;
  if (!toEmail || !apiKey) return { sent: false, reason: 'Not configured' };

  const { score, status, critical_count, warning_count, summary, generated_at, top_issues, source } = report;
  const ts       = new Date(generated_at).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }) + ' PT';
  const icon     = status === 'healthy' ? '✅' : status === 'degraded' ? '⚠️' : '🔴';
  const scoreClr = score >= 90 ? '#16a34a' : score >= 70 ? '#d97706' : '#dc2626';
  const isWeekly = source === 'scheduled';

  const issueRows = (top_issues || []).map((i, n) =>
    `<tr>
      <td style="padding:6px 10px;font-size:12px;color:#666;border-bottom:1px solid #f0f0f0">${n + 1}</td>
      <td style="padding:6px 10px;font-size:12px;border-bottom:1px solid #f0f0f0">
        <span style="display:inline-block;padding:1px 7px;border-radius:3px;font-size:10px;font-weight:600;background:${
          i.severity === 'CRITICAL' ? '#fee2e2' : i.severity === 'WARNING' ? '#fef3c7' : '#dbeafe'
        };color:${
          i.severity === 'CRITICAL' ? '#dc2626' : i.severity === 'WARNING' ? '#92400e' : '#1d4ed8'
        }">${i.severity}</span>
        &nbsp;[${i.check}] ${i.message}
      </td>
    </tr>`
  ).join('');

  const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f9f9f9">
<div style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.1)">
  <div style="background:#0B1628;padding:20px 24px;display:flex;align-items:center;gap:12px">
    <div style="font-size:14px;color:rgba(255,255,255,0.5);letter-spacing:0.1em;text-transform:uppercase;font-weight:500">
      ${isWeekly ? 'Weekly' : 'Manual'} Health Report
    </div>
  </div>
  <div style="padding:24px">
    <div style="display:flex;align-items:center;gap:20px;margin-bottom:20px">
      <div style="width:72px;height:72px;border-radius:50%;background:conic-gradient(${scoreClr} ${score}%,#e5e7eb 0);display:flex;align-items:center;justify-content:center">
        <div style="width:54px;height:54px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:${scoreClr}">${score}</div>
      </div>
      <div>
        <div style="font-size:20px;font-weight:600;color:#111">${icon} ${status.charAt(0).toUpperCase() + status.slice(1)}</div>
        <div style="font-size:12px;color:#888;margin-top:3px">${ts}</div>
      </div>
      <div style="margin-left:auto;display:flex;gap:16px;text-align:center">
        <div><div style="font-size:22px;font-weight:700;color:#dc2626">${critical_count}</div><div style="font-size:10px;color:#888">Critical</div></div>
        <div><div style="font-size:22px;font-weight:700;color:#d97706">${warning_count}</div><div style="font-size:10px;color:#888">Warning</div></div>
      </div>
    </div>
    <p style="font-size:13px;color:#444;margin:0 0 16px">${summary}</p>
    ${top_issues && top_issues.length ? `
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
      <thead><tr><th style="text-align:left;padding:6px 10px;font-size:11px;color:#888;border-bottom:2px solid #eee">#</th><th style="text-align:left;padding:6px 10px;font-size:11px;color:#888;border-bottom:2px solid #eee">Top Issues</th></tr></thead>
      <tbody>${issueRows}</tbody>
    </table>` : '<p style="font-size:13px;color:#16a34a">✅ No significant issues found.</p>'}
    <a href="https://pegasuscapitalnetwork.com/admin.html" style="display:inline-block;background:#0B1628;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:500">Open Admin Console →</a>
  </div>
  <div style="padding:14px 24px;background:#f5f5f5;font-size:11px;color:#aaa">
    Pegasus Lenders Group LLC — Internal Platform Health Monitor. Admin only.
  </div>
</div></body></html>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Pegasus Admin <noreply@pegasuslendersgroup.com>',
        to: [toEmail],
        subject: `${icon} Pegasus ${isWeekly ? 'Weekly' : ''} Health: ${status.toUpperCase()} — Score ${score}/100`,
        html,
        text: `Pegasus ${isWeekly ? 'Weekly' : ''} Health Report\n${ts}\n\n${summary}\n\nTop Issues:\n${(top_issues || []).map((i, n) => `${n + 1}. [${i.severity}] [${i.check}] ${i.message}`).join('\n')}\n\nAdmin: https://pegasuscapitalnetwork.com/admin.html`,
      }),
    });
    if (res.ok) return { sent: true, to: toEmail };
    const err = await res.text().catch(() => res.status);
    console.error('[health-core] email error:', err);
    return { sent: false, error: err };
  } catch (e) {
    console.error('[health-core] email threw:', e.message);
    return { sent: false, error: e.message };
  }
}

/* ════════════════════════════════════════════════════════════
   SEND TELEGRAM
   Short summary message. Only fires for degraded/critical or on schedule.
   ════════════════════════════════════════════════════════════ */
async function sendTelegram(report) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId   = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return { sent: false, reason: 'Not configured' };

  const { score, status, critical_count, warning_count, top_issues, source } = report;
  const icon    = status === 'healthy' ? '✅' : status === 'degraded' ? '⚠️' : '🔴';
  const topLine = (top_issues || []).filter(i => i.severity === 'CRITICAL').slice(0, 2)
    .map(i => `• [${i.check}] ${i.message.slice(0, 80)}`).join('\n');

  const text = [
    `${icon} *Pegasus ${source === 'scheduled' ? 'Weekly ' : ''}Health Check*`,
    `Status: *${status.toUpperCase()}* — Score: *${score}/100*`,
    `Critical: ${critical_count}  |  Warnings: ${warning_count}`,
    topLine ? `\n*Top Issues:*\n${topLine}` : '',
    `\n🔗 [Open Admin Console](https://pegasuscapitalnetwork.com/admin.html)`,
  ].filter(Boolean).join('\n');

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', disable_web_page_preview: true }),
    });
    if (res.ok) return { sent: true };
    const err = await res.text().catch(() => res.status);
    console.error('[health-core] telegram error:', err);
    return { sent: false, error: err };
  } catch (e) {
    return { sent: false, error: e.message };
  }
}

module.exports = { runAllChecks, saveReport, sendEmail, sendTelegram };
