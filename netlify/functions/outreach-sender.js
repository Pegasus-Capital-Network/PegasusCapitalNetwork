// ============================================================================
// PEGASUS NETWORK — Global outreach sender (scheduled, hourly)
// netlify/functions/outreach-sender.js
//
// Sends ONE personalized, plain-text invitation per queued inbox in
// pn_invite_consent (source from pn_settings 'outreach_global'), at a ramped
// daily cap inside a UTC send window. Server-side only (service_role + Resend
// REST) — no per-email approvals.
//
// Safety:
//   * Before each run it checks the delivery status of recently sent emails in
//     Resend (GET /emails/:id) and records bounced/complained. If the bounce
//     rate exceeds max_bounce_rate (after min_sample sends) or complaints exceed
//     max_complaints, it sets paused=true in pn_settings and stops.
//   * Only rows with status='invited' and never sent; opt-outs are never mailed.
//   * Direct inboxes get a /yes?t= consent link (POST-confirmed, scanner-proof);
//     shared/general inboxes never get a consent link (no account for info@).
//
//   * Rows carrying metadata.award (ranked lenders, written at queue time only
//     when the inbox's domain matches the lender's own website) get the ranking
//     / Top Lenders 2025 email with their place instead of the general invite.
//
// Settings (pn_settings.key='outreach_global', jsonb):
//   { source, priority_sources:[...], paused, start_date:'YYYY-MM-DD',
//     ramp:[{from_day,cap}], send_hours_utc:[start,end), max_bounce_rate,
//     max_complaints, min_sample, company_spacing_days }
//   priority_sources are sent before source; the daily cap, health checks and
//   company spacing cover all of them together.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PEGASUS_RESEND_API_KEY
// ============================================================================
"use strict";

const ORIGIN = "https://pegasuscapitalnetwork.com";
const FROM = "Pegasus Capital Network <invites@pegasuscapitalnetwork.com>";
const REPLY_TO = "info@pegasuscapitalnetwork.com";
const ADDRESS = "Pegasus Capital Network · 150 E Olive Ave, Unit 112, Burbank, CA 91502";
const SETTINGS_KEY = "outreach_global";
const MAX_STATUS_CHECKS = 40;   // per run (Resend rate limit 10 req/s)
const MAX_SENDS_PER_RUN = 20;   // keeps a run well inside the 30 s limit

function need(name){ const v = process.env[name]; if(!v) throw new Error("Missing env "+name); return v; }
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));

async function sb(path, opts){
  const url = need("SUPABASE_URL").replace(/\/$/,"");
  const key = need("SUPABASE_SERVICE_ROLE_KEY");
  const h = Object.assign({ apikey:key, Authorization:"Bearer "+key, "Content-Type":"application/json", Accept:"application/json" }, (opts&&opts.headers)||{});
  const res = await fetch(url+path, Object.assign({}, opts, { headers:h }));
  if(!res.ok){ const t=await res.text().catch(()=> ""); throw new Error(path.split("?")[0]+" "+res.status+" "+t.slice(0,160)); }
  if(res.status===204) return null;
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}
async function count(path){
  const url = need("SUPABASE_URL").replace(/\/$/,""), key = need("SUPABASE_SERVICE_ROLE_KEY");
  const res = await fetch(url+path, { method:"HEAD", headers:{ apikey:key, Authorization:"Bearer "+key, Prefer:"count=exact" } });
  const m = String(res.headers.get("content-range")||"").match(/\/(\d+)$/);
  return m ? parseInt(m[1],10) : 0;
}
function resendKey(){ const k = process.env.PEGASUS_RESEND_API_KEY || process.env.RESEND_API_KEY; if(!k) throw new Error("Missing PEGASUS_RESEND_API_KEY"); return k; }

async function loadSettings(){
  const rows = await sb("/rest/v1/pn_settings?select=value&key=eq."+SETTINGS_KEY+"&limit=1");
  return (rows && rows[0] && rows[0].value) || null;
}
async function saveSettings(s){
  await sb("/rest/v1/pn_settings?key=eq."+SETTINGS_KEY, { method:"PATCH", headers:{ Prefer:"return=minimal" }, body: JSON.stringify({ value:s, updated_at:new Date().toISOString() }) });
}
function capFor(s, now){
  const start = new Date((s.start_date||"2100-01-01")+"T00:00:00Z");
  if(now < start) return 0;
  const day = Math.floor((now - start)/864e5);
  let cap = 0;
  for(const r of (s.ramp||[])){ if(day >= (r.from_day||0)) cap = r.cap||0; }
  return cap;
}

