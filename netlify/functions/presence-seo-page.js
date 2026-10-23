// Pegasus SEO — server-delivered public Business/Event metadata + semantic snapshot.

// Every outbound request gets a 4 s deadline: a hung connection falls into this
// function's own error path (503) instead of running into Netlify's 10 s limit (504).
const fetch=(u,o={})=>globalThis.fetch(u,o.signal?o:{...o,signal:AbortSignal.timeout(4000)});

const ORIGIN="https://pegasuscapitalnetwork.com";
function env(name){return globalThis.Netlify?.env?.get(name)||"";}
function cfg(){
  const url=env("SUPABASE_URL"),key=env("SUPABASE_PUBLISHABLE_KEY");
  if(!url||!key) throw new Error("Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY");
  return {url:url.replace(/\/$/,""),key};
}
function esc(v){return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}
function txt(v){return String(v||"").replace(/\s+/g," ").trim();}
function trunc(v,n){const s=txt(v);return s.length<=n?s:s.slice(0,n-1).replace(/\s+\S*$/,"")+"…";}
function safeHttp(v){const s=txt(v);return /^https?:\/\//i.test(s)?s:"";}
function cleanSlug(v){const s=String(v||"").trim();return /^[a-z0-9][a-z0-9-]*$/i.test(s)?s:"";}
// US states + DC + PR (inlined; functions stay self-contained). A state code is
// only used after validation via cleanState().
const STATE_NAMES={AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",DC:"District of Columbia",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",PR:"Puerto Rico",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming"};
function cleanState(v){const s=String(v||"").trim().toUpperCase();return Object.prototype.hasOwnProperty.call(STATE_NAMES,s)?s:"";}
function fmtInt(n){const v=Number(n);return Number.isFinite(v)?Math.round(v).toLocaleString("en-US"):"";}
// "$1.2B" / "$503.7M" / "$900K" — company-page HMDA volume (1 decimal for B/M).
function fmtUsd(n){
  const v=Number(n);if(!Number.isFinite(v)||v<=0) return "";
  if(v>=1e9) return "$"+(v/1e9).toFixed(1)+"B";
  if(v>=1e6) return "$"+(v/1e6).toFixed(1)+"M";
  if(v>=1e3) return "$"+Math.round(v/1e3)+"K";
  return "$"+Math.round(v);
}
// Directory breadcrumb trail for a company: Businesses › Section › Category › State.
// Built from the taxonomy row (p._dir); levels are only added when present.
function dirCrumbs(p){
  const d=(p&&p._dir)||{};
  const out=[{name:"Businesses",href:"/businesses"}];
  const sec=cleanSlug(d.section_slug),cat=cleanSlug(d.cat_slug),st=cleanState(d.state_code);
  if(sec&&txt(d.section_label)){
    out.push({name:txt(d.section_label),href:"/businesses/"+sec});
    if(cat&&txt(d.cat_label)){
      out.push({name:txt(d.cat_label),href:"/businesses/"+sec+"/"+cat});
      if(st) out.push({name:STATE_NAMES[st],href:"/businesses/"+sec+"/"+cat+"/in/"+st.toLowerCase()});
    }
  }
  return out;
}
function replaceOrInsert(html,regex,replacement,before="</head>"){return regex.test(html)?html.replace(regex,replacement):html.replace(before,replacement+"\n"+before);}
async function getPresence(slug){
  const {url,key}=cfg();
  try{
    const res=await fetch(url+"/rest/v1/rpc/get_presence_page_by_slug",{
      method:"POST",
      headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",Accept:"application/json"},
      body:JSON.stringify({p_slug:slug})
    });
    if(res.ok) return await res.json();
    const body=await res.text().catch(()=> "");
    console.warn("[presence-seo-page] RPC unavailable, using public view:",res.status,body.slice(0,180));
  }catch(err){
    // A timed-out Supabase would time out the fallback too: fail fast (503).
    if(err&&err.name==="TimeoutError") throw err;
    console.warn("[presence-seo-page] RPC threw, using public view:",err&&err.message);
  }

  // Deployment-safe fallback when the latest RPC migration/schema cache is not
  // live yet. public_presence_previews is already the anonymous-safe surface.
  const params=new URLSearchParams({
    select:"id,presence_type,name,slug,tagline,short_description,category,industry,location,market,public_cta_label,public_cta_url,status,is_claimable",
    slug:"eq."+slug,
    limit:"1"
  });
  const fallback=await fetch(url+"/rest/v1/public_presence_previews?"+params.toString(),{
    headers:{apikey:key,Authorization:"Bearer "+key,Accept:"application/json"}
  });
  if(!fallback.ok){
    const body=await fallback.text().catch(()=> "");
    throw new Error("presence fallback failed: "+fallback.status+" "+body.slice(0,300));
  }
  const rows=await fallback.json();
  if(!Array.isArray(rows)||!rows.length) return null;
  return {access:"full",presence:{...rows[0],visibility:"public_preview"},can_manage:false};
}
// Claim strip eligibility (is_claimable from the anon-safe previews view — the
// page RPC does not carry it) + the directory taxonomy/HMDA row for the company
// (section/category, state, city, 2025 HMDA rank/volume/count). Both fetched in
// parallel; any failure degrades to {is_claimable:false, dir:null} — never throws.
async function getDirectoryRow(slug){
  const out={is_claimable:false,dir:null,award:false};
  try{
    const {url,key}=cfg();
    const headers={apikey:key,Authorization:"Bearer "+key,Accept:"application/json"};
    const s=encodeURIComponent(slug);
    const get=path=>fetch(url+"/rest/v1/"+path,{headers}).then(r=>r.ok?r.json():null).catch(()=>null);
    const [cr,dr,discovery]=await Promise.all([
      get("public_presence_previews?select=is_claimable&slug=eq."+s+"&limit=1"),
      get("public_business_directory?select=cat_slug,cat_label,section_slug,section_label,state_code,city,hmda_rank,hmda_volume_usd,hmda_count,unclaimed&slug=eq."+s+"&limit=1"),
      get("public_business_discovery?select=conference_affiliation&slug=eq."+s+"&limit=1")
    ]);
    out.is_claimable=!!(Array.isArray(cr)&&cr[0]&&cr[0].is_claimable===true);
    if(Array.isArray(dr)&&dr[0]&&typeof dr[0]==="object") out.dir={...dr[0],conference_affiliation:discovery?.[0]?.conference_affiliation};
    if(out.dir) out.award=await isHonoree(slug,out.dir);
  }catch(_){}
  return out;
}
// Pegasus Top Lenders 2025 honoree? Same rules as hmda-awards.js: U.S. rank ≤100,
// Top 25 within banks & CUs / independent mortgage companies, or State Leader
// (best rank among ≥3 ranked lenders HQ'd in the state). Any failure → false.
async function isHonoree(slug,d){
  try{
    const rank=Number(d.hmda_rank);
    if(!Number.isFinite(rank)||rank<1) return false;
    if(rank<=100) return true;
    const cat=["financial-institutions","mortgage-companies"].includes(txt(d.cat_slug))?txt(d.cat_slug):"";
    const st=cleanState(d.state_code);
    if(!cat&&!st) return false;
    // Exact counts via PostgREST: total in Content-Range of a 1-row ranged GET.
    const {url,key}=cfg();
    const count=async params=>{
      const qs=new URLSearchParams({select:"slug",hmda_rank:"not.is.null",...params});
      const res=await fetch(url+"/rest/v1/public_business_directory?"+qs.toString(),{headers:{apikey:key,Authorization:"Bearer "+key,Accept:"application/json",Range:"0-0","Range-Unit":"items",Prefer:"count=exact"}});
      const m=String(res.headers.get("content-range")||"").match(/\/(\d+)$/);
      if((!res.ok&&res.status!==416)||!m) throw new Error("count failed: "+res.status);
      return parseInt(m[1],10);
    };
    const ahead="(hmda_rank.lt."+rank+",and(hmda_rank.eq."+rank+",slug.lt."+slug+"))";
    const [catAhead,stTotal,stAhead]=await Promise.all([
      cat?count({cat_slug:"eq."+cat,or:ahead}):null,
      st?count({state_code:"ilike."+st}):null,
      st?count({state_code:"ilike."+st,or:ahead}):null
    ]);
    return !!((cat&&catAhead+1<=25)||(st&&stTotal>=3&&stAhead===0));
  }catch(_){return false;}
}
// Founding offer spots left (migration 104); 0 on any failure, so the line hides.
async function perkSpots(){
  try{
    const {url,key}=cfg();
    const r=await fetch(url+"/rest/v1/rpc/founding_perk_spots_left",{method:"POST",headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"},body:"{}"});
    return r.ok?Number(await r.json())||0:0;
  }catch(_){return 0;}
}
// The page template is a static file: keep it for 10 minutes per warm instance
// and fall back to the last good copy if the self-fetch fails.
let tplCache=null;
async function getTemplate(request){
  if(tplCache&&Date.now()-tplCache.t<600000) return tplCache.html;
  try{
    const u=new URL(request.url);
    const res=await fetch(u.origin+"/presence.html?seo_template=1",{headers:{"User-Agent":"Pegasus-SEO-Renderer/1.0"}});
    if(!res.ok) throw new Error("presence template fetch failed: "+res.status);
    const html=await res.text();
    tplCache={t:Date.now(),html};
    return html;
  }catch(err){
    if(tplCache) return tplCache.html;
    throw err;
  }
}
function typeAllowed(kind,type){
  return kind==="event" ? type==="event" : (type==="company" || type==="capital_program");
}
function segment(kind){return kind==="event"?"event":"business";}
function snapshot(p,kind,canonical){
  const name=txt(p.name),tagline=txt(p.tagline),desc=trunc(p.short_description,700);
  const logo=safeHttp(p.logo_url),website=safeHttp(p.website_url);
  const meta=[txt(p.category),txt(p.industry),txt(p.location),txt(p.market)].filter(Boolean);
  const label=kind==="event"?"Event":"Business";
  // Directory breadcrumb (above H1) + HMDA 2025 rank block (after meta) — businesses only.
  const d=(kind==="business"&&p._dir)||null;
  let crumbLine="",hmda="";
  if(d){
    const crumbs=dirCrumbs(p);
    if(crumbs.length>1) crumbLine='<nav aria-label="Breadcrumb" style="font-size:12.5px;color:#697386;margin-bottom:10px">'+crumbs.map(c=>'<a href="'+esc(c.href)+'" style="color:#1d5a9e;text-decoration:none">'+esc(c.name)+'</a>').join(' <span aria-hidden="true">›</span> ')+'</nav>';
    const rank=Number(d.hmda_rank);
    if(Number.isFinite(rank)&&rank>=1){
      const vol=fmtUsd(d.hmda_volume_usd),cnt=Number(d.hmda_count);
      const lead=rank<=100?"Top 100 U.S. mortgage lender — #"+fmtInt(rank)+" by 2025 origination volume (HMDA)":"Ranked #"+fmtInt(rank)+" of U.S. mortgage lenders by 2025 origination volume (HMDA)";
      const tail=[vol,Number.isFinite(cnt)&&cnt>0?"across "+fmtInt(cnt)+" loans":""].filter(Boolean).join(" ");
      hmda='<div style="margin-top:12px;display:inline-block;padding:8px 12px;border:1px solid #d6e4f5;background:#eef4fb;border-radius:12px;font-size:13.5px;color:#1d5a9e">'+esc(lead+(tail?" · "+tail:""))+'</div>'+
        '<div style="font-size:12px;color:#697386;margin-top:6px">Source: Home Mortgage Disclosure Act (HMDA) 2025 public data.</div>';
      // Ranking links: embeddable badge + the full ranking (HQ-state page when known).
      const slug=cleanSlug(p.slug),st=cleanState(d.state_code);
      const rankHref="/rankings/top-mortgage-lenders-2025"+(st?"/"+st.toLowerCase():"");
      const rankLabel=st?"See the 2025 ranking of lenders headquartered in "+STATE_NAMES[st]:"See the full 2025 ranking";
      hmda+='<div style="font-size:12.5px;margin-top:6px">'+
        (slug?'<a href="/rankings/badge/'+esc(encodeURIComponent(slug))+'" style="color:#1d5a9e;text-decoration:none;font-weight:600">Show your ranking: get the badge →</a> <span aria-hidden="true" style="color:#c3ccd8">·</span> ':'')+
        '<a href="'+esc(rankHref)+'" style="color:#1d5a9e;text-decoration:none">'+esc(rankLabel)+'</a></div>';
      if(p._award===true&&slug) hmda+='<div style="font-size:12.5px;margin-top:6px"><a href="/awards/top-lenders-2025/'+esc(encodeURIComponent(slug))+'" style="color:#8a6514;text-decoration:none;font-weight:600">Pegasus Top Lenders 2025 honoree — see the award →</a></div>';
    }
  }
  return '<article id="peg-seo-snapshot" style="max-width:1000px;margin:30px auto 20px;padding:28px 40px;border:1px solid #e4e7eb;border-radius:18px;background:#fff;font-family:Arial,sans-serif;color:#172033">'+
    crumbLine+
    '<div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#697386">'+esc(label)+'</div>'+
    '<div style="display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap;margin-top:10px">'+
    (logo?'<img src="'+esc(logo)+'" alt="'+esc(name)+' logo" width="96" height="96" style="width:96px;height:96px;border-radius:16px;object-fit:contain;border:1px solid #e4e7eb">':'')+
    '<div style="flex:1;min-width:240px"><h1 style="margin:0 0 8px;font-size:36px;line-height:1.08">'+esc(name)+'</h1>'+
    (tagline?'<p style="font-size:17px;line-height:1.5;margin:8px 0">'+esc(tagline)+'</p>':'')+
    (meta.length?'<div style="color:#5b6573">'+esc(meta.join(" · "))+'</div>':'')+
    hmda+
    (d?.conference_affiliation ? '<p style="font-size:13px;margin-top:12px"><a href="https://aaplonline.com/conference/" rel="noopener">'+esc(d.conference_affiliation)+'</a></p>' : '')+
    '</div></div>'+
    (desc?'<p style="font-size:15px;line-height:1.65;margin:22px 0 0">'+esc(desc)+'</p>':'')+
    (txt(p.offers)?'<section><h2 style="font-size:18px;margin:22px 0 6px">What we offer</h2><p style="line-height:1.6">'+esc(trunc(p.offers,700))+'</p></section>':'')+
    (txt(p.looking_for)?'<section><h2 style="font-size:18px;margin:22px 0 6px">What we are looking for</h2><p style="line-height:1.6">'+esc(trunc(p.looking_for,700))+'</p></section>':'')+
    (website?'<p style="margin:18px 0 0"><a href="'+esc(website)+'">Official website</a></p>':'')+
    '<link rel="canonical" href="'+esc(canonical)+'"></article>';
}
// Server-rendered conversion CTA for business/event pages — converts anonymous
// discovery traffic into signups. Honest + working today (routes to real
// signup/sign-in; no not-yet-built claim flow is promised). Hidden for
// signed-in visitors.
function joinCta(kind){
  var line=kind==="event"
    ? "Host sessions and present who you are inside Pegasus Capital Network. Creating your profile is free."
    : "Represent a company, project, or capital program? Pegasus Capital Network is where professionals present what they do — and get found. Creating your profile is free.";
  return '<aside id="peg-seo-join" style="max-width:1000px;margin:0 auto 34px;padding:22px 32px;border:1px solid #e4e7eb;border-radius:18px;background:#0b1626;color:#f4f8fc;font-family:Arial,sans-serif;display:flex;gap:18px;align-items:center;justify-content:space-between;flex-wrap:wrap">'+
    '<div style="min-width:240px;flex:1"><div style="font-size:18px;font-weight:700;margin-bottom:4px">Be discovered by the right people.</div>'+
    '<div style="font-size:13px;color:#adbdd0;line-height:1.5">'+esc(line)+'</div></div>'+
    '<div style="display:flex;gap:10px;flex-wrap:wrap"><a href="/signup.html" style="background:#3a8fe8;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 18px;border-radius:10px">Create your free profile</a>'+
    '<a href="/signin.html" style="border:1px solid rgba(255,255,255,.3);color:#f4f8fc;text-decoration:none;font-size:14px;padding:11px 18px;border-radius:10px">Sign in</a></div>'+
    '<script>try{if(localStorage.getItem("pegasus.auth")){var e=document.getElementById("peg-seo-join");if(e)e.style.display="none";}}catch(_){}</script></aside>';
}
// "Is this your business?" claim strip — only on imported, still-unclaimed pages
// (is_claimable from public_presence_previews); never on member-built pages.
// Previously: always visible (claiming is relevant to
// signed-in members too). Routes to the claim flow with the presence slug.
// Ranked lenders (hmda_rank present) get a more specific pitch.
function claimCta(kind,slug,rank,spots){
  var noun=kind==="event"?"event":"business";
  var href="/claim?presence="+encodeURIComponent(slug);
  var r=Number(rank);
  var lead=kind==="business"&&Number.isFinite(r)&&r>=1
    ? "Ranked #"+fmtInt(r)+" by Pegasus. Claim this page to update your details, add your team, and display the official badge."
    : "Is this your "+noun+" on Pegasus?";
  return '<aside style="max-width:1000px;margin:0 auto 34px;padding:14px 20px;border:1px dashed #cdd6e0;border-radius:14px;background:#f7f9fb;color:#51607a;font-family:Arial,sans-serif;display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;font-size:13.5px">'+
    '<span>'+esc(lead)+'<span id="peg-views" style="display:none"></span></span>'+
    '<a href="'+esc(href)+'" style="color:#235fa6;font-weight:600;text-decoration:none">Claim this page →</a>'+
    (kind==="business"&&Number(spots)>0?'<span style="flex-basis:100%;text-align:center;font-size:12.5px;color:#0c8f5c">★ Founding offer: the first 50 companies to claim are Featured free for 60 days ('+Number(spots)+' spots left).</span>':"")+
    '</aside>';
}
// Page-view beacon (all public company/event pages) + "viewed N times" in the
// claim strip. The HTML is CDN-cached, so counting happens client-side: one
// view per browser per page per day, obvious bots skipped. Uses the anon
// config already loaded by the page (window.PEG_CONFIG).
function viewsScript(slug){
  return '<script>(function(){try{var s='+JSON.stringify(slug)+';'+
    'if(navigator.webdriver||/bot|crawl|spider|slurp|preview|headless|lighthouse/i.test(navigator.userAgent))return;'+
    'function go(){var c=window.PEG_CONFIG;if(!c||!c.SUPABASE_URL||!c.SUPABASE_ANON)return;'+
    'var h={apikey:c.SUPABASE_ANON,Authorization:"Bearer "+c.SUPABASE_ANON,"Content-Type":"application/json"},u=c.SUPABASE_URL.replace(/\\/$/,"")+"/rest/v1/rpc/";'+
    'var k="pegv:"+s+":"+new Date().toISOString().slice(0,10),seen=false;try{seen=!!localStorage.getItem(k);}catch(_){}'+
    'var p=seen?Promise.resolve():fetch(u+"record_presence_view",{method:"POST",headers:h,body:JSON.stringify({p_slug:s})}).then(function(){try{localStorage.setItem(k,"1");}catch(_){}});'+
    'p.then(function(){var el=document.getElementById("peg-views");if(!el)return;'+
    'function j(f,b){return fetch(u+f,{method:"POST",headers:h,body:JSON.stringify(b)}).then(function(r){return r.json();}).catch(function(){return null;});}'+
    'return Promise.all([j("get_presence_views",{p_slug:s,p_days:30}),j("get_presence_request_count",{p_slug:s,p_days:30})]).then(function(a){'+
    'var n=parseInt(a[0],10),q=parseInt(a[1],10),t="";if(n>=3)t=" This page was viewed "+n+" times in the last 30 days.";'+
    'if(q>=1)t+=(t?" \\u00b7 ":" ")+q+" financing request"+(q===1?"":"s")+" matched this company \\u2014 claim the page to view them.";'+
    'if(t){el.textContent=t;el.style.display="inline";}});}).catch(function(){});}'+
    'if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",go);else go();}catch(_){}})();</script>';
}
function render(html,p,kind){
  const slug=cleanSlug(p.slug),seg=segment(kind);
  const canonical=ORIGIN+"/"+seg+"/"+encodeURIComponent(slug);
  const label=kind==="event"?"Event":"Business";
  const rawDesc=txt(p.short_description)||txt(p.tagline)||[txt(p.category),txt(p.industry),txt(p.location),txt(p.market)].filter(Boolean).join(" · ");
  const desc=trunc(rawDesc||(txt(p.name)+" on Pegasus Capital Network"),160);
  // Companies with a directory row get "<Name> — <Category> in <City, ST>"; otherwise the generic title.
  const d=(kind==="business"&&p._dir)||{};
  const catLabel=txt(d.cat_label),st=cleanState(d.state_code),city=txt(d.city);
  const place=[city,st].filter(Boolean).join(", ");
  const title=catLabel
    ? txt(p.name)+" — "+catLabel+(place?" in "+place:"")+" | Pegasus Capital Network"
    : txt(p.name)+" — "+label+" | Pegasus Capital Network";
  const image=safeHttp(p.logo_url);

  html=replaceOrInsert(html,/<title>[\s\S]*?<\/title>/i,'<title>'+esc(title)+'</title>');
  html=replaceOrInsert(html,/<link\s+rel=["']canonical["'][^>]*>/i,'<link rel="canonical" href="'+esc(canonical)+'">');
  html=replaceOrInsert(html,/<meta\s+name=["']description["'][^>]*>/i,'<meta name="description" content="'+esc(desc)+'">');
  html=replaceOrInsert(html,/<meta\s+name=["']robots["'][^>]*>/i,'<meta name="robots" content="index,follow,max-image-preview:large">');
  const og=[
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="Pegasus Capital Network">',
    '<meta property="og:title" content="'+esc(title)+'">',
    '<meta property="og:description" content="'+esc(desc)+'">',
    '<meta property="og:url" content="'+esc(canonical)+'">',
    image?'<meta property="og:image" content="'+esc(image)+'">':'',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:title" content="'+esc(title)+'">',
    '<meta name="twitter:description" content="'+esc(desc)+'">',
    image?'<meta name="twitter:image" content="'+esc(image)+'">':''
  ].filter(Boolean).join("\n");
  let schema;
  if(kind==="event"){
    // The current canonical Event record does not yet have structured start/end
    // dates. Describe it truthfully as a WebPage about an Event without claiming
    // Google Event rich-result eligibility until those fields exist.
    const eventEntity={"@type":"Thing",additionalType:"https://schema.org/Event",name:txt(p.name),url:canonical,description:desc};
    if(txt(p.location)) eventEntity.location=txt(p.location);
    schema={"@context":"https://schema.org","@type":"WebPage",url:canonical,name:title,description:desc,about:eventEntity,mainEntity:eventEntity};
  }else if(p.presence_type==="company"){
    // Lenders/banks (capital section) are also a FinancialService.
    const mainEntity={"@type":cleanSlug(d.section_slug)==="capital"?["Organization","FinancialService"]:"Organization",name:txt(p.name),url:canonical,description:desc};
    if(image) mainEntity.logo=image;
    if(safeHttp(p.website_url)) mainEntity.sameAs=[safeHttp(p.website_url)];
    if(txt(p.location)) mainEntity.location=txt(p.location);
    if(city||st){
      const address={"@type":"PostalAddress"};
      if(city) address.addressLocality=city;
      if(st) address.addressRegion=st;
      address.addressCountry="US";
      mainEntity.address=address;
    }
    schema={"@context":"https://schema.org","@type":"ProfilePage",url:canonical,name:title,description:desc,mainEntity};
  }else{
    const mainEntity={"@type":"Service",name:txt(p.name),url:canonical,description:desc};
    schema={"@context":"https://schema.org","@type":"WebPage",url:canonical,name:title,description:desc,about:mainEntity,mainEntity};
  }
  let jsonLd='<script type="application/ld+json">'+JSON.stringify(schema).replace(/</g,"\\u003c")+'</script>';
  if(kind==="business"&&p._dir){
    const crumbs=dirCrumbs(p);
    if(crumbs.length>1){
      const bl={"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":crumbs.map((c,i)=>({"@type":"ListItem",position:i+1,name:c.name,item:ORIGIN+c.href}))};
      jsonLd+='\n<script type="application/ld+json">'+JSON.stringify(bl).replace(/</g,"\\u003c")+'</script>';
    }
  }
  html=html.replace("</head>",og+"\n"+jsonLd+"\n</head>");
  html=html.replace("<body>","<body>\n"+snapshot(p,kind,canonical)+"\n"+(p.is_claimable===true?claimCta(kind,slug,(p._dir||{}).hmda_rank,p._spots)+"\n":"")+joinCta(kind));
  html=html.replace("</body>",viewsScript(slug)+"\n</body>");
  return html;
}
function simple(status,title,message){
  return new Response('<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>'+esc(title)+'</title></head><body><main><h1>'+esc(title)+'</h1><p>'+esc(message)+'</p><p><a href="/">Pegasus Capital Network</a></p></main></body></html>',{
    status,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":status===404?"public, max-age=60":"no-store","X-Robots-Tag":"noindex, nofollow",...(status===503?{"Retry-After":"120"}:{})}
  });
}

export default async (request) => {
  const u=new URL(request.url);
  const publicPath=u.pathname.match(/^\/(business|event)\/([^/]+)\/?$/);
  const slug=cleanSlug(publicPath ? publicPath[2] : u.searchParams.get("slug"));
  const kind=publicPath ? publicPath[1] : (u.searchParams.get("kind")==="event"?"event":"business");
  if(!slug) return simple(404,"Page not found","This page does not exist.");
  try{
    const [data,template,dirRow,spots]=await Promise.all([getPresence(slug),getTemplate(request),getDirectoryRow(slug),perkSpots()]);
    if(!data||data.access==="unavailable") return simple(404,"Page not found","This page is not available.");
    if(data.access!=="full"||!data.presence){
      // Member-only/private public requests stay non-indexable.
      return new Response(template,{status:200,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"public, max-age=0, s-maxage=60","X-Robots-Tag":"noindex, nofollow"}});
    }
    const p={...data.presence,is_claimable:dirRow.is_claimable,_dir:dirRow.dir,_award:dirRow.award===true,_spots:spots};
    if(!typeAllowed(kind,p.presence_type)) return simple(404,"Page not found","This page does not exist.");
    if(p.visibility!=="public_preview"||p.status!=="active") {
      return new Response(template,{status:200,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"public, max-age=0, s-maxage=60","X-Robots-Tag":"noindex, nofollow"}});
    }
    const canonical=ORIGIN+"/"+segment(kind)+"/"+encodeURIComponent(slug);
    return new Response(render(template,p,kind),{
      status:200,
      headers:{
        "Content-Type":"text/html; charset=utf-8",
        // CDN copy for 15 min, then stale-while-revalidate for a day: repeat
        // crawls never wait on this function or Supabase.
        "Cache-Control":"public, max-age=0, s-maxage=900, stale-while-revalidate=86400",
        "X-Robots-Tag":"index, follow, max-image-preview:large",
        "Link":"<"+canonical+'>; rel="canonical"'
      }
    });
  }catch(err){
    console.error("[presence-seo-page]",err);
    return simple(503,"Page temporarily unavailable","Please try again shortly.");
  }
};
