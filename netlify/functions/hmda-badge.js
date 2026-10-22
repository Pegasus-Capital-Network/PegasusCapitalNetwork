// Pegasus — embeddable HMDA 2025 "ranked lender" badge: /badge/:slug.svg
// Ranked companies → "Ranked #N" (or "Top 100 · #N"); unknown slug, unranked
// company or lookup failure → neutral directory badge. Always 200 image/svg+xml.
// Also the gold "Pegasus Top Lenders 2025" award badge: /badge/award/:slug.svg
// (best award: Top 10/25/100 → category Top 25 → State Leader; non-honoree → neutral).
// Self-contained (Netlify functions do not reliably bundle cross-file imports).

// Every outbound request gets a 4 s deadline: a hung connection falls into this
// function's own error path (503) instead of running into Netlify's 10 s limit (504).
const fetch=(u,o={})=>globalThis.fetch(u,o.signal?o:{...o,signal:AbortSignal.timeout(4000)});

function env(name){return globalThis.Netlify?.env?.get(name)||"";}
function cfg(){
  const url=env("SUPABASE_URL"),key=env("SUPABASE_PUBLISHABLE_KEY");
  if(!url||!key) throw new Error("Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY");
  return {url:url.replace(/\/$/,""),key};
}
function xml(v){return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");}
function cleanSlug(v){const s=String(v||"").trim();return /^[a-z0-9][a-z0-9-]*$/i.test(s)?s:"";}
function fmtInt(n){const v=Number(n);return Number.isFinite(v)?Math.round(v).toLocaleString("en-US"):"";}
function txt(v){return String(v||"").replace(/\s+/g," ").trim();}
function parseTotal(cr){const m=String(cr||"").match(/\/(\d+)$/);return m?parseInt(m[1],10):null;}
// US states + DC + PR (inlined). Only used after validation via cleanState().
const STATE_NAMES={AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",DC:"District of Columbia",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",PR:"Puerto Rico",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming"};
function cleanState(v){const s=String(v||"").trim().toUpperCase();return Object.prototype.hasOwnProperty.call(STATE_NAMES,s)?s:"";}
const FONT="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
async function lookup(slug){
  const {url,key}=cfg();
  const qs=new URLSearchParams({select:"name,hmda_rank",slug:"eq."+slug,limit:"1"});
  const res=await fetch(url+"/rest/v1/public_business_directory?"+qs.toString(),{headers:{apikey:key,Authorization:"Bearer "+key,Accept:"application/json"}});
  if(!res.ok) throw new Error("badge lookup failed: "+res.status);
  const rows=await res.json();
  return Array.isArray(rows)&&rows[0]?rows[0]:null;
}
// Pegasus Top Lenders 2025 — same logic as hmda-awards.js (kept in sync by hand).
const STATE_MIN=3,CAT_TOP=25;
const CAT_SHORT={"financial-institutions":"Top 25 Banks & CUs","mortgage-companies":"Top 25 Indep. Mortgage Cos."};
const CAT_TITLE={"financial-institutions":"Top 25 Banks & Credit Unions 2025","mortgage-companies":"Top 25 Independent Mortgage Companies 2025"};
async function countRanked(params){
  const {url,key}=cfg();
  const qs=new URLSearchParams({select:"slug",hmda_rank:"not.is.null",...params});
  const res=await fetch(url+"/rest/v1/public_business_directory?"+qs.toString(),{headers:{apikey:key,Authorization:"Bearer "+key,Accept:"application/json",Range:"0-0","Range-Unit":"items",Prefer:"count=exact"}});
  if(!res.ok&&res.status!==416) throw new Error("award count failed: "+res.status);
  const n=parseTotal(res.headers.get("content-range"));
  if(n==null) throw new Error("award count: missing content-range");
  return n;
}
// Best award for a company → {line, label} or null (non-honoree). Throws on DB error.
async function bestAward(slug){
  const {url,key}=cfg();
  const qs=new URLSearchParams({select:"slug,cat_slug,state_code,hmda_rank",slug:"eq."+slug,limit:"1"});
  const res=await fetch(url+"/rest/v1/public_business_directory?"+qs.toString(),{headers:{apikey:key,Authorization:"Bearer "+key,Accept:"application/json"}});
  if(!res.ok) throw new Error("award lookup failed: "+res.status);
  const rows=await res.json();
  const r=Array.isArray(rows)&&rows[0];
  const rank=Number(r&&r.hmda_rank);
  if(!r||!Number.isFinite(rank)||rank<1) return null;
  const n="#"+fmtInt(rank);
  if(rank<=10) return {line:"Top 10 · "+n,label:"Top 10 U.S. Mortgage Lenders 2025 — "+n};
  if(rank<=25) return {line:"Top 25 · "+n,label:"Top 25 U.S. Mortgage Lenders 2025 — "+n};
  if(rank<=100) return {line:"Top 100 · "+n,label:"Top 100 U.S. Mortgage Lenders 2025 — "+n};
  const ahead="(hmda_rank.lt."+rank+",and(hmda_rank.eq."+rank+",slug.lt."+slug+"))";
  const cat=Object.prototype.hasOwnProperty.call(CAT_SHORT,txt(r.cat_slug))?txt(r.cat_slug):"";
  const st=cleanState(r.state_code);
  const [catAhead,stTotal,stAhead]=await Promise.all([
    cat?countRanked({cat_slug:"eq."+cat,or:ahead}):null,
    st?countRanked({state_code:"ilike."+st}):null,
    st?countRanked({state_code:"ilike."+st,or:ahead}):null
  ]);
  if(cat&&catAhead+1<=CAT_TOP) return {line:CAT_SHORT[cat]+" · #"+(catAhead+1),label:CAT_TITLE[cat]+" — #"+(catAhead+1)};
  if(st&&stTotal>=STATE_MIN&&stAhead===0) return {line:"State Leader · "+STATE_NAMES[st],label:"State Leader 2025 — "+STATE_NAMES[st]};
  return null;
}
// Gold-accented award badge, same 300×64 footprint as the ranking badge.
function awardSvg(line2,label){
  return '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="64" viewBox="0 0 300 64" role="img" aria-label="'+xml(label)+'">'+
    '<title>'+xml(label)+'</title>'+
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f0cf7a"/><stop offset="1" stop-color="#b8892f"/></linearGradient></defs>'+
    '<rect width="300" height="64" rx="10" fill="#0b1626"/>'+
    '<rect x="1" y="1" width="298" height="62" rx="9" fill="none" stroke="url(#g)" stroke-width="1.5"/>'+
    '<rect x="11" y="12" width="4" height="40" rx="2" fill="url(#g)"/>'+
    '<g transform="translate(274 32)"><circle r="15" fill="none" stroke="url(#g)" stroke-width="1.5"/><path d="M0.00 -8.50L2.12 -2.91L8.08 -2.63L3.42 1.11L5.00 6.88L0.00 3.60L-5.00 6.88L-3.42 1.11L-8.08 -2.63L-2.12 -2.91Z" fill="url(#g)"/></g>'+
    '<g font-family="'+xml(FONT)+'">'+
    '<text x="25" y="26" font-size="15.5" font-weight="700" fill="#e3bc63">Pegasus Top Lenders 2025</text>'+
    '<text x="25" y="43" font-size="12.5" font-weight="600" fill="#f4f8fc">'+xml(line2)+'</text>'+
    '<text x="25" y="56" font-size="9" fill="#8fa6c2" letter-spacing=".03em">Largest by 2025 HMDA origination volume</text>'+
    '</g></svg>';
}
function svg(line1,line2,line3,label){
  return '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="64" viewBox="0 0 300 64" role="img" aria-label="'+xml(label)+'">'+
    '<title>'+xml(label)+'</title>'+
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e3bc63"/><stop offset="1" stop-color="#b8892f"/></linearGradient></defs>'+
    '<rect width="300" height="64" rx="10" fill="#0b1626"/>'+
    '<rect x="0.5" y="0.5" width="299" height="63" rx="9.5" fill="none" stroke="#1f3a5f"/>'+
    '<rect x="10" y="12" width="4" height="40" rx="2" fill="url(#g)"/>'+
    '<rect x="17" y="12" width="2" height="40" rx="1" fill="#3a8fe8"/>'+
    '<g font-family="'+xml(FONT)+'">'+
    '<text x="30" y="27" font-size="17" font-weight="700" fill="#e3bc63">'+xml(line1)+'</text>'+
    '<text x="30" y="44" font-size="12.5" font-weight="600" fill="#f4f8fc">'+xml(line2)+'</text>'+
    '<text x="30" y="57" font-size="9.5" fill="#8fa6c2" letter-spacing=".04em">'+xml(line3)+'</text>'+
    '</g></svg>';
}
function neutral(){
  return svg("Pegasus Capital Network","Member directory","pegasuscapitalnetwork.com","Pegasus Capital Network — Member directory");
}
function reply(body,maxAge){
  return new Response(body,{status:200,headers:{"Content-Type":"image/svg+xml; charset=utf-8","Cache-Control":"public, max-age="+maxAge,"X-Content-Type-Options":"nosniff"}});
}

export default async (request)=>{
  try{
    const u=new URL(request.url);
    // Award badge: /badge/award/<slug>.svg (netlify.toml routes it before /badge/*).
    const am=u.pathname.match(/^\/badge\/award\/([^\/]+?)(?:\.svg)?\/?$/i);
    if(am||u.searchParams.get("kind")==="award"){
      let ar=am?am[1]:(u.searchParams.get("slug")||"");
      try{ar=decodeURIComponent(ar);}catch(_){ar="";}
      const aslug=cleanSlug(ar);
      if(!aslug) return reply(neutral(),86400);
      let best;
      try{best=await bestAward(aslug);}catch(err){
        console.warn("[hmda-badge] award",err&&err.message);
        return reply(neutral(),300); // transient failure: don't pin the neutral badge for a day
      }
      if(!best) return reply(neutral(),86400);
      return reply(awardSvg(best.line,"Pegasus Top Lenders 2025 — "+best.label+" — Pegasus Capital Network"),86400);
    }
    // Netlify rewrites pass the ORIGINAL URL: parse /badge/<slug>.svg from the path,
    // falling back to ?slug= for direct function calls.
    const m=u.pathname.match(/^\/badge\/([^\/]+?)(?:\.svg)?\/?$/i);
    let raw=m?m[1]:(u.searchParams.get("slug")||"");
    try{raw=decodeURIComponent(raw);}catch(_){raw="";}
    const slug=cleanSlug(raw);
    if(!slug) return reply(neutral(),86400);
    let row;
    try{row=await lookup(slug);}catch(err){
      console.warn("[hmda-badge]",err&&err.message);
      return reply(neutral(),300); // transient failure: don't pin the neutral badge for a day
    }
    const rank=Number(row&&row.hmda_rank);
    if(!Number.isFinite(rank)||rank<1) return reply(neutral(),86400);
    const r="#"+fmtInt(rank);
    const line1=rank<=100?"Top 100 · "+r:"Ranked "+r;
    return reply(svg(line1,"U.S. Mortgage Lenders 2025","Pegasus Capital Network","Ranked "+r+" U.S. Mortgage Lender 2025 — Pegasus Capital Network"),86400);
  }catch(err){
    console.error("[hmda-badge]",err);
    return reply(neutral(),300);
  }
};