// ── Delivery feedback: record bounced/complained for recent sends ──────────
function srcFilter(sources){ return "source=in.("+sources.map(encodeURIComponent).join(",")+")"; }
async function checkDeliveries(sources){
  const since = new Date(Date.now()-72*3600e3).toISOString();
  const rows = await sb("/rest/v1/pn_invite_consent?select=id,resend_id,delivery_status&"+srcFilter(sources)+
    "&resend_id=not.is.null&last_sent_at=gte."+encodeURIComponent(since)+
    "&or=(delivery_status.is.null,delivery_status.in.(queued,sent,delivery_delayed,scheduled))&order=delivery_checked_at.asc.nullsfirst&limit="+MAX_STATUS_CHECKS);
  let checked = 0;
  for(const r of (rows||[])){
    try{
      const res = await fetch("https://api.resend.com/emails/"+encodeURIComponent(r.resend_id), { headers:{ Authorization:"Bearer "+resendKey() } });
      if(!res.ok) continue;
      const j = await res.json();
      const ev = String(j.last_event||"").toLowerCase() || null;
      const patch = { delivery_status: ev, delivery_checked_at: new Date().toISOString() };
      // A bounce or complaint ends all contact with this address.
      if(ev==="bounced" || ev==="complained") patch.status = "opted_out", patch.opted_out_at = new Date().toISOString();
      await sb("/rest/v1/pn_invite_consent?id=eq."+r.id, { method:"PATCH", headers:{ Prefer:"return=minimal" }, body: JSON.stringify(patch) });
      checked++;
    }catch(_){}
    await sleep(120);
  }
  const src = srcFilter(sources);
  const [sent, bounced, complained] = await Promise.all([
    count("/rest/v1/pn_invite_consent?select=id&"+src+"&resend_id=not.is.null"),
    count("/rest/v1/pn_invite_consent?select=id&"+src+"&delivery_status=eq.bounced"),
    count("/rest/v1/pn_invite_consent?select=id&"+src+"&delivery_status=eq.complained")
  ]);
  return { checked, sent, bounced, complained };
}

