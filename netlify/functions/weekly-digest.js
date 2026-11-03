// ============================================================================
// PEGASUS NETWORK — Weekly digest (scheduled)
// netlify/functions/weekly-digest.js
//
// "What's new in the network this week" to every active member who has not
// opted out: new members (public fields only), the most-liked feed posts,
// upcoming events, and a one-line network snapshot. Skips the send entirely
// when nothing happened (no new members, posts, or events).
//
// Runs weekly (see netlify.toml). Server-side only: service_role + Resend REST.
// Opt-out: /unsubscribe?e=<email>&digest=1 → profiles.digest_opt_out = true.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PEGASUS_RESEND_API_KEY
// ============================================================================
"use strict";

const ORIGIN = "https://pegasuscapitalnetwork.com";
const FROM = "Pegasus Capital Network <digest@pegasuscapitalnetwork.com>";
const REPLY_TO = "info@pegasuscapitalnetwork.com";
const ADDRESS = "Pegasus Capital Network · 150 E Olive Ave, Unit 112, Burbank, CA 91502";
const SYSTEM_ACCOUNT = "ed5ef0c9-d6d6-4a6d-86cb-8c093225956c"; // official network account — never emailed
const MAX_RECIPIENTS = 500;

function need(name){ const v = process.env[name]; if(!v) throw new Error("Missing env "+name); return v; }
function esc(v){return String(v==null?"":v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function trunc(s,n){ s=String(s||"").replace(/\s+/g," ").trim(); return s.length<=n?s:s.slice(0,n-1).replace(/\s+\S*$/,"")+"…"; }
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));

async function sb(path, opts){
  const url = need("SUPABASE_URL").replace(/\/$/,"");
  const key = need("SUPABASE_SERVICE_ROLE_KEY");
  const h = Object.assign({ apikey:key, Authorization:"Bearer "+key, "Content-Type":"application/json", Accept:"application/json" }, (opts&&opts.headers)||{});
  const res = await fetch(url+path, Object.assign({}, opts, { headers:h }));
  if(!res.ok){ const t=await res.text().catch(()=> ""); throw new Error(path.split("?")[0]+" "+res.status+" "+t.slice(0,160)); }
  return res.json();
}
async function rpc(fn, body){ return sb("/rest/v1/rpc/"+fn, { method:"POST", body: JSON.stringify(body||{}) }); }
// Exact row count without fetching rows (PostgREST content-range).
async function count(path){
  const url = need("SUPABASE_URL").replace(/\/$/,""), key = need("SUPABASE_SERVICE_ROLE_KEY");
  const res = await fetch(url+path, { method:"HEAD", headers:{ apikey:key, Authorization:"Bearer "+key, Prefer:"count=exact" } });
  const m = String(res.headers.get("content-range")||"").match(/\/(\d+)$/);
  return m ? parseInt(m[1],10) : null;
}

function profileHref(p){ return p.profile_slug ? ORIGIN+"/u/"+encodeURIComponent(p.profile_slug) : ORIGIN+"/public-profile.html?id="+encodeURIComponent(p.id||p.user_id||""); }
function fmtWhen(ts){ try{ return new Date(ts).toLocaleString("en-US",{weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZone:"America/Los_Angeles"})+" PT"; }catch(_){ return ""; } }

async function gather(){
  const since = new Date(Date.now()-7*864e5).toISOString();
  const [members, posts, events, nMembers, nPages, nPosts] = await Promise.all([
    sb("/rest/v1/profiles?select=id,full_name,professional_title,headline,company_name,location,profile_slug,created_at&deleted_at=is.null&full_name=not.is.null&created_at=gte."+encodeURIComponent(since)+"&id=neq."+SYSTEM_ACCOUNT+"&order=created_at.desc&limit=12"),
    rpc("get_network_feed", { p_limit: 50 }),
    rpc("get_upcoming_events", { p_limit: 5 }),
    count("/rest/v1/profiles?select=id&deleted_at=is.null").catch(()=>null),
    count("/rest/v1/public_business_directory?select=id").catch(()=>null),
    count("/rest/v1/member_signals?select=id").catch(()=>null)
  ]);
  const weekPosts = (posts||[]).filter(p => p.created_at >= since).sort((a,b)=>(b.like_count||0)-(a.like_count||0)||(b.created_at>a.created_at?1:-1)).slice(0,5);
  const totals = (nMembers!=null && nPages!=null && nPosts!=null) ? { members_total:nMembers, public_pages:nPages, feed_posts:nPosts } : null;
  return { members: members||[], posts: weekPosts, events: (events||[]).slice(0,5), totals, since };
}

