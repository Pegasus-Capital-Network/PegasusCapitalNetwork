// PEGASUS NETWORK — Profile-completion reminder (scheduled, daily)
//
// Members who registered 1–21 days ago and never finished onboarding get ONE
// email asking them to complete their profile; completion_reminded_at marks
// them so they are never emailed again. Admins, internal addresses and
// members who opted out of email (digest_opt_out) are skipped.
// A profile is marked only after Resend accepted its message.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PEGASUS_RESEND_API_KEY
// Schedule: netlify.toml [functions."profile-reminder"]

const FROM = "Pegasus Capital Network <hello@pegasuscapitalnetwork.com>";
const REPLY_TO = "info@pegasuscapitalnetwork.com";
const SUBJECT = "Finish setting up your Pegasus profile";
const MAX_PER_RUN = 50;

function need(name){ const v = process.env[name]; if(!v) throw new Error("Missing env "+name); return v; }
async function sb(path, opts){
  const url = need("SUPABASE_URL").replace(/\/$/,"");
  const key = need("SUPABASE_SERVICE_ROLE_KEY");
  const h = Object.assign({ apikey:key, Authorization:"Bearer "+key, "Content-Type":"application/json", Accept:"application/json" }, (opts&&opts.headers)||{});
  const res = await fetch(url+path, Object.assign({}, opts, { headers:h, signal:AbortSignal.timeout(8000) }));
  if(!res.ok){ const t=await res.text().catch(()=> ""); throw new Error(path.split("?")[0]+" "+res.status+" "+t.slice(0,160)); }
  if(res.status===204) return null;
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}
function resendKey(){ const k = process.env.PEGASUS_RESEND_API_KEY || process.env.RESEND_API_KEY; if(!k) throw new Error("Missing PEGASUS_RESEND_API_KEY"); return k; }
function esc(s){ return String(s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function firstName(full){ const f = String(full||"").trim().split(/\s+/)[0] || ""; return f.length>=2 && f.length<=40 && !/@/.test(f) ? f : "there"; }

function html(name){
  return '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:24px 0"><tr><td align="center"><table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e6e9ed;border-radius:12px;font-family:Inter,Arial,sans-serif;color:#2a3a4e">'+
    '<tr><td style="padding:28px 30px 8px"><div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#9a7b3f;font-weight:700">Pegasus Capital Network</div><h1 style="font-size:20px;color:#0e1824;margin:12px 0 0">Hi '+esc(name)+', your profile is still empty</h1></td></tr>'+
    '<tr><td style="padding:10px 30px 0;font-size:15px;line-height:1.6;color:#46525f">You created a Pegasus account, which is the hard part. A completed profile is what lets the right lenders, borrowers and capital partners actually find you and reach out. It takes about a minute.</td></tr>'+
    '<tr><td style="padding:22px 30px 6px"><a href="https://pegasuscapitalnetwork.com/profile-edit.html?utm_source=email&amp;utm_medium=lifecycle&amp;utm_campaign=profile_reminder" style="display:inline-block;background:#1b3a5b;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:9px">Complete your profile &rarr;</a></td></tr>'+
    '<tr><td style="padding:20px 30px 28px;font-size:14px;line-height:1.6;color:#46525f">Anatoliy Kanevsky<br>Pegasus Capital Network · Los Angeles<br><span style="font-size:12px;color:#9aa4b0">You are receiving this once because you created a Pegasus account.</span></td></tr>'+
    '</table></td></tr></table>';
}
function text(name){
  return "Hi "+name+",\n\nYou created a Pegasus account, which is the hard part. A completed profile is what lets the right lenders, borrowers and capital partners actually find you and reach out. It takes about a minute:\nhttps://pegasuscapitalnetwork.com/profile-edit.html\n\nAnatoliy Kanevsky\nPegasus Capital Network · Los Angeles\n\nYou are receiving this once because you created a Pegasus account.";
}

exports.handler = async () => {
  const out = { eligible:0, sent:0, marked:0, errors:[] };
  try{
    // Eligibility lives in SQL (migration 102): 1–21 days old, onboarding not
    // complete, never reminded, not opted out, not an admin.
    const rows = (await sb("/rest/v1/rpc/profile_reminder_candidates", { method:"POST", body: JSON.stringify({ p_limit: MAX_PER_RUN }) }) || [])
      .filter(r => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(r.email||"").trim()) && !/@pegasuscapitalnetwork\.com$/i.test(String(r.email)));
    out.eligible = rows.length;
    if(!rows.length){ console.log("[profile-reminder]", JSON.stringify(out)); return { statusCode:200, body:JSON.stringify(out) }; }

    const batch = rows.map(r => { const n = firstName(r.full_name); return {
      from: FROM, to: [String(r.email).trim()], reply_to: REPLY_TO, subject: SUBJECT, html: html(n), text: text(n),
      tags: [{ name:"campaign", value:"profile_reminder" }] }; });
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization:"Bearer "+resendKey(), "Content-Type":"application/json", "Idempotency-Key":"profile-reminder-"+rows.map(r=>r.id).join(",").slice(0,200) },
      body: JSON.stringify(batch), signal: AbortSignal.timeout(15000)
    });
    const j = await res.json().catch(()=>null);
    if(!res.ok || !j || !Array.isArray(j.data)) throw new Error("resend batch "+res.status+" "+JSON.stringify(j).slice(0,200));
    // Batch results come back in request order; mark only accepted messages.
    const sentIds = rows.filter((r,i) => j.data[i] && j.data[i].id).map(r => r.id);
    out.sent = sentIds.length;
    if(sentIds.length){
      const upd = await sb("/rest/v1/profiles?id=in.("+sentIds.join(",")+")&completion_reminded_at=is.null", {
        method:"PATCH", headers:{ Prefer:"return=representation" }, body: JSON.stringify({ completion_reminded_at: new Date().toISOString() }) });
      out.marked = Array.isArray(upd) ? upd.length : 0;
    }
  }catch(e){ out.errors.push(String(e && e.message || e)); }
  console.log("[profile-reminder]", JSON.stringify(out));
  return { statusCode: out.errors.length ? 500 : 200, body: JSON.stringify(out) };
};