// ── Message ────────────────────────────────────────────────────────────────
function firstName(r){ const m=r.metadata||{}; const f=String(m.first_name||"").trim(); return f || String(r.full_name||"").trim().split(/\s+/)[0] || ""; }
function whyLine(r){
  const m = r.metadata||{}, co = r.company||"your company", cat = String(m.cat_label||"").toLowerCase();
  const us = /united states/i.test(r.state||"") || /^[A-Z]{2}$/.test(String(m.state_code||""));
  const abroad = us ? "" : " The network is U.S.-based and is starting to welcome developers, lenders, and capital partners from outside the U.S.";
  if(/lender|credit|broker/.test(cat)) return "Lenders and credit funds like "+co+" sit at the center of the network — developers and sponsors here are looking for financing partners."+abroad;
  if(/invest/.test(cat)) return "Investment firms like "+co+" are exactly who our developers, lenders, and sponsors want to meet."+abroad;
  return "Developers like "+co+" are exactly who our lenders and capital partners want to meet."+abroad;
}
const fmtInt = (n)=>Math.round(Number(n)).toLocaleString("en-US");
function fmtUsdLong(n){
  const v = Number(n); if(!Number.isFinite(v) || v<=0) return "";
  if(v>=1e9) return "$"+(v/1e9).toFixed(1)+" billion";
  if(v>=1e6) return "$"+(v/1e6).toFixed(1)+" million";
  return "$"+fmtInt(v);
}
// Ranked lender: tell them their place. metadata.award =
//   { rank, volume_usd, count, labels:["Top 100 U.S. Mortgage Lenders 2025 (#46)", …],
//     verify_domain } — labels empty when ranked but not an award honoree.
// Campaign tag on links to public pages (never on /yes or /unsubscribe, which
// carry the token), so site analytics (migration 101) can attribute visits.
function utm(url, r){ return url+(url.indexOf("?")>=0?"&":"?")+"utm_source=email&utm_medium=outreach&utm_campaign="+encodeURIComponent(r.source||"outreach"); }
function buildAwardEmail(r, footer, unsub){
  const m = r.metadata||{}, a = m.award||{}, co = r.company||"your company";
  const slug = m.presence_slug, rank = fmtInt(a.rank);
  const labels = Array.isArray(a.labels) ? a.labels.filter(Boolean) : [];
  const vol = fmtUsdLong(a.volume_usd), cnt = Number(a.count)>0 ? fmtInt(a.count) : "";
  const greet = m.mailbox==="direct" && firstName(r) ? "Hi "+firstName(r)+"," : "Hello,";
  const fact = "In 2025, "+co+" originated "+(vol||"its mortgage volume")+(cnt?" across "+cnt+" loans":"")+
    ", according to public Home Mortgage Disclosure Act (HMDA) data. That places it #"+rank+" among U.S. mortgage lenders by origination volume.";
  const claim = co+" also has a free page on Pegasus Capital Network: "+utm(ORIGIN+"/business/"+slug, r)+"\n"+
    "Anyone on your team can claim it and keep the details current"+(a.verify_domain ? ". Sign in with an @"+a.verify_domain+" email address and the claim is verified instantly" : "")+":\n"+
    utm(ORIGIN+"/claim?presence="+encodeURIComponent(slug), r);
  const about = "Pegasus Capital Network (pegasuscapitalnetwork.com) is a professional network for real estate developers, lenders, brokers, and capital partners. The ranking reflects 2025 origination volume reported under HMDA, aggregated by Pegasus; it is not a paid listing.";
  let subject, body;
  if(labels.length){
    subject = co+" named to Pegasus Top Lenders 2025 (#"+rank+")";
    body = greet+"\n\nCongratulations — "+co+" has been named to Pegasus Top Lenders 2025, our recognition of the largest U.S. mortgage lenders:\n"+
      labels.map(l=>"  • "+l).join("\n")+"\n\n"+fact+"\n\n"+
      "Your honoree page has the official award badge for your website and a ready-to-use press release:\n"+utm(ORIGIN+"/awards/top-lenders-2025/"+encodeURIComponent(slug), r)+"\n"+
      "The badge and press materials are free to use. No membership or payment is required.\n\n"+claim+"\n\n"+about+"\n\n"+footer;
  } else {
    subject = co+" ranked #"+rank+" among U.S. mortgage lenders (2025)";
    body = greet+"\n\n"+fact+"\n\n"+
      "The full ranking and a free \"Ranked by Pegasus\" badge for your website are here:\n"+utm(ORIGIN+"/rankings/badge/"+encodeURIComponent(slug), r)+"\n\n"+claim+"\n\n"+about+"\n\n"+footer;
  }
  return { subject, text: body, unsub };
}
function buildEmail(r){
  const m = r.metadata||{};
  const page = m.presence_slug ? utm(ORIGIN+"/business/"+m.presence_slug, r) : null;
  const unsub = ORIGIN+"/unsubscribe?t="+r.token;
  const domain = m.source_domain || String(r.email.split("@")[1]||"");
  const intro = "I'm reaching out from Pegasus Capital Network (pegasuscapitalnetwork.com), a professional network for real estate developers, lenders, brokers, and capital partners. Our directory covers more than 2,400 companies in more than 80 countries, including the largest U.S. mortgage lenders, ranked by 2025 origination volume, and members share deals, projects, market views, and events in a shared network feed.";
  const pageLine = page ? "We've added a page for "+r.company+", based on the public information on your website: "+page+" — it's free to claim and manage." : "";
  const footer = "Best regards,\nPegasus Capital Network\n\nYou are receiving this one-time note because this address is published on "+domain+" as a business contact. We will not follow up unless you reply.\n"+ADDRESS+"\nUnsubscribe: "+unsub;
  if(m.award && Number(m.award.rank) >= 1 && m.presence_slug) return buildAwardEmail(r, footer, unsub);
  let subject, text;
  if(m.mailbox === "direct"){
    const f = firstName(r);
    subject = (r.company ? r.company+" on " : "")+"Pegasus Capital Network";
    text = "Hi "+(f||"there")+",\n\n"+intro+"\n\n"+whyLine(r)+"\n\n"+(pageLine?pageLine+"\n\n":"")+
      "If you'd like, we can also set up a free personal profile for you. Confirm here and we'll email you a private link to review it (nothing goes live until you approve it):\n"+ORIGIN+"/yes?t="+r.token+"\n\nNot interested? Simply ignore this email.\n\n"+footer;
  } else {
    const name = String(r.full_name||"").trim(), title = String(m.title||"").trim();
    subject = (name ? "For "+name+" — " : "")+(r.company||"Your company")+" on Pegasus Capital Network";
    text = "Hello,\n\n"+(name ? "Could you please pass this note to "+name+(title?", "+title:"")+"? Thank you.\n\n"+firstName(r)+" — " : "")+intro+"\n\n"+whyLine(r)+"\n\n"+(pageLine?pageLine+"\n\n":"")+
      "Prefer a personal profile? Create one for free: "+utm(ORIGIN+"/signup.html", r)+" — or simply reply to this email.\n\n"+footer;
  }
  return { subject, text, unsub };
}
async function send(r){
  const { subject, text, unsub } = buildEmail(r);
  const res = await fetch("https://api.resend.com/emails", {
    method:"POST",
    headers:{ Authorization:"Bearer "+resendKey(), "Content-Type":"application/json", "Idempotency-Key":"outreach-"+r.id },
    body: JSON.stringify({ from:FROM, to:[r.email], reply_to:REPLY_TO, subject, text,
      headers:{ "List-Unsubscribe":"<"+unsub+">", "List-Unsubscribe-Post":"List-Unsubscribe=One-Click" },
      tags:[{ name:"campaign", value:String(r.source||"outreach").replace(/[^a-zA-Z0-9_-]/g,"_") }] })
  });
  if(!res.ok){ const t=await res.text().catch(()=> ""); throw new Error("resend "+res.status+" "+t.slice(0,160)); }
  const j = await res.json();
  return j.id || null;
}