function html(first, d, unsub){
  const h2 = (t)=>'<p style="margin:26px 0 10px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#697386;font-family:Arial,Helvetica,sans-serif;">'+esc(t)+'</p>';
  const row = (inner)=>'<div style="padding:10px 0;border-top:1px solid #eef1f4;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#172033;">'+inner+'</div>';
  let body = '';
  if(d.members.length){
    body += h2("New in the network");
    body += d.members.map(m => row('<a href="'+esc(profileHref(m))+'" style="color:#172033;font-weight:bold;text-decoration:none;">'+esc(m.full_name)+'</a>'+
      (m.professional_title||m.headline||m.company_name ? '<span style="color:#5b6573;"> — '+esc([m.professional_title||m.headline, m.company_name].filter(Boolean).join(" · "))+'</span>' : '')+
      (m.location ? '<span style="color:#8a97a8;"> · '+esc(m.location)+'</span>' : ''))).join("");
  }
  if(d.posts.length){
    body += h2("Most noticed this week");
    body += d.posts.map(p => row('<a href="'+esc(ORIGIN+"/feed/post/"+p.id)+'" style="color:#172033;font-weight:bold;text-decoration:none;">'+esc(p.title||trunc(p.content,70))+'</a>'+
      '<div style="color:#5b6573;font-size:13px;margin-top:2px;">'+esc(p.author_name)+(p.author_company?' · '+esc(p.author_company):'')+(p.like_count?' · ♥ '+p.like_count:'')+'</div>'+
      (p.title?'<div style="color:#3f4a5a;font-size:13px;margin-top:4px;">'+esc(trunc(p.content,160))+'</div>':''))).join("");
  }
  if(d.events.length){
    body += h2("Upcoming events");
    body += d.events.map(e => row('<a href="'+esc(ORIGIN+"/feed/post/"+e.id)+'" style="color:#172033;font-weight:bold;text-decoration:none;">'+esc(e.title||"Event")+'</a>'+
      '<div style="color:#8e7020;font-size:13px;margin-top:2px;">'+esc(fmtWhen(e.event_at))+(e.event_location?' · '+esc(e.event_location):'')+'</div>'+
      '<div style="color:#5b6573;font-size:13px;">Hosted by '+esc(e.author_name)+(e.author_company?' · '+esc(e.author_company):'')+'</div>')).join("");
  }
  const t = d.totals;
  const snap = t ? '<p style="margin:26px 0 0;font-size:12px;color:#8a97a8;font-family:Arial,Helvetica,sans-serif;">Network snapshot: '+esc(t.members_total)+' members · '+esc(t.public_pages)+' company pages · '+esc(t.feed_posts)+' feed posts</p>' : '';
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>'+
  '<body style="margin:0;padding:0;background-color:#f4f6f8;">'+
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f6f8"><tr><td align="center" style="padding:24px 12px;">'+
  '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid #e4e7eb;border-radius:12px;">'+
  '<tr><td style="padding:32px 36px;font-family:Arial,Helvetica,sans-serif;color:#172033;">'+
  '<p style="margin:0 0 4px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#235fa6;">Pegasus Capital Network</p>'+
  '<p style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#172033;">This week in the network</p>'+
  '<p style="margin:0;font-size:15px;line-height:1.6;color:#172033;">Hi '+esc(first)+' — here is what moved this week.</p>'+
  body+snap+
  '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 0;"><tr><td align="center" bgcolor="#3a8fe8" style="background-color:#3a8fe8;border-radius:10px;">'+
  '<a href="'+esc(ORIGIN+"/feed")+'" style="display:inline-block;padding:12px 24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;">Open the Network Feed</a></td></tr></table>'+
  '<p style="margin:14px 0 0;font-size:13px;line-height:1.8;"><a href="'+esc(ORIGIN+"/share-studio.html?utm_source=email&utm_medium=digest&utm_campaign=member_activation")+'" style="color:#235fa6;font-weight:bold;text-decoration:none;">Share my profile</a> &nbsp;·&nbsp; <a href="'+esc(ORIGIN+"/dashboard.html?invite=1&utm_source=email&utm_medium=digest&utm_campaign=member_activation")+'" style="color:#235fa6;font-weight:bold;text-decoration:none;">Invite someone I trust</a></p>'+
  '<p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#5b6573;">Post what you are working on, a deal, a market view, or an event — it shows on your profile and to the whole network.</p>'+
  '<hr style="border:none;border-top:1px solid #e4e7eb;margin:24px 0 16px;">'+
  '<p style="margin:0;font-size:11px;line-height:1.5;color:#8a97a8;">'+esc(ADDRESS)+'<br>You receive this weekly digest as a Pegasus Capital Network member. <a href="'+esc(unsub)+'" style="color:#8a97a8;">Unsubscribe from the digest</a></p>'+
  '</td></tr></table></td></tr></table></body></html>';
}
function text(first, d, unsub){
  const lines = ["Hi "+first+" — this week in the Pegasus Capital Network:", ""];
  if(d.members.length){ lines.push("NEW IN THE NETWORK"); d.members.forEach(m=>lines.push("- "+m.full_name+(m.company_name?" · "+m.company_name:"")+" "+profileHref(m))); lines.push(""); }
  if(d.posts.length){ lines.push("MOST NOTICED THIS WEEK"); d.posts.forEach(p=>lines.push("- "+(p.title||trunc(p.content,70))+" — "+p.author_name+" "+ORIGIN+"/feed/post/"+p.id)); lines.push(""); }
  if(d.events.length){ lines.push("UPCOMING EVENTS"); d.events.forEach(e=>lines.push("- "+(e.title||"Event")+" · "+fmtWhen(e.event_at)+" "+ORIGIN+"/feed/post/"+e.id)); lines.push(""); }
  lines.push("Open the Network Feed: "+ORIGIN+"/feed", "Share my profile: "+ORIGIN+"/share-studio.html", "Invite someone I trust: "+ORIGIN+"/dashboard.html?invite=1", "", "— Pegasus Capital Network", ADDRESS, "Unsubscribe from the digest: "+unsub);
  return lines.join("\n");
}

