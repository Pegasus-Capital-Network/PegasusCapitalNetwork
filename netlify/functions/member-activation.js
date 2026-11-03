// PEGASUS NETWORK — member activation lifecycle (scheduled, daily)
//
// New and existing real members receive three concise messages that put their
// profile to work: profile link, trusted-person invitation, and Share Studio.
// Migration 105 owns eligibility and deduplication. A send is recorded only
// after Resend accepts it. digest_opt_out suppresses all lifecycle messages.

"use strict";

const crypto = require("node:crypto");

const ORIGIN = "https://pegasuscapitalnetwork.com";
const FROM = "Pegasus Capital Network <hello@pegasuscapitalnetwork.com>";
const REPLY_TO = "info@pegasuscapitalnetwork.com";
const ADDRESS = "Pegasus Capital Network · 150 E Olive Ave, Unit 112, Burbank, CA 91502";
const MAX_PER_RUN = 75;

function need(name){ const v=process.env[name]; if(!v) throw new Error("Missing env "+name); return v; }
function resendKey(){ const k=process.env.PEGASUS_RESEND_API_KEY||process.env.RESEND_API_KEY; if(!k) throw new Error("Missing PEGASUS_RESEND_API_KEY"); return k; }
function esc(v){ return String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function firstName(v){ const f=String(v||"").trim().split(/\s+/)[0]||"there"; return f.length>40||/@/.test(f)?"there":f; }
function mask(v){ return String(v||"").replace(/(^.).*(@.*$)/,"$1***$2"); }

async function sb(path, opts){
  const url=need("SUPABASE_URL").replace(/\/$/,""), key=need("SUPABASE_SERVICE_ROLE_KEY");
  const headers=Object.assign({apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",Accept:"application/json"},(opts&&opts.headers)||{});
  const res=await fetch(url+path,Object.assign({},opts,{headers,signal:AbortSignal.timeout(12000)}));
  if(!res.ok){ const t=await res.text().catch(()=>""); throw new Error(path.split("?")[0]+" "+res.status+" "+t.slice(0,180)); }
  if(res.status===204) return null;
  const txt=await res.text(); return txt?JSON.parse(txt):null;
}

function message(r){
  const first=firstName(r.full_name);
  const profile=ORIGIN+"/u/"+encodeURIComponent(r.profile_slug)+"?utm_source=email&utm_medium=lifecycle&utm_campaign="+r.step;
  const share=ORIGIN+"/share-studio.html?utm_source=email&utm_medium=lifecycle&utm_campaign="+r.step;
  const invite=ORIGIN+"/dashboard.html?invite=1&utm_source=email&utm_medium=lifecycle&utm_campaign="+r.step;
  if(r.step==="profile_live") return {
    subject:"Your Pegasus profile is live — put it to work",
    heading:"Your profile is live. Put it to work.",
    body:"Your Pegasus page is already part of the network. Share it where your clients and partners already know you, and let the right people discover what you do.",
    cta:"View and share my profile", href:profile,
    note:"The strongest networks grow when the people inside make their work visible."
  };
  if(r.step==="invite_circle") return {
    subject:"Who should be in your Pegasus circle?",
    heading:"Bring the people you already trust.",
    body:"Think of one lender, investor, broker, founder, attorney, or capital partner you would trust in a real deal. Invite them into Pegasus from your own network.",
    cta:"Invite someone I trust", href:invite,
    note:"Pegasus is your network. The right introduction makes it stronger for everyone."
  };
  return {
    subject:"Get more exposure from your Pegasus profile",
    heading:"Turn your profile into distribution.",
    body:"Share Studio prepares your Pegasus profile for LinkedIn, Facebook, X, and Instagram with a clean link, caption, and branded images. You review and publish everything yourself.",
    cta:"Open Share Studio", href:share,
    note:"Your profile should not sit quietly. Put it in front of the people who already know your work."
  };
}

function render(r){
  const m=message(r), first=firstName(r.full_name);
  const unsub=ORIGIN+"/unsubscribe?e="+encodeURIComponent(r.email)+"&digest=1";
  const html='<!doctype html><html><body style="margin:0;background:#f4f6f8"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="560" style="max-width:560px;width:100%;background:#fff;border:1px solid #e4e7eb;border-radius:12px"><tr><td style="padding:30px 32px;font-family:Arial,Helvetica,sans-serif;color:#172033"><p style="margin:0 0 5px;font-size:11px;letter-spacing:.13em;text-transform:uppercase;color:#8e7020">Pegasus Capital Network</p><h1 style="margin:0 0 16px;font-size:22px;line-height:1.25">'+esc(m.heading)+'</h1><p style="margin:0 0 14px;font-size:15px;line-height:1.65">Hi '+esc(first)+',</p><p style="margin:0 0 22px;font-size:15px;line-height:1.65;color:#46525f">'+esc(m.body)+'</p><a href="'+esc(m.href)+'" style="display:inline-block;background:#1b3a5b;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:9px">'+esc(m.cta)+' →</a><p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:#697386">'+esc(m.note)+'</p><hr style="border:0;border-top:1px solid #e4e7eb;margin:24px 0 14px"><p style="margin:0;font-size:11px;line-height:1.55;color:#8a97a8">'+esc(ADDRESS)+'<br>You receive member updates because you created a Pegasus profile. <a href="'+esc(unsub)+'" style="color:#8a97a8">Unsubscribe</a></p></td></tr></table></td></tr></table></body></html>';
  const text=["Hi "+first+",","",m.heading,"",m.body,"",m.cta+": "+m.href,"",m.note,"",ADDRESS,"Unsubscribe: "+unsub].join("\n");
  return {subject:m.subject,html,text,unsub};
}

exports.handler=async()=>{
  const out={eligible:0,sent:0,recorded:0,failed:0,errors:[]};
  try{
    const rows=(await sb("/rest/v1/rpc/member_activation_candidates",{method:"POST",body:JSON.stringify({p_limit:MAX_PER_RUN})})||[]);
    out.eligible=rows.length;
    if(!rows.length) return done(out);
    const batch=rows.map(r=>{ const m=render(r); return {from:FROM,to:[r.email],reply_to:REPLY_TO,subject:m.subject,html:m.html,text:m.text,
      headers:{"List-Unsubscribe":"<"+m.unsub+">","List-Unsubscribe-Post":"List-Unsubscribe=One-Click"},
      tags:[{name:"campaign",value:"member_activation"},{name:"step",value:r.step}]}; });
    const batchKey="member-activation-"+crypto.createHash("sha256").update(rows.map(r=>r.id+":"+r.step).join(",")).digest("hex");
    const res=await fetch("https://api.resend.com/emails/batch",{method:"POST",headers:{Authorization:"Bearer "+resendKey(),"Content-Type":"application/json","Idempotency-Key":batchKey},body:JSON.stringify(batch),signal:AbortSignal.timeout(20000)});
    const data=await res.json().catch(()=>null);
    if(!res.ok||!data||!Array.isArray(data.data)) throw new Error("resend batch "+res.status+" "+JSON.stringify(data).slice(0,220));
    const accepted=[];
    rows.forEach((r,i)=>{ const x=data.data[i]; if(x&&x.id){ accepted.push({profile_id:r.id,step:r.step,email:r.email,resend_id:x.id,sent_at:new Date().toISOString()}); out.sent++; } else { out.failed++; out.errors.push(mask(r.email)+": not accepted"); } });
    if(accepted.length){
      const saved=await sb("/rest/v1/pn_member_activation_events?on_conflict=profile_id,step",{method:"POST",headers:{Prefer:"resolution=ignore-duplicates,return=representation"},body:JSON.stringify(accepted)});
      out.recorded=Array.isArray(saved)?saved.length:0;
    }
  }catch(e){ out.errors.push(String(e&&e.message||e)); }
  return done(out);
};
function done(out){ console.log("[member-activation]",JSON.stringify(out)); return {statusCode:out.errors.length?500:200,headers:{"Content-Type":"application/json"},body:JSON.stringify(out)}; }

exports._message=message;
exports._render=render;