exports.handler = async () => {
  const out = { ran:false, reason:null, sent:0, failed:0, cap:0, sent_today:0, health:null, errors:[] };
  try{
    const s = await loadSettings();
    if(!s || !s.source){ out.reason="no settings"; return done(out); }
    const sources = [...new Set([].concat(s.priority_sources||[], s.source).filter(x=>/^[a-z0-9_-]+$/i.test(String(x||""))))];
    out.health = await checkDeliveries(sources);
    const h = out.health;
    const minSample = s.min_sample||40;
    if(!s.paused && h.sent >= minSample && h.bounced/h.sent > (s.max_bounce_rate||0.05)){
      s.paused = true; s.paused_reason = "bounce rate "+(100*h.bounced/h.sent).toFixed(1)+"% over "+h.sent+" sends"; s.paused_at = new Date().toISOString();
      await saveSettings(s);
    }
    if(!s.paused && h.complained > (s.max_complaints==null?1:s.max_complaints)){
      s.paused = true; s.paused_reason = h.complained+" spam complaints"; s.paused_at = new Date().toISOString();
      await saveSettings(s);
    }
    if(s.paused){ out.reason="paused: "+(s.paused_reason||"manual"); return done(out); }

    const now = new Date();
    const [hStart, hEnd] = s.send_hours_utc || [14,22];
    const hr = now.getUTCHours();
    if(hr < hStart || hr >= hEnd){ out.reason="outside send window"; return done(out); }
    out.cap = capFor(s, now);
    if(!out.cap){ out.reason="not started"; return done(out); }
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
    out.sent_today = await count("/rest/v1/pn_invite_consent?select=id&"+srcFilter(sources)+"&last_sent_at=gte."+encodeURIComponent(dayStart));
    const remaining = Math.max(0, out.cap - out.sent_today);
    const runsLeft = Math.max(1, hEnd - hr);
    const quota = Math.min(MAX_SENDS_PER_RUN, Math.ceil(remaining / runsLeft));
    if(!quota){ out.reason="daily cap reached"; return done(out); }

    // Never mail several colleagues at one company close together — it reads as
    // a blast and invites complaints. At most one invitation per company per
    // company_spacing_days (default 3); later colleagues wait their turn.
    const spacingDays = s.company_spacing_days==null ? 3 : s.company_spacing_days;
    const coKey = (r)=>String(r.company||r.email.split("@")[1]||"").trim().toLowerCase();
    const recent = await sb("/rest/v1/pn_invite_consent?select=company,email&"+srcFilter(sources)+
      "&last_sent_at=gte."+encodeURIComponent(new Date(Date.now()-spacingDays*864e5).toISOString())+"&limit=2000");
    const busy = new Set((recent||[]).map(coKey));
    // Companies whose pages already get real visitors go first: they are the
    // warmest prospects (and see "viewed N times" on their page).
    let viewedFirst = [];
    try{
      const viewed = await sb("/rest/v1/rpc/outreach_viewed_slugs", { method:"POST", body: JSON.stringify({ p_days:30, p_limit:150 }) });
      const slugs = (viewed||[]).map(v=>String(v.slug||"")).filter(x=>/^[a-z0-9][a-z0-9-]*$/.test(x));
      if(slugs.length){
        viewedFirst = await sb("/rest/v1/pn_invite_consent?select=id,token,email,full_name,company,state,source,metadata&source=eq."+encodeURIComponent(s.source)+
          "&status=eq.invited&last_sent_at=is.null&metadata->>presence_slug=in.("+slugs.join(",")+")&order=priority.asc.nullslast,created_at.asc&limit=200") || [];
        const rank = new Map(slugs.map((x,i)=>[x,i]));
        viewedFirst.sort((a,b)=>(rank.get((a.metadata||{}).presence_slug)??999)-(rank.get((b.metadata||{}).presence_slug)??999));
      }
    }catch(_){ viewedFirst = []; }
    out.viewed_candidates = viewedFirst.length;
    // Priority campaigns (e.g. Top Lenders award notices) go before everything else.
    let priority = [];
    for(const ps of sources.filter(x=>x!==s.source)){
      const got = await sb("/rest/v1/pn_invite_consent?select=id,token,email,full_name,company,state,source,metadata&source=eq."+encodeURIComponent(ps)+
        "&status=eq.invited&last_sent_at=is.null&order=priority.asc.nullslast,created_at.asc&limit=200");
      priority = priority.concat(got||[]);
    }
    out.priority_candidates = priority.length;
    const regular = await sb("/rest/v1/pn_invite_consent?select=id,token,email,full_name,company,state,source,metadata&source=eq."+encodeURIComponent(s.source)+
      "&status=eq.invited&last_sent_at=is.null&order=priority.asc.nullslast,created_at.asc&limit=500");
    const seenIds = new Set(priority.concat(viewedFirst).map(r=>r.id));
    const candidates = priority.concat(viewedFirst).concat((regular||[]).filter(r=>!seenIds.has(r.id)));
    const rows = [];
    for(const r of (candidates||[])){
      if(rows.length >= quota) break;
      const k = coKey(r);
      if(busy.has(k)) continue;
      busy.add(k); rows.push(r);
    }
    out.ran = true;
    for(const r of (rows||[])){
      try{
        const id = await send(r);
        await sb("/rest/v1/pn_invite_consent?id=eq."+r.id, { method:"PATCH", headers:{ Prefer:"return=minimal" },
          body: JSON.stringify({ last_sent_at:new Date().toISOString(), send_count:1, resend_id:id, delivery_status:"sent" }) });
        out.sent++;
      }catch(e){
        out.failed++; out.errors.push(String(r.email).replace(/(^.).*(@.*$)/,"$1***$2")+": "+(e&&e.message||String(e)));
        const msg = String(e&&e.message);
        // Rate-limited or auth/quota problem: stop this run, retry next hour.
        if(/resend (429|401|403)/.test(msg)) break;
        // Address rejected by Resend validation (422): never retry this row.
        if(/resend 422/.test(msg)){
          await sb("/rest/v1/pn_invite_consent?id=eq."+r.id, { method:"PATCH", headers:{ Prefer:"return=minimal" },
            body: JSON.stringify({ last_sent_at:new Date().toISOString(), delivery_status:"rejected" }) }).catch(()=>{});
        }
      }
      await sleep(200);
    }
  }catch(e){ out.errors.push("fatal: "+(e&&e.message||String(e))); }
  return done(out);
};
function done(out){
  console.log("[outreach-sender]", JSON.stringify(out));
  return { statusCode:200, headers:{ "Content-Type":"application/json" }, body: JSON.stringify(out) };
}

// Exposed for local template checks only.
exports._buildEmail = buildEmail;