async function send(to, first, d){
  const key = process.env.PEGASUS_RESEND_API_KEY || process.env.RESEND_API_KEY;
  if(!key) throw new Error("Missing PEGASUS_RESEND_API_KEY");
  const unsub = ORIGIN+"/unsubscribe?e="+encodeURIComponent(to)+"&digest=1";
  const res = await fetch("https://api.resend.com/emails", {
    method:"POST",
    headers:{ Authorization:"Bearer "+key, "Content-Type":"application/json" },
    body: JSON.stringify({
      from: FROM, to:[to], reply_to: REPLY_TO,
      subject: "This week in the Pegasus network",
      html: html(first, d, unsub), text: text(first, d, unsub),
      headers: { "List-Unsubscribe": "<"+unsub+">", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
    })
  });
  if(!res.ok){ const t=await res.text().catch(()=> ""); throw new Error("resend "+res.status+" "+t.slice(0,160)); }
}

exports.handler = async (event) => {
  const out = { skipped:false, recipients:0, sent:0, failed:0, errors:[] };
  try{
    const d = await gather();
    if(!d.members.length && !d.posts.length && !d.events.length){ out.skipped = true; out.reason = "nothing new this week"; console.log("[weekly-digest]", JSON.stringify(out)); return { statusCode:200, body: JSON.stringify(out) }; }
    // Recipients: active members with an email who have not opted out; never the
    // system account; never anyone who opted out of invitations.
    const [members, optedOut] = await Promise.all([
      sb("/rest/v1/profiles?select=id,email,full_name&deleted_at=is.null&email=not.is.null&digest_opt_out=eq.false&id=neq."+SYSTEM_ACCOUNT+"&order=created_at.asc&limit="+MAX_RECIPIENTS),
      sb("/rest/v1/pn_invite_consent?select=email&status=eq.opted_out&limit=5000").catch(()=>[])
    ]);
    const block = new Set((optedOut||[]).map(r=>String(r.email||"").toLowerCase()));
    // Optional dry run: POST {"test":"you@example.com"} sends only to that address.
    let test = null; try{ test = event && event.body ? (JSON.parse(event.body).test||null) : null; }catch(_){}
    const list = test ? [{ email:test, full_name:"there" }] : (members||[]).filter(m => m.email && m.email.indexOf("@")>0 && !block.has(String(m.email).toLowerCase()));
    out.recipients = list.length;
    for(const m of list){
      const first = String(m.full_name||"there").trim().split(/\s+/)[0] || "there";
      try{ await send(String(m.email).trim().toLowerCase(), first, d); out.sent++; }
      catch(e){ out.failed++; out.errors.push(String(m.email).replace(/(^.).*(@.*$)/,"$1***$2")+": "+(e&&e.message||String(e))); }
      await sleep(150);
    }
  }catch(e){ out.errors.push("fatal: "+(e&&e.message||String(e))); }
  console.log("[weekly-digest]", JSON.stringify(out));
  return { statusCode:200, headers:{ "Content-Type":"application/json" }, body: JSON.stringify(out) };
};
