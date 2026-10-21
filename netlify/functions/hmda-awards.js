// Pegasus Top Lenders 2025 — award layer on top of the HMDA 2025 lender ranking.
//   /awards/top-lenders-2025          → award page (all categories, computed live)
//   /awards/top-lenders-2025/:slug    → honoree page: awards held, badge embed,
//                                       press-release kit, share links, claim path
// Categories (all from public_business_directory, ordered by hmda_rank, slug):
//   Top 10 / Top 25 / Top 100 U.S. Mortgage Lenders 2025 — by U.S. rank (smallest bucket)
//   Top 25 Banks & Credit Unions 2025         — cat_slug='financial-institutions'
//   Top 25 Independent Mortgage Companies 2025 — cat_slug='mortgage-companies'
//   State Leader 2025 — best-ranked lender HQ'd in a state with ≥3 ranked HQ lenders
// Methodology: total 2025 origination volume reported under HMDA (public data),
// aggregated by Pegasus. Nothing beyond "largest by 2025 origination volume".
// Self-contained (Netlify functions do not reliably bundle cross-file imports).

const ORIGIN="https://pegasuscapitalnetwork.com";
const AWARD="/awards/top-lenders-2025";
const RANK_BASE="/rankings/top-mortgage-lenders-2025";
const PROGRAM="Pegasus Top Lenders 2025";
const STATE_MIN=3; // a state needs ≥3 ranked HQ lenders to have a State Leader
const CAT_TOP=25;
const SCAN_PAGE=1000,SCAN_MAX=20000;
const SOURCE="Source: Home Mortgage Disclosure Act (HMDA) 2025 public data, aggregated by Pegasus Capital Network.";
const METHOD="Lenders are ranked by total 2025 mortgage origination volume reported under the Home Mortgage Disclosure Act (HMDA), a public data source, aggregated by Pegasus Capital Network. Rank #1 is the largest originator nationwide. The awards reflect origination volume only.";
const TIERS=[
  {max:10,title:"Top 10 U.S. Mortgage Lenders 2025",short:"Top 10"},
  {max:25,title:"Top 25 U.S. Mortgage Lenders 2025",short:"Top 25"},
  {max:100,title:"Top 100 U.S. Mortgage Lenders 2025",short:"Top 100"}
];
const CATS={
  "financial-institutions":{id:"banks-credit-unions",title:"Top 25 Banks & Credit Unions 2025",short:"Top 25 Banks & CUs",blurb:"Banks and credit unions, ordered by U.S. rank."},
  "mortgage-companies":{id:"independent-mortgage-companies",title:"Top 25 Independent Mortgage Companies 2025",short:"Top 25 Indep. Mortgage Cos.",blurb:"Independent (non-depository) mortgage companies, ordered by U.S. rank."}
};
function env(name){return globalThis.Netlify?.env?.get(name)||"";}
function cfg(){
  const url=env("SUPABASE_URL"),key=env("SUPABASE_PUBLISHABLE_KEY");
  if(!url||!key) throw new Error("Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY");
  return {url:url.replace(/\/$/,""),key};
}
function esc(v){return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}
function txt(v){return String(v||"").replace(/\s+/g," ").trim();}
function cleanSlug(v){const s=String(v||"").trim();return /^[a-z0-9][a-z0-9-]*$/i.test(s)?s:"";}
// US states + DC + PR. A state code is only used after validation via cleanState().
const STATE_NAMES={AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",DC:"District of Columbia",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",PR:"Puerto Rico",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming"};
function cleanState(v){const s=String(v||"").trim().toUpperCase();return Object.prototype.hasOwnProperty.call(STATE_NAMES,s)?s:"";}
function fmtUsd(n){
  const v=Number(n);if(!Number.isFinite(v)||v<=0) return "";
  if(v>=1e9) return "$"+(v/1e9).toFixed(1)+"B";
  if(v>=1e7) return "$"+Math.round(v/1e6)+"M";
  if(v>=1e6) return "$"+(v/1e6).toFixed(1)+"M";
  if(v>=1e3) return "$"+Math.round(v/1e3)+"K";
  return "$"+Math.round(v);
}
// Press-release wording: "$1.2 billion" / "$503.7 million".
function fmtUsdLong(n){
  const v=Number(n);if(!Number.isFinite(v)||v<=0) return "";
  if(v>=1e9) return "$"+(v/1e9).toFixed(1)+" billion";
  if(v>=1e6) return "$"+(v/1e6).toFixed(1)+" million";
  return "$"+Math.round(v).toLocaleString("en-US");
}
function fmtInt(n){const v=Number(n);return Number.isFinite(v)?Math.round(v).toLocaleString("en-US"):"";}
function parseTotal(cr){const m=String(cr||"").match(/\/(\d+)$/);return m?parseInt(m[1],10):null;}
function rankOf(r){const n=Number(r&&r.hmda_rank);return Number.isFinite(n)&&n>=1?n:0;}
function ld(obj){return '<script type="application/ld+json">'+JSON.stringify(obj).replace(/</g,"\\u003c")+'</script>';}
function hq(r){const st=cleanState(r.state_code);return [txt(r.city),st].filter(Boolean).join(", ");}
const COLS="name,slug,cat_slug,cat_label,city,state_code,hmda_rank,hmda_volume_usd,hmda_count,unclaimed";
function headers(extra){const {key}=cfg();return {apikey:key,Authorization:"Bearer "+key,Accept:"application/json",...(extra||{})};}
// Every ranked row, ordered by U.S. rank (slug breaks ties so category/state
// positions match the per-company count queries below).
async function fetchAllRanked(){
  const {url}=cfg();
  const out=[];
  for(let from=0;from<SCAN_MAX;from+=SCAN_PAGE){
    const qs=new URLSearchParams({select:COLS,hmda_rank:"not.is.null",order:"hmda_rank.asc,slug.asc"});
    const res=await fetch(url+"/rest/v1/public_business_directory?"+qs.toString(),{headers:headers({Range:from+"-"+(from+SCAN_PAGE-1),"Range-Unit":"items"})});
    if(res.status===416) break;
    if(!res.ok){const body=await res.text().catch(()=> "");throw new Error("awards scan failed: "+res.status+" "+body.slice(0,300));}
    const rows=await res.json();
    if(!Array.isArray(rows)) break;
    out.push(...rows);
    if(rows.length<SCAN_PAGE) break;
  }
  return out.filter(r=>r&&typeof r==="object"&&rankOf(r));
}
// Exact count of ranked rows matching params (PostgREST count=exact).
async function countRanked(params){
  const {url}=cfg();
  const qs=new URLSearchParams({select:"slug",hmda_rank:"not.is.null",...params});
  const res=await fetch(url+"/rest/v1/public_business_directory?"+qs.toString(),{headers:headers({Range:"0-0","Range-Unit":"items",Prefer:"count=exact"})});
  if(!res.ok&&res.status!==416){const body=await res.text().catch(()=> "");throw new Error("awards count failed: "+res.status+" "+body.slice(0,300));}
  const n=parseTotal(res.headers.get("content-range"));
  if(n==null) throw new Error("awards count: missing content-range");
  return n;
}
async function lookup(slug){
  const {url}=cfg();
  const qs=new URLSearchParams({select:COLS,slug:"eq."+slug,limit:"1"});
  const res=await fetch(url+"/rest/v1/public_business_directory?"+qs.toString(),{headers:headers()});
  if(!res.ok) throw new Error("honoree lookup failed: "+res.status);
  const rows=await res.json();
  return Array.isArray(rows)&&rows[0]&&typeof rows[0]==="object"?rows[0]:null;
}
// Awards held, best first: national tier → category → state.
function awardsFor(rank,catSlug,catRank,leaderSt){
  const out=[];
  const t=rank?TIERS.find(x=>rank<=x.max):null;
  if(t) out.push({kind:"national",label:t.title+" — #"+fmtInt(rank),pr:t.title+" (#"+fmtInt(rank)+")",badge:t.short+" · #"+fmtInt(rank),anchor:"top-100"});
  const c=CATS[catSlug];
  if(c&&catRank>=1&&catRank<=CAT_TOP) out.push({kind:"category",label:c.title+" — #"+catRank,pr:c.title+" (#"+catRank+")",badge:c.short+" · #"+catRank,anchor:c.id});
  if(leaderSt&&STATE_NAMES[leaderSt]) out.push({kind:"state",label:"State Leader 2025 — "+STATE_NAMES[leaderSt],pr:"State Leader 2025 ("+STATE_NAMES[leaderSt]+")",badge:"State Leader · "+STATE_NAMES[leaderSt],anchor:"state-leaders"});
  return out;
}
// One company's awards via three small count queries (no full scan).
async function companyAwards(r){
  const rank=rankOf(r),slug=cleanSlug(r.slug);
  if(!rank||!slug) return [];
  const ahead="(hmda_rank.lt."+rank+",and(hmda_rank.eq."+rank+",slug.lt."+slug+"))";
  const cat=Object.prototype.hasOwnProperty.call(CATS,txt(r.cat_slug))?txt(r.cat_slug):"";
  const st=cleanState(r.state_code);
  const [catAhead,stTotal,stAhead]=await Promise.all([
    cat?countRanked({cat_slug:"eq."+cat,or:ahead}):null,
    st?countRanked({state_code:"ilike."+st}):null,
    st?countRanked({state_code:"ilike."+st,or:ahead}):null
  ]);
  return awardsFor(rank,cat,cat?catAhead+1:0,st&&stTotal>=STATE_MIN&&stAhead===0?st:"");
}
// All categories from the full ranked scan.
function computeAll(rows){
  const top100=rows.filter(r=>rankOf(r)<=100);
  const cats={};
  for(const cs of Object.keys(CATS)) cats[cs]=rows.filter(r=>txt(r.cat_slug)===cs).slice(0,CAT_TOP);
  const m=new Map();
  for(const r of rows){const st=cleanState(r.state_code);if(!st) continue;const e=m.get(st);if(e) e.n++;else m.set(st,{st,n:1,row:r});}
  const states=[...m.values()].filter(e=>e.n>=STATE_MIN).sort((a,b)=>STATE_NAMES[a.st].localeCompare(STATE_NAMES[b.st]));
  return {top100,cats,states};
}
function honoreePath(slug){return AWARD+"/"+encodeURIComponent(slug);}
function lenderCell(r){
  const slug=cleanSlug(r.slug),name=txt(r.name)||"Unnamed lender";
  return slug?'<a href="'+esc(honoreePath(slug))+'">'+esc(name)+'</a>':esc(name);
}
function cells(r){
  return '<td class="rk-name">'+lenderCell(r)+'</td><td>'+esc(hq(r))+'</td><td class="n">'+esc(fmtUsd(r.hmda_volume_usd))+'</td><td class="n">'+esc(fmtInt(r.hmda_count))+'</td>';
}
function card(head,body){return '<div class="rk-card"><table class="rk-table"><thead>'+head+'</thead><tbody>'+body+'</tbody></table></div>';}
const TAIL='<th>Lender</th><th>HQ</th><th class="n">2025 volume</th><th class="n">Loans</th>';
function nationalTable(rows){
  return card('<tr><th class="n">Rank</th>'+TAIL+'</tr>',rows.map(r=>'<tr><td class="n rk-pos">#'+esc(fmtInt(rankOf(r)))+'</td>'+cells(r)+'</tr>').join(""));
}
function categoryTable(rows){
  return card('<tr><th class="n">Rank</th><th class="n">U.S. rank</th>'+TAIL+'</tr>',rows.map((r,i)=>'<tr><td class="n rk-pos">#'+(i+1)+'</td><td class="n">#'+esc(fmtInt(rankOf(r)))+'</td>'+cells(r)+'</tr>').join(""));
}
function stateTable(list){
  return card('<tr><th>State</th><th class="n">U.S. rank</th>'+TAIL+'<th class="n">Ranked HQ lenders</th></tr>',list.map(e=>'<tr><td class="rk-pos">'+esc(STATE_NAMES[e.st])+'</td><td class="n">#'+esc(fmtInt(rankOf(e.row)))+'</td>'+cells(e.row)+'<td class="n">'+esc(fmtInt(e.n))+'</td></tr>').join(""));
}
function itemList(name,items){
  return {"@context":"https://schema.org","@type":"ItemList",name,numberOfItems:items.length,itemListElement:items.map(it=>({"@type":"ListItem",position:it.position,name:it.name,url:it.url}))};
}
function rowItems(rows,posFn,nameFn){
  return rows.map((r,i)=>({r,i})).filter(o=>cleanSlug(o.r.slug)).map(o=>({position:posFn(o.r,o.i),name:nameFn?nameFn(o.r,o.i):txt(o.r.name),url:ORIGIN+honoreePath(cleanSlug(o.r.slug))}));
}
function crumbsOf(list){
  const all=[{name:"Rankings",href:"/rankings"},{name:PROGRAM,href:AWARD}].concat(list||[]);
  return {
    ld:{"@context":"https://schema.org","@type":"BreadcrumbList",itemListElement:all.map((c,i)=>({"@type":"ListItem",position:i+1,name:c.name,item:ORIGIN+c.href}))},
    html:'<nav class="rk-crumbs" aria-label="Breadcrumb">'+all.map(c=>'<a href="'+esc(c.href)+'">'+esc(c.name)+'</a>').join(' <span aria-hidden="true">›</span> ')+'</nav>'
  };
}
// "Claim your page" box (unclaimed companies) or "Manage this page" (claimed).
function claimBox(slug,unclaimed){
  const enc=encodeURIComponent(slug);
  if(unclaimed!==true){
    return '<section class="rk-claim"><h2>Manage this page</h2><p>This company page has been claimed on Pegasus Capital Network. Members who manage it can update the details, add the team and display the official badge.</p>'+
      '<a class="rk-cta" href="/my-presences.html">Manage this page →</a></section>';
  }
  return '<section class="rk-claim"><h2>Is this your company? Claim your page</h2><p>Take ownership of the company page on Pegasus Capital Network.</p>'+
    '<ol class="rk-steps"><li><strong>Claim your page</strong> (free)</li><li><strong>Verify</strong> — instant with a work email on your company’s domain, otherwise a quick manual review</li><li><strong>Complete your profile</strong></li><li><strong>Add your team</strong></li></ol>'+
    '<a class="rk-cta" href="/claim?presence='+esc(enc)+'">Claim your page — free →</a>'+
    '<p class="rk-alt">Already claimed? <a href="/my-presences.html">Manage your page →</a></p></section>';
}
const COPY_JS='<script>(function(){var bs=document.querySelectorAll("[data-copy]");for(var i=0;i<bs.length;i++)(function(b){b.addEventListener("click",function(){var t=document.getElementById(b.getAttribute("data-copy"));if(!t)return;var l=b.getAttribute("data-label")||"Copy";function done(){b.textContent="Copied";setTimeout(function(){b.textContent=l;},1800);}if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t.value).then(done,function(){t.select();try{document.execCommand("copy");done();}catch(_){}});}else{t.select();try{document.execCommand("copy");done();}catch(_){}}});})(bs[i]);})();</script>';
const CSS='.dir-wrap{max-width:1120px;margin:auto;padding:48px 40px 72px}.dir-head{text-align:center;max-width:780px;margin:0 auto 24px}.dir-head h1{font-family:var(--serif);font-size:clamp(32px,5vw,50px);font-weight:400;margin:8px 0 12px}.dir-head p{color:var(--text2);line-height:1.65}'+
  '.rk-crumbs{font-size:12px;color:var(--text3);margin-bottom:8px}.rk-crumbs a{color:var(--blue);text-decoration:none}'+
  '.rk-card{background:var(--bg1);border:1px solid var(--border);border-radius:16px;box-shadow:var(--sh-card);overflow-x:auto;margin-top:22px}.rk-table{width:100%;border-collapse:collapse;font-size:13.5px}.rk-table th{text-align:left;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--text3);font-weight:600;padding:12px 14px;border-bottom:1px solid var(--border);white-space:nowrap}.rk-table td{padding:11px 14px;border-bottom:1px solid var(--border);color:var(--text2);vertical-align:top}.rk-table tr:last-child td{border-bottom:0}.rk-table .n{text-align:right;font-family:var(--mono);white-space:nowrap}.rk-table .rk-pos{color:var(--text);font-weight:600}.rk-name a{color:var(--text);text-decoration:none;font-weight:600}.rk-name a:hover{color:var(--blue)}'+
  '.rk-cta{display:inline-block;margin-top:14px;padding:11px 18px;border-radius:10px;background:var(--blue);color:#fff;text-decoration:none;font-weight:600;font-size:14px}'+
  '.rk-h2{font-size:18px;margin:34px 0 4px;color:var(--text)}.rk-note{font-size:12px;color:var(--text3);margin-top:18px;line-height:1.6;text-align:center}'+
  '.rk-embed{width:100%;min-height:110px;font-family:var(--mono);font-size:12px;padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--bg1);color:var(--text);resize:vertical;box-sizing:border-box}.rk-copy{margin-top:10px;padding:9px 16px;border-radius:9px;border:0;background:var(--blue);color:#fff;font-weight:600;cursor:pointer}'+
  '.rk-claim{margin-top:30px;padding:20px 22px;border:1px solid var(--border);border-radius:16px;background:var(--bg1);box-shadow:var(--sh-card)}.rk-claim h2{font-size:18px;margin:0 0 6px;color:var(--text)}.rk-claim p{color:var(--text2);font-size:13.5px;line-height:1.6;margin:0}.rk-steps{margin:14px 0 4px;padding-left:22px;color:var(--text2);font-size:13.5px;line-height:1.8}.rk-steps strong{color:var(--text)}.rk-claim .rk-alt{margin-top:10px;font-size:13px}.rk-claim .rk-alt a{color:var(--blue);text-decoration:none;font-weight:600}'+
  '.aw-eyebrow{justify-content:center;color:var(--gold)}.aw-eyebrow::before{background:var(--gold)}'+
  '.aw-method{max-width:780px;margin:22px auto 0;padding:16px 20px;border:1px solid var(--border);border-left:3px solid var(--gold);border-radius:12px;background:var(--bg1);font-size:13.5px;line-height:1.65;color:var(--text2)}.aw-method strong{color:var(--text)}.aw-method a{color:var(--blue);text-decoration:none}'+
  '.aw-toc{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:18px}.aw-toc a{padding:7px 12px;border:1px solid var(--border);border-radius:999px;font-size:12.5px;color:var(--text2);text-decoration:none;background:var(--bg1)}'+
  '.aw-sec{scroll-margin-top:80px}.aw-sub{color:var(--text2);font-size:13.5px;margin:0}'+
  '.aw-awards{list-style:none;padding:0;margin:18px auto 0;max-width:640px;display:grid;gap:10px}.aw-awards li{padding:12px 16px;border:1px solid var(--border);border-left:3px solid var(--gold);border-radius:12px;background:var(--bg1);font-weight:600;font-size:14.5px}.aw-awards a{color:var(--text);text-decoration:none}'+
  '.aw-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-top:18px}.aw-stats div{padding:12px 14px;border:1px solid var(--border);border-radius:12px;background:var(--bg1)}.aw-stats span{display:block;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--text3)}.aw-stats b{display:block;margin-top:4px;font-family:var(--mono);font-size:15px;color:var(--text);font-weight:600}'+
  '.aw-share{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px}.aw-share a{padding:9px 14px;border:1px solid var(--border);border-radius:9px;text-decoration:none;color:var(--text);font-size:13.5px;font-weight:600;background:var(--bg1)}'+
  '.aw-pr{min-height:340px;font-family:var(--sans);font-size:13px;line-height:1.55}.aw-links{text-align:center;margin-top:22px;font-size:13px}.aw-links a{color:var(--blue);text-decoration:none}'+
  '.rk-deal{text-align:center;margin:-10px auto 22px;font-size:13.5px}.rk-deal a{color:var(--blue);text-decoration:none;font-weight:600}'+
  '@media(max-width:760px){.dir-wrap{padding:32px 16px 54px}}';
// Lender Matcher CTA shown under the page header.
const DEAL_CTA='<p class="rk-deal"><a href="/find-a-lender">Have a deal? Find a matching lender →</a></p>';
// Page shell — same nav/footer as the ranking pages.
function shell(o){
  const robots=o.robots||"index,follow,max-image-preview:large";
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>'+esc(o.title)+'</title><meta name="description" content="'+esc(o.desc)+'"><meta name="robots" content="'+esc(robots)+'">'+
    (o.canonical?'<link rel="canonical" href="'+esc(o.canonical)+'">':'')+
    '<meta property="og:type" content="website"><meta property="og:site_name" content="Pegasus Capital Network"><meta property="og:title" content="'+esc(o.title)+'"><meta property="og:description" content="'+esc(o.desc)+'">'+
    (o.canonical?'<meta property="og:url" content="'+esc(o.canonical)+'">':'')+
    '<meta name="twitter:card" content="summary"><meta name="twitter:title" content="'+esc(o.title)+'"><meta name="twitter:description" content="'+esc(o.desc)+'">'+
    '<link rel="stylesheet" href="/css/pegasus.css"><link rel="icon" href="/assets/brand/favicon.ico">'+
    (o.ld||[]).map(ld).join("")+
    '<style>'+CSS+'</style><script src="/js/i18n.js?v=20261021e"></script><script src="/js/ticker.js?v=20261021a" defer></script></head><body>'+
    '<nav class="pub-nav"><a class="brand" href="/"><img class="brand-mark" src="/assets/brand/pegasus-symbol.svg" alt="Pegasus"><span>Pegasus Network</span></a><div class="pub-links"><a href="/feed">Feed</a><a href="/people">People</a><a href="/businesses">Businesses</a><a href="/events">Events</a><a href="/rankings">Rankings</a></div><div class="nav-cta" id="dirNavCta"><a class="btn btn-ghost" href="/signin.html">Sign In</a><a class="btn btn-pri" href="/signup.html">Create Free Profile</a></div></nav>'+
    // Page is CDN-cached for everyone, so swap the guest CTA client-side for signed-in members.
    '<script>(function(){try{var raw=localStorage.getItem("pegasus.auth");if(!raw)return;var pj=JSON.parse(raw);if(!(pj&&(pj.access_token||(pj.currentSession&&pj.currentSession.access_token))))return;var c=document.getElementById("dirNavCta");if(!c)return;var s="";try{s=localStorage.getItem("peg_slug")||"";}catch(_){}c.innerHTML=\'<a class="btn btn-ghost" href="/members.html">Members Network</a><a class="btn btn-ghost" href="\'+(s?"/u/"+encodeURIComponent(s):"/profile-edit.html")+\'">My Profile</a><a class="btn btn-pri" href="/dashboard.html">My Workspace →</a>\';}catch(_){}})();</script>'+
    '<main class="dir-wrap">'+o.body+'<p class="rk-note">'+esc(SOURCE)+'</p></main>'+
    '<footer style="text-align:center;padding:28px;color:var(--text3);border-top:1px solid var(--border)"><a href="/" style="color:inherit">Pegasus Capital Network</a> · <a href="'+esc(AWARD)+'" style="color:inherit">Top Lenders 2025</a> · <a href="/rankings" style="color:inherit">2025 Lender Rankings</a> · <a href="/businesses" style="color:inherit">Business Directory</a></footer></body></html>';
}
const HTML="text/html; charset=utf-8";
function ok(html,robots){
  return new Response(html,{status:200,headers:{"Content-Type":HTML,"Cache-Control":"public, max-age=0, s-maxage=3600, stale-while-revalidate=86400","X-Robots-Tag":robots||"index,follow,max-image-preview:large"}});
}
function noindex(html,status){
  return new Response(html,{status,headers:{"Content-Type":HTML,"Cache-Control":"public, max-age=0, s-maxage=60","X-Robots-Tag":"noindex,follow"}});
}
function notFound(msg){
  return noindex(shell({title:"Award page not found — Pegasus Capital Network",desc:msg,robots:"noindex,follow",
    body:'<header class="dir-head"><div class="eyebrow aw-eyebrow">'+esc(PROGRAM)+'</div><h1>Page not found</h1><p>'+esc(msg)+'</p><a class="rk-cta" href="'+esc(AWARD)+'">See the Pegasus Top Lenders 2025 →</a></header>'}),404);
}
// Query failure → friendly 200 page, noindex, short cache. Never a 503.
function unavailable(){
  return noindex(shell({title:PROGRAM+" — Pegasus Capital Network",desc:"The Pegasus Top Lenders 2025 awards are temporarily unavailable.",robots:"noindex,follow",
    body:'<header class="dir-head"><div class="eyebrow aw-eyebrow">'+esc(PROGRAM)+'</div><h1>The awards are loading slowly</h1><p>We could not load the Pegasus Top Lenders 2025 just now. Please try again in a minute.</p><a class="rk-cta" href="/rankings">See the 2025 lender rankings →</a></header>'}),200);
}

async function awardPage(){
  const rows=await fetchAllRanked();
  if(!rows.length) return unavailable();
  const {top100,cats,states}=computeAll(rows);
  const canonical=ORIGIN+AWARD;
  const title=PROGRAM+": Largest U.S. Mortgage Lenders by 2025 Volume — Pegasus Capital Network";
  const desc="The Pegasus Top Lenders 2025: the largest U.S. mortgage lenders by total 2025 origination volume reported under HMDA — Top 10, Top 25 and Top 100, top banks & credit unions, top independent mortgage companies, and state leaders.";
  const cr=crumbsOf([]);
  const top10=top100.filter(r=>rankOf(r)<=10),top25=top100.filter(r=>rankOf(r)>10&&rankOf(r)<=25),rest=top100.filter(r=>rankOf(r)>25);
  const banks=cats["financial-institutions"],imcs=cats["mortgage-companies"];
  const toc=[["top-10","Top 10"],["top-25","Top 25"],["top-100","Top 100"],[CATS["financial-institutions"].id,"Banks & Credit Unions"],[CATS["mortgage-companies"].id,"Independent Mortgage Companies"],["state-leaders","State Leaders"]];
  const sec=(id,h,sub,inner)=>'<section class="aw-sec" id="'+esc(id)+'"><h2 class="rk-h2">'+esc(h)+'</h2><p class="aw-sub">'+esc(sub)+'</p>'+inner+'</section>';
  const empty='<p style="text-align:center;color:var(--text3);padding:24px">No lenders in this category yet.</p>';
  const body='<header class="dir-head">'+cr.html+'<div class="eyebrow aw-eyebrow">Awards · 2025</div><h1>'+esc(PROGRAM)+'</h1>'+
    '<p>The largest U.S. mortgage lenders by 2025 origination volume — nationwide, among banks &amp; credit unions, among independent mortgage companies, and in each headquarters state.</p>'+
    '<nav class="aw-toc" aria-label="Award categories">'+toc.map(([id,l])=>'<a href="#'+esc(id)+'">'+esc(l)+'</a>').join("")+'</nav></header>'+DEAL_CTA+
    '<div class="aw-method"><strong>Methodology.</strong> '+esc(METHOD)+' Each lender’s national tier is the smallest bucket it fits (Top 10, Top 25 or Top 100). Category ranks order banks &amp; credit unions and independent mortgage companies by their U.S. rank. A State Leader is the highest-ranked lender headquartered in a state with at least '+STATE_MIN+' ranked headquartered lenders. <a href="/rankings">See the full 2025 rankings →</a><br><span style="font-size:12px;color:var(--text3)">'+esc(SOURCE)+'</span></div>'+
    sec("top-10","Top 10 U.S. Mortgage Lenders 2025","U.S. ranks 1–10.",top10.length?nationalTable(top10):empty)+
    sec("top-25","Top 25 U.S. Mortgage Lenders 2025","U.S. ranks 11–25 (the Top 10 above complete the Top 25).",top25.length?nationalTable(top25):empty)+
    sec("top-100","Top 100 U.S. Mortgage Lenders 2025","U.S. ranks 26–100 (the Top 25 above complete the Top 100).",rest.length?nationalTable(rest):empty)+
    sec(CATS["financial-institutions"].id,CATS["financial-institutions"].title,CATS["financial-institutions"].blurb,banks.length?categoryTable(banks):empty)+
    sec(CATS["mortgage-companies"].id,CATS["mortgage-companies"].title,CATS["mortgage-companies"].blurb,imcs.length?categoryTable(imcs):empty)+
    sec("state-leaders","State Leaders 2025","The highest-ranked lender headquartered in each state with at least "+STATE_MIN+" ranked headquartered lenders. Ranked by total U.S. volume, not only loans made in that state.",states.length?stateTable(states):empty)+
    '<p class="aw-links"><a href="'+esc(RANK_BASE)+'">Top 100 U.S. Mortgage Lenders 2025 (full table) →</a> · <a href="/rankings">Rankings by headquarters state →</a></p>';
  const page={"@context":"https://schema.org","@type":"WebPage",name:PROGRAM,url:canonical,description:desc,isPartOf:{"@type":"WebSite",name:"Pegasus Capital Network",url:ORIGIN}};
  const lds=[page,
    itemList("Top 100 U.S. Mortgage Lenders 2025",rowItems(top100,r=>rankOf(r))),
    itemList(CATS["financial-institutions"].title,rowItems(banks,(r,i)=>i+1)),
    itemList(CATS["mortgage-companies"].title,rowItems(imcs,(r,i)=>i+1)),
    itemList("State Leaders 2025",rowItems(states.map(e=>e.row),(r,i)=>i+1,(r,i)=>txt(r.name)+" — "+STATE_NAMES[states[i].st])),
    cr.ld];
  return ok(shell({title,desc,canonical,ld:lds,body}));
}

function pressRelease(name,r,awards){
  const rank=rankOf(r),vol=fmtUsdLong(r.hmda_volume_usd),cnt=Number(r.hmda_count);
  const p1="[CITY, STATE] — [DATE] — "+name+" has been named a Pegasus Top Lender 2025 by Pegasus Capital Network, ranking #"+fmtInt(rank)+" among U.S. mortgage lenders by total 2025 mortgage origination volume.";
  const p2=name+" is recognized in "+(awards.length>1?"the following Pegasus Top Lenders 2025 categories: ":"the Pegasus Top Lenders 2025 category ")+awards.map(a=>a.pr).join("; ")+"."+
    (vol?" In 2025, "+name+" reported "+vol+" in mortgage originations"+(Number.isFinite(cnt)&&cnt>0?" across "+fmtInt(cnt)+" loans":"")+" under the Home Mortgage Disclosure Act (HMDA).":"");
  const p3="The Pegasus Top Lenders 2025 recognize the largest U.S. mortgage lenders by 2025 origination volume. Lenders are ranked by total 2025 mortgage origination volume reported under the Home Mortgage Disclosure Act (HMDA), a public data source, aggregated by Pegasus Capital Network. The full list is available at "+ORIGIN+AWARD+".";
  return ["FOR IMMEDIATE RELEASE","",name+" Named a Pegasus Top Lender 2025","",p1,"",p2,"",p3,"",
    "About Pegasus Capital Network","Pegasus Capital Network is a professional network for real estate developers, lenders, brokers, and capital partners. Learn more at pegasuscapitalnetwork.com.","",
    "Media contact: info@pegasuscapitalnetwork.com","","###"].join("\n");
}

async function honoreePage(slug){
  const r=await lookup(slug);
  if(!r) return notFound("We could not find that company among the Pegasus Top Lenders 2025.");
  const awards=await companyAwards(r);
  const name=txt(r.name)||"This company",rank=rankOf(r),enc=encodeURIComponent(slug);
  const path=honoreePath(slug),canonical=ORIGIN+path,profile="/business/"+enc;
  const cr=crumbsOf([{name,href:path}]);
  const vol=fmtUsd(r.hmda_volume_usd),cnt=Number(r.hmda_count);
  const stats=[["U.S. rank",rank?"#"+fmtInt(rank):""],["2025 volume",vol],["Loans",Number.isFinite(cnt)&&cnt>0?fmtInt(cnt):""],["Headquarters",hq(r)],["Category",txt(r.cat_label)]].filter(s=>s[1]);
  const statsHtml=stats.length?'<div class="aw-stats">'+stats.map(s=>'<div><span>'+esc(s[0])+'</span><b>'+esc(s[1])+'</b></div>').join("")+'</div>':'';
  const profileLink='<p class="aw-links"><a href="'+esc(profile)+'">View company profile →</a> · <a href="'+esc(AWARD)+'">All Pegasus Top Lenders 2025 →</a> · <a href="/rankings">2025 rankings →</a></p>';
  if(!awards.length){
    const lead=rank
      ?esc(name)+' is ranked <strong>#'+esc(fmtInt(rank))+'</strong> among U.S. mortgage lenders by total 2025 origination volume reported under HMDA, but is not among the Pegasus Top Lenders 2025 honorees.'
      :esc(name)+' does not appear in the 2025 HMDA lender ranking and is not among the Pegasus Top Lenders 2025 honorees.';
    const body='<header class="dir-head">'+cr.html+'<div class="eyebrow aw-eyebrow">'+esc(PROGRAM)+'</div><h1>'+esc(name)+'</h1><p>'+lead+'</p>'+
      (rank?'<a class="rk-cta" href="/rankings/badge/'+esc(enc)+'">Get the 2025 ranking badge →</a>':'')+'</header>'+
      '<section style="max-width:720px;margin:0 auto">'+statsHtml+claimBox(slug,r.unclaimed)+'</section>'+profileLink;
    return ok(shell({title:name+" — "+PROGRAM+" — Pegasus Capital Network",desc:name+" is not among the Pegasus Top Lenders 2025 honorees.",canonical,robots:"noindex,follow",ld:[cr.ld],body}),"noindex,follow");
  }
  const labels=awards.map(a=>a.label);
  const img=ORIGIN+"/badge/award/"+enc+".svg";
  const alt=PROGRAM+" — "+awards[0].label;
  // Snippet is HTML the visitor pastes elsewhere: escape its attributes, then
  // escape the whole snippet again for the <textarea>.
  const snippet='<a href="'+esc(canonical)+'" title="'+esc(name+" — "+PROGRAM+" honoree")+'"><img src="'+esc(img)+'" alt="'+esc(alt)+'" width="300" height="64"></a>';
  const shareText=name+" is a Pegasus Top Lender 2025 — "+awards[0].label+".";
  const mailSubject=name+" named a Pegasus Top Lender 2025";
  const mailBody=name+" was named a Pegasus Top Lender 2025 ("+awards.map(a=>a.pr).join("; ")+"), based on total 2025 mortgage origination volume reported under HMDA.\n\n"+canonical;
  const share='<div class="aw-share">'+
    '<a href="'+esc("https://www.linkedin.com/sharing/share-offsite/?url="+encodeURIComponent(canonical))+'" target="_blank" rel="noopener noreferrer">Share on LinkedIn</a>'+
    '<a href="'+esc("https://twitter.com/intent/tweet?text="+encodeURIComponent(shareText)+"&url="+encodeURIComponent(canonical))+'" target="_blank" rel="noopener noreferrer">Share on X</a>'+
    '<a href="'+esc("mailto:?subject="+encodeURIComponent(mailSubject)+"&body="+encodeURIComponent(mailBody))+'">Share by email</a></div>';
  const lead=esc(name)+' is a Pegasus Top Lender 2025 honoree, ranked <strong>#'+esc(fmtInt(rank))+'</strong> among U.S. mortgage lenders by total 2025 origination volume reported under HMDA'+
    (vol?' ('+esc(vol)+(Number.isFinite(cnt)&&cnt>0?' across '+esc(fmtInt(cnt))+' loans':'')+')':'')+'.';
  const body='<header class="dir-head">'+cr.html+'<div class="eyebrow aw-eyebrow">'+esc(PROGRAM)+' · Honoree</div><h1>'+esc(name)+'</h1><p>'+lead+'</p></header>'+
    '<ul class="aw-awards">'+awards.map(a=>'<li><a href="'+esc(AWARD+"#"+a.anchor)+'">'+esc(a.label)+'</a></li>').join("")+'</ul>'+
    '<section style="max-width:720px;margin:0 auto">'+statsHtml+
    '<div class="aw-method"><strong>Methodology.</strong> '+esc(METHOD)+'</div>'+
    '<h2 class="rk-h2">Award badge</h2><p class="aw-sub" style="margin-bottom:10px">Copy this HTML into your website. The badge links to this honoree page.</p>'+
    '<div style="text-align:center;padding:26px;border:1px solid var(--border);border-radius:16px;background:var(--bg1);margin-bottom:12px"><img src="/badge/award/'+esc(enc)+'.svg" alt="'+esc(alt)+'" width="300" height="64"></div>'+
    '<textarea id="awEmbed" class="rk-embed" readonly onclick="this.select()">'+esc(snippet)+'</textarea>'+
    '<button type="button" class="rk-copy" data-copy="awEmbed" data-label="Copy embed code">Copy embed code</button>'+
    '<h2 class="rk-h2">Press-release kit</h2><p class="aw-sub" style="margin-bottom:10px">A ready-to-edit announcement built from the ranking data. Fill in the dateline before publishing.</p>'+
    '<textarea id="awPress" class="rk-embed aw-pr">'+esc(pressRelease(name,r,awards))+'</textarea>'+
    '<button type="button" class="rk-copy" data-copy="awPress" data-label="Copy press release">Copy press release</button>'+
    '<h2 class="rk-h2">Share the news</h2>'+share+
    claimBox(slug,r.unclaimed)+
    '</section>'+profileLink+COPY_JS;
  const org={"@context":"https://schema.org","@type":"Organization",name,url:ORIGIN+profile,award:labels};
  const desc=name+" is a Pegasus Top Lenders 2025 honoree: "+labels.join("; ")+". Based on total 2025 mortgage origination volume reported under HMDA.";
  return ok(shell({title:name+" — "+PROGRAM+" Honoree — Pegasus Capital Network",desc,canonical,ld:[org,cr.ld],body}));
}

export default async (request)=>{
  const u=new URL(request.url);
  // Netlify rewrites hand the function the ORIGINAL URL, so route from the pretty
  // path first; query params are the fallback for direct function calls.
  const p=u.pathname.replace(/\/+$/,"");
  let view,arg,m;
  if(p===AWARD) view="index";
  else if((m=p.match(/^\/awards\/top-lenders-2025\/([^\/]+)$/))){view="honoree";arg=m[1];}
  else{view=u.searchParams.get("view")||"";arg=view==="honoree"?u.searchParams.get("slug"):"";}
  try{
    if(view==="index") return await awardPage();
    if(view==="honoree"){
      let raw="";try{raw=decodeURIComponent(arg||"");}catch(_){}
      const slug=cleanSlug(raw);
      if(!slug) return notFound("We could not find that company among the Pegasus Top Lenders 2025.");
      return await honoreePage(slug);
    }
    return notFound("That award page does not exist.");
  }catch(err){
    console.error("[hmda-awards]",err);
    try{return unavailable();}catch(_){return new Response("The Pegasus Top Lenders 2025 are temporarily unavailable.",{status:200,headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store","X-Robots-Tag":"noindex"}});}
  }
};
