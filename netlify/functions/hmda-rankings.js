// Pegasus SEO — HMDA 2025 lender ranking pages + the embeddable badge page.
//   /rankings                                  → index (national link + HQ-state grid)
//   /rankings/top-mortgage-lenders-2025        → national Top 100 (?page=2..10 → ranks 101–1000)
//   /rankings/top-mortgage-lenders-2025/:st    → lenders HEADQUARTERED in :st, by U.S. rank
//   /rankings/badge/:slug                      → badge preview + embed snippet (noindex)
// Rank 1 = largest 2025 U.S. mortgage originator by total HMDA-reported volume.
// Self-contained (Netlify functions do not reliably bundle cross-file imports).

const ORIGIN="https://pegasuscapitalnetwork.com";
const BASE="/rankings/top-mortgage-lenders-2025";
const PER_PAGE=100;
const MAX_PAGES=10;
const STATE_MIN=3; // states with ≥3 ranked HQ lenders get an indexable page
const SOURCE="Source: Home Mortgage Disclosure Act (HMDA) 2025 public data, aggregated by Pegasus Capital Network.";
function env(name){return globalThis.Netlify?.env?.get(name)||"";}
function cfg(){
  const url=env("SUPABASE_URL"),key=env("SUPABASE_PUBLISHABLE_KEY");
  if(!url||!key) throw new Error("Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY");
  return {url:url.replace(/\/$/,""),key};
}
function esc(v){return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}
function txt(v){return String(v||"").replace(/\s+/g," ").trim();}
function cleanSlug(v){const s=String(v||"").trim();return /^[a-z0-9][a-z0-9-]*$/i.test(s)?s:"";}
// US states + DC + PR. A state code is only used (URL, PostgREST filter, H1)
// after validation via cleanState().
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
function fmtInt(n){const v=Number(n);return Number.isFinite(v)?Math.round(v).toLocaleString("en-US"):"";}
function parseTotal(cr){const m=String(cr||"").match(/\/(\d+)$/);return m?parseInt(m[1],10):null;}
function rankOf(r){const n=Number(r&&r.hmda_rank);return Number.isFinite(n)&&n>=1?n:0;}
function ld(obj){return '<script type="application/ld+json">'+JSON.stringify(obj).replace(/</g,"\\u003c")+'</script>';}
const COLS="name,slug,city,state_code,hmda_rank,hmda_volume_usd,hmda_count";
// Ranked rows from public_business_directory, ordered by U.S. rank.
async function fetchRanked(params,from,to,count){
  const {url,key}=cfg();
  const qs=new URLSearchParams({hmda_rank:"not.is.null",order:"hmda_rank.asc",...params});
  const headers={apikey:key,Authorization:"Bearer "+key,Range:from+"-"+to,"Range-Unit":"items"};
  if(count) headers.Prefer="count=exact";
  const res=await fetch(url+"/rest/v1/public_business_directory?"+qs.toString(),{headers});
  if(res.status===416) return {rows:[],total:parseTotal(res.headers.get("content-range"))};
  if(!res.ok){const body=await res.text().catch(()=> "");throw new Error("rankings query failed: "+res.status+" "+body.slice(0,300));}
  const rows=await res.json();
  return {rows:Array.isArray(rows)?rows:[],total:parseTotal(res.headers.get("content-range"))};
}
// Ranked-lender counts per (valid) HQ state, largest first.
async function stateCounts(){
  const {rows}=await fetchRanked({select:"state_code"},0,4999,false);
  const m=new Map();
  for(const r of rows){const st=cleanState(r.state_code);if(st) m.set(st,(m.get(st)||0)+1);}
  return [...m.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
}
function hq(r){const st=cleanState(r.state_code);return [txt(r.city),st].filter(Boolean).join(", ");}
function lenderCell(r){
  const slug=cleanSlug(r.slug),name=txt(r.name)||"Unnamed lender";
  return slug?'<a href="/business/'+esc(encodeURIComponent(slug))+'">'+esc(name)+'</a>':esc(name);
}
function badgeCell(r){
  const slug=cleanSlug(r.slug);
  return slug?'<a class="rk-badge" href="/rankings/badge/'+esc(encodeURIComponent(slug))+'" rel="nofollow">Badge</a>':'';
}
function table(rows,withState){
  const head='<tr>'+(withState?'<th class="n">Rank in state</th>':'')+'<th class="n">'+(withState?'U.S. rank':'Rank')+'</th><th>Lender</th><th>HQ</th><th class="n">2025 volume</th><th class="n">Loans</th><th></th></tr>';
  const body=rows.map((r,i)=>'<tr>'+(withState?'<td class="n rk-pos">'+(i+1)+'</td>':'')+
    '<td class="n'+(withState?'':' rk-pos')+'">'+esc(fmtInt(rankOf(r)))+'</td><td class="rk-name">'+lenderCell(r)+'</td><td>'+esc(hq(r))+'</td>'+
    '<td class="n">'+esc(fmtUsd(r.hmda_volume_usd))+'</td><td class="n">'+esc(fmtInt(r.hmda_count))+'</td><td>'+badgeCell(r)+'</td></tr>').join("");
  return '<div class="rk-card"><table class="rk-table"><thead>'+head+'</thead><tbody>'+body+'</tbody></table></div>';
}
function itemList(name,items){
  return {"@context":"https://schema.org","@type":"ItemList",name,numberOfItems:items.length,itemListElement:items.map(it=>({"@type":"ListItem",position:it.position,name:it.name,url:it.url}))};
}
function rowItems(rows,posFn){
  return rows.filter(r=>cleanSlug(r.slug)).map((r,i)=>({position:posFn(r,i),name:txt(r.name),url:ORIGIN+"/business/"+encodeURIComponent(cleanSlug(r.slug))}));
}
function crumbsOf(list){
  const all=[{name:"Rankings",href:"/rankings"}].concat(list||[]);
  return {
    ld:{"@context":"https://schema.org","@type":"BreadcrumbList",itemListElement:all.map((c,i)=>({"@type":"ListItem",position:i+1,name:c.name,item:ORIGIN+c.href}))},
    html:'<nav class="rk-crumbs" aria-label="Breadcrumb">'+all.map(c=>'<a href="'+esc(c.href)+'">'+esc(c.name)+'</a>').join(' <span aria-hidden="true">›</span> ')+'</nav>'
  };
}
const CSS='.dir-wrap{max-width:1120px;margin:auto;padding:48px 40px 72px}.dir-head{text-align:center;max-width:780px;margin:0 auto 24px}.dir-head h1{font-family:var(--serif);font-size:clamp(32px,5vw,50px);font-weight:400;margin:8px 0 12px}.dir-head p{color:var(--text2);line-height:1.65}'+
  '.rk-crumbs{font-size:12px;color:var(--text3);margin-bottom:8px}.rk-crumbs a{color:var(--blue);text-decoration:none}'+
  '.rk-card{background:var(--bg1);border:1px solid var(--border);border-radius:16px;box-shadow:var(--sh-card);overflow-x:auto;margin-top:22px}.rk-table{width:100%;border-collapse:collapse;font-size:13.5px}.rk-table th{text-align:left;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--text3);font-weight:600;padding:12px 14px;border-bottom:1px solid var(--border);white-space:nowrap}.rk-table td{padding:11px 14px;border-bottom:1px solid var(--border);color:var(--text2);vertical-align:top}.rk-table tr:last-child td{border-bottom:0}.rk-table .n{text-align:right;font-family:var(--mono);white-space:nowrap}.rk-table .rk-pos{color:var(--text);font-weight:600}.rk-name a{color:var(--text);text-decoration:none;font-weight:600}.rk-name a:hover{color:var(--blue)}'+
  '.rk-badge{display:inline-block;font-size:10.5px;font-family:var(--mono);color:var(--blue);background:var(--blue-dim);border-radius:999px;padding:3px 9px;text-decoration:none;white-space:nowrap}'+
  '.rk-cta{display:inline-block;margin-top:14px;padding:11px 18px;border-radius:10px;background:var(--blue);color:#fff;text-decoration:none;font-weight:600;font-size:14px}'+
  '.rk-states{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px;margin-top:18px}.rk-states a{display:flex;justify-content:space-between;gap:10px;padding:12px 14px;border:1px solid var(--border);border-radius:12px;background:var(--bg1);text-decoration:none;color:var(--text);font-size:13.5px}.rk-states a span{color:var(--text3);font-family:var(--mono);font-size:12px}'+
  '.rk-h2{font-size:18px;margin:34px 0 4px;color:var(--text)}.rk-note{font-size:12px;color:var(--text3);margin-top:18px;line-height:1.6;text-align:center}.dir-pager{display:flex;justify-content:center;gap:10px;margin-top:26px}.dir-pager a{padding:9px 14px;border:1px solid var(--border);border-radius:9px;text-decoration:none;color:var(--text2)}'+
  '.rk-embed{width:100%;min-height:110px;font-family:var(--mono);font-size:12px;padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--bg1);color:var(--text);resize:vertical;box-sizing:border-box}.rk-copy{margin-top:10px;padding:9px 16px;border-radius:9px;border:0;background:var(--blue);color:#fff;font-weight:600;cursor:pointer}'+
  '.rk-claim{margin-top:30px;padding:20px 22px;border:1px solid var(--border);border-radius:16px;background:var(--bg1);box-shadow:var(--sh-card)}.rk-claim h2{font-size:18px;margin:0 0 6px;color:var(--text)}.rk-claim p{color:var(--text2);font-size:13.5px;line-height:1.6;margin:0}.rk-steps{margin:14px 0 4px;padding-left:22px;color:var(--text2);font-size:13.5px;line-height:1.8}.rk-steps strong{color:var(--text)}.rk-claim .rk-alt{margin-top:10px;font-size:13px}.rk-claim .rk-alt a{color:var(--blue);text-decoration:none;font-weight:600}'+
  '.rk-award{display:inline-block;margin:14px 0 0 8px;padding:10px 16px;border-radius:10px;border:1px solid var(--gold);color:var(--text);text-decoration:none;font-weight:600;font-size:14px}'+
  '.rk-deal{text-align:center;margin:-10px auto 22px;font-size:13.5px}.rk-deal a{color:var(--blue);text-decoration:none;font-weight:600}'+
  '@media(max-width:760px){.dir-wrap{padding:32px 16px 54px}}';
const AWARD="/awards/top-lenders-2025";
// Lender Matcher CTA shown under the page header.
const DEAL_CTA='<p class="rk-deal"><a href="/find-a-lender">Have a deal? Find a matching lender →</a></p>';
// "Claim your page" box (unclaimed companies) or "Manage this page" (claimed).
// Same markup as hmda-awards.js.
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
// Page shell — same nav/footer as the public directory.
function shell(o){
  const robots=o.robots||"index,follow,max-image-preview:large";
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>'+esc(o.title)+'</title><meta name="description" content="'+esc(o.desc)+'"><meta name="robots" content="'+esc(robots)+'">'+
    (o.canonical?'<link rel="canonical" href="'+esc(o.canonical)+'">':'')+
    (o.prev?'<link rel="prev" href="'+esc(o.prev)+'">':'')+(o.next?'<link rel="next" href="'+esc(o.next)+'">':'')+
    '<meta property="og:type" content="website"><meta property="og:site_name" content="Pegasus Capital Network"><meta property="og:title" content="'+esc(o.title)+'"><meta property="og:description" content="'+esc(o.desc)+'">'+
    (o.canonical?'<meta property="og:url" content="'+esc(o.canonical)+'">':'')+
    '<meta name="twitter:card" content="summary"><meta name="twitter:title" content="'+esc(o.title)+'"><meta name="twitter:description" content="'+esc(o.desc)+'">'+
    '<link rel="stylesheet" href="/css/pegasus.css"><link rel="icon" href="/assets/brand/favicon.ico">'+
    (o.ld||[]).map(ld).join("")+
    '<style>'+CSS+'</style><script src="/js/i18n.js?v=20261021e"></script><script src="/js/ticker.js?v=20261021b" defer></script></head><body>'+
    '<nav class="pub-nav"><a class="brand" href="/"><img class="brand-mark" src="/assets/brand/pegasus-symbol.svg" alt="Pegasus"><span>Pegasus Network</span></a><div class="pub-links"><a href="/feed">Feed</a><a href="/people">People</a><a href="/businesses">Businesses</a><a href="/events">Events</a><a href="/rankings">Rankings</a></div><div class="nav-cta" id="dirNavCta"><a class="btn btn-ghost" href="/signin.html">Sign In</a><a class="btn btn-pri" href="/signup.html">Create Free Profile</a></div></nav>'+
    // Page is CDN-cached for everyone, so swap the guest CTA client-side for signed-in members.
    '<script>(function(){try{var raw=localStorage.getItem("pegasus.auth");if(!raw)return;var pj=JSON.parse(raw);if(!(pj&&(pj.access_token||(pj.currentSession&&pj.currentSession.access_token))))return;var c=document.getElementById("dirNavCta");if(!c)return;var s="";try{s=localStorage.getItem("peg_slug")||"";}catch(_){}c.innerHTML=\'<a class="btn btn-ghost" href="/members.html">Members Network</a><a class="btn btn-ghost" href="\'+(s?"/u/"+encodeURIComponent(s):"/profile-edit.html")+\'">My Profile</a><a class="btn btn-pri" href="/dashboard.html">My Workspace →</a>\';}catch(_){}})();</script>'+
    '<main class="dir-wrap">'+o.body+'<p class="rk-note">'+esc(SOURCE)+'</p></main>'+
    '<footer style="text-align:center;padding:28px;color:var(--text3);border-top:1px solid var(--border)"><a href="/" style="color:inherit">Pegasus Capital Network</a> · <a href="/rankings" style="color:inherit">2025 Lender Rankings</a> · <a href="/businesses" style="color:inherit">Business Directory</a></footer></body></html>';
}
const HTML="text/html; charset=utf-8";
function ok(html,vary,robots){
  const h={"Content-Type":HTML,"Cache-Control":"public, max-age=0, s-maxage=3600, stale-while-revalidate=86400","X-Robots-Tag":robots||"index,follow,max-image-preview:large"};
  if(vary) h["Netlify-Vary"]=vary;
  return new Response(html,{status:200,headers:h});
}
function noindex(html,status){
  return new Response(html,{status,headers:{"Content-Type":HTML,"Cache-Control":"public, max-age=0, s-maxage=60","X-Robots-Tag":"noindex,follow"}});
}
function notFound(msg){
  return noindex(shell({title:"Ranking not found — Pegasus Capital Network",desc:msg,robots:"noindex,follow",
    body:'<header class="dir-head"><div class="eyebrow" style="justify-content:center">Lender Rankings</div><h1>Ranking not found</h1><p>'+esc(msg)+'</p><a class="rk-cta" href="/rankings">See all 2025 lender rankings →</a></header>'}),404);
}
// Query failure → friendly 200 page, noindex, short cache. Never a 503.
function unavailable(){
  return noindex(shell({title:"Lender rankings — Pegasus Capital Network",desc:"The 2025 lender rankings are temporarily unavailable.",robots:"noindex,follow",
    body:'<header class="dir-head"><div class="eyebrow" style="justify-content:center">Lender Rankings</div><h1>Rankings are loading slowly</h1><p>We could not load the 2025 lender rankings just now. Please try again in a minute.</p><a class="rk-cta" href="/businesses/capital">Browse lenders in the directory →</a></header>'}),200);
}

async function indexPage(){
  const states=await stateCounts();
  const shown=states.filter(([,n])=>n>=STATE_MIN);
  const canonical=ORIGIN+"/rankings";
  const title="2025 U.S. Mortgage Lender Rankings (HMDA) — Pegasus Capital Network";
  const desc="Rankings of U.S. mortgage lenders by total 2025 origination volume reported under the Home Mortgage Disclosure Act (HMDA): the national Top 100 and lenders by headquarters state.";
  const cr=crumbsOf([]);
  const items=[{position:1,name:"Top 100 U.S. Mortgage Lenders 2025",url:ORIGIN+BASE}].concat(shown.map(([st],i)=>({position:i+2,name:"Top Mortgage Lenders Headquartered in "+STATE_NAMES[st]+" (2025)",url:ORIGIN+BASE+"/"+st.toLowerCase()})));
  const grid=shown.length?'<h2 class="rk-h2">By headquarters state</h2><p style="color:var(--text2);font-size:13.5px;margin:0">Lenders grouped by the state where they are headquartered, ordered by their U.S. rank.</p><div class="rk-states">'+
    shown.map(([st,n])=>'<a href="'+esc(BASE+"/"+st.toLowerCase())+'">'+esc(STATE_NAMES[st])+' <span>'+n+'</span></a>').join("")+'</div>':'';
  const body='<header class="dir-head">'+cr.html+'<div class="eyebrow" style="justify-content:center">Lender Rankings</div><h1>2025 U.S. Mortgage Lender Rankings</h1>'+
    '<p>Every ranked lender is ordered by its total 2025 U.S. mortgage origination volume as reported under the Home Mortgage Disclosure Act (HMDA). Rank #1 is the largest originator nationwide.</p>'+
    '<a class="rk-cta" href="'+esc(BASE)+'">Top 100 U.S. Mortgage Lenders 2025 →</a><a class="rk-award" href="'+esc(AWARD)+'">Pegasus Top Lenders 2025 awards →</a></header>'+DEAL_CTA+grid;
  return ok(shell({title,desc,canonical,ld:[itemList(title,items),cr.ld],body}));
}

async function nationalPage(page){
  if(page>MAX_PAGES) return notFound("The national ranking lists the top "+fmtInt(PER_PAGE*MAX_PAGES)+" lenders.");
  const from=(page-1)*PER_PAGE;
  const {rows,total}=await fetchRanked({select:COLS},from,from+PER_PAGE-1,true);
  if(!rows.length) return page>1?notFound("This page of the ranking does not exist."):unavailable();
  const pages=Math.min(MAX_PAGES,total!=null?Math.max(1,Math.ceil(total/PER_PAGE)):(rows.length===PER_PAGE?page+1:page));
  const lo=rankOf(rows[0])||from+1,hi=rankOf(rows[rows.length-1])||from+rows.length;
  const pathFor=n=>BASE+(n>1?"?page="+n:"");
  const canonical=ORIGIN+pathFor(page);
  const h1=page===1?"Top 100 U.S. Mortgage Lenders 2025":"Top U.S. Mortgage Lenders 2025: Ranks "+fmtInt(lo)+"–"+fmtInt(hi);
  const title=h1+" (HMDA) — Pegasus Capital Network";
  const desc=(page===1?"The 100 largest U.S. mortgage lenders":"U.S. mortgage lenders ranked #"+fmtInt(lo)+"–#"+fmtInt(hi))+" by total 2025 origination volume reported under HMDA, with headquarters, dollar volume and loan counts.";
  const hasPrev=page>1,hasNext=page<pages;
  const cr=crumbsOf([{name:"Top Mortgage Lenders 2025",href:BASE}].concat(page>1?[{name:"Ranks "+fmtInt(lo)+"–"+fmtInt(hi),href:pathFor(page)}]:[]));
  const body='<header class="dir-head">'+cr.html+'<div class="eyebrow" style="justify-content:center">Lender Rankings</div><h1>'+esc(h1)+'</h1>'+
    '<p>U.S. mortgage lenders ranked by total 2025 origination volume reported under the Home Mortgage Disclosure Act (HMDA). Rank #1 is the largest originator nationwide.</p>'+
    (page===1?'<a class="rk-award" style="margin-left:0" href="'+esc(AWARD)+'">See the Pegasus Top Lenders 2025 awards →</a>':'')+'</header>'+DEAL_CTA+
    table(rows,false)+
    '<nav class="dir-pager" aria-label="Pagination">'+(hasPrev?'<a href="'+esc(pathFor(page-1))+'">← Previous</a>':'')+(hasNext?'<a href="'+esc(pathFor(page+1))+'">Next →</a>':'')+'</nav>'+
    '<p style="text-align:center;margin-top:18px;font-size:13px"><a href="/rankings" style="color:var(--blue);text-decoration:none">Rankings by headquarters state →</a></p>';
  return ok(shell({title,desc,canonical,prev:hasPrev?ORIGIN+pathFor(page-1):"",next:hasNext?ORIGIN+pathFor(page+1):"",
    ld:[itemList(h1,rowItems(rows,(r,i)=>rankOf(r)||from+i+1)),cr.ld],body}),"query=page");
}

async function statePage(st){
  const name=STATE_NAMES[st];
  const {rows}=await fetchRanked({select:COLS,state_code:"eq."+st},0,999,false);
  const path=BASE+"/"+st.toLowerCase();
  const canonical=ORIGIN+path;
  const h1="Top Mortgage Lenders Headquartered in "+name+" (2025)";
  const title=h1+" — Pegasus Capital Network";
  const desc=(rows.length?rows.length+" ":"")+"mortgage lenders headquartered in "+name+", ordered by their total 2025 U.S. origination volume reported under HMDA. Headquarters location, not where loans are made.";
  const cr=crumbsOf([{name:"Top Mortgage Lenders 2025",href:BASE},{name:name,href:path}]);
  const body='<header class="dir-head">'+cr.html+'<div class="eyebrow" style="justify-content:center">Lender Rankings</div><h1>'+esc(h1)+'</h1>'+
    '<p>These lenders are headquartered in '+esc(name)+'. They are ranked by their total 2025 U.S. mortgage origination volume reported under the Home Mortgage Disclosure Act (HMDA) — nationwide, not only loans made in '+esc(name)+'. A lender’s headquarters is not necessarily where its loans are made.</p></header>'+DEAL_CTA+
    (rows.length?table(rows,true):'<p style="text-align:center;color:var(--text3);padding:30px">No ranked lenders are headquartered in '+esc(name)+' yet.</p>')+
    '<p style="text-align:center;margin-top:22px;font-size:13px"><a href="'+esc(BASE)+'" style="color:var(--blue);text-decoration:none">National Top 100 →</a> · <a href="/rankings" style="color:var(--blue);text-decoration:none">All states →</a></p>';
  const html=shell({title,desc,canonical,robots:rows.length>=STATE_MIN?"":"noindex,follow",ld:[itemList(h1,rowItems(rows,(r,i)=>i+1)),cr.ld],body});
  // Thin pages (<3 HQ lenders) stay reachable but out of the index.
  return ok(html,"",rows.length>=STATE_MIN?"":"noindex,follow");
}

async function badgePage(slug){
  const {url,key}=cfg();
  const qs=new URLSearchParams({select:"name,slug,hmda_rank,hmda_volume_usd,hmda_count,unclaimed",slug:"eq."+slug,limit:"1"});
  const res=await fetch(url+"/rest/v1/public_business_directory?"+qs.toString(),{headers:{apikey:key,Authorization:"Bearer "+key,Accept:"application/json"}});
  if(!res.ok) throw new Error("badge lookup failed: "+res.status);
  const rows=await res.json();
  const r=Array.isArray(rows)&&rows[0];
  if(!r) return notFound("We could not find that company in the directory.");
  const name=txt(r.name)||"This company",rank=rankOf(r);
  const enc=encodeURIComponent(slug);
  const pageUrl=ORIGIN+"/business/"+enc,img=ORIGIN+"/badge/"+enc+".svg";
  const rankTxt=rank?"#"+fmtInt(rank):"";
  // The snippet is HTML the visitor pastes elsewhere: escape its attributes, then
  // escape the whole snippet again for the <textarea>.
  const snippet=rank
    ?'<a href="'+esc(pageUrl)+'" title="'+esc(name+" — ranked "+rankTxt+" U.S. mortgage lender 2025 on Pegasus Capital Network")+'"><img src="'+esc(img)+'" alt="'+esc("Ranked "+rankTxt+" U.S. Mortgage Lender 2025 — Pegasus Capital Network")+'" width="300" height="64"></a>'
    :'<a href="'+esc(pageUrl)+'" title="'+esc(name+" on Pegasus Capital Network")+'"><img src="'+esc(img)+'" alt="'+esc("Pegasus Capital Network — Member directory")+'" width="300" height="64"></a>';
  const lead=rank
    ?esc(name)+' is ranked <strong>'+esc(rankTxt)+'</strong> among U.S. mortgage lenders by total 2025 origination volume reported under HMDA'+(fmtUsd(r.hmda_volume_usd)?' ('+esc(fmtUsd(r.hmda_volume_usd))+(Number(r.hmda_count)>0?' across '+esc(fmtInt(r.hmda_count))+' loans':'')+')':'')+'.'
    :esc(name)+' does not appear in the 2025 HMDA lender ranking. You can still show that it is listed on Pegasus Capital Network.';
  const cr=crumbsOf([{name:"Badge",href:"/rankings/badge/"+enc}]);
  const title=name+" — 2025 Ranking Badge — Pegasus Capital Network";
  const body='<header class="dir-head">'+cr.html+'<div class="eyebrow" style="justify-content:center">Ranking Badge</div><h1>'+esc(name)+'</h1><p>'+lead+'</p></header>'+
    '<section style="max-width:640px;margin:0 auto">'+
    '<div style="text-align:center;padding:26px;border:1px solid var(--border);border-radius:16px;background:var(--bg1)"><img src="/badge/'+esc(enc)+'.svg" alt="'+esc(rank?"Ranked "+rankTxt+" U.S. Mortgage Lender 2025 — Pegasus Capital Network":"Pegasus Capital Network — Member directory")+'" width="300" height="64"></div>'+
    '<h2 class="rk-h2">Embed on your website</h2><p style="color:var(--text2);font-size:13.5px;margin:0 0 10px">Copy this HTML into your site. The badge links to your company page on Pegasus.</p>'+
    '<textarea id="rkEmbed" class="rk-embed" readonly onclick="this.select()">'+esc(snippet)+'</textarea>'+
    '<button type="button" class="rk-copy" id="rkCopy">Copy</button>'+
    '<script>(function(){var b=document.getElementById("rkCopy"),t=document.getElementById("rkEmbed");if(!b||!t)return;b.addEventListener("click",function(){function done(){b.textContent="Copied";setTimeout(function(){b.textContent="Copy";},1800);}if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t.value).then(done,function(){t.select();try{document.execCommand("copy");done();}catch(_){}});}else{t.select();try{document.execCommand("copy");done();}catch(_){}}});})();</script>'+
    // Top 100 lenders are always Pegasus Top Lenders 2025 honorees (category/state
    // honorees are linked from the award page itself).
    (rank&&rank<=100?'<p style="margin-top:22px;font-size:13.5px">'+esc(name)+' is a Pegasus Top Lenders 2025 honoree. <a href="'+esc(AWARD+"/"+enc)+'" style="color:var(--blue);text-decoration:none;font-weight:600">See the award, press kit and award badge →</a></p>':'')+
    '<p style="margin-top:22px;font-size:13.5px"><a href="/business/'+esc(enc)+'" style="color:var(--blue);text-decoration:none">View company page</a></p>'+
    claimBox(slug,r.unclaimed)+
    '</section>';
  return ok(shell({title,desc:rank?name+" is ranked "+rankTxt+" among U.S. mortgage lenders (2025, HMDA). Embed the Pegasus ranking badge.":name+" on Pegasus Capital Network — embeddable directory badge.",canonical:ORIGIN+"/rankings/badge/"+enc,robots:"noindex,follow",ld:[cr.ld],body}),"","noindex,follow");
}

export default async (request)=>{
  const u=new URL(request.url);
  // Netlify rewrites hand the function the ORIGINAL URL, so route from the pretty
  // path first; query params are the fallback for direct function calls.
  const p=u.pathname.replace(/\/+$/,"");
  let view,arg;
  let m;
  if(p==="/rankings") view="index";
  else if(p===BASE) view="national";
  else if((m=p.match(/^\/rankings\/top-mortgage-lenders-2025\/([^\/]+)$/))){view="state";arg=m[1];}
  else if((m=p.match(/^\/rankings\/badge\/([^\/]+)$/))){view="badge";arg=m[1];}
  else{
    view=u.searchParams.get("view")||"";
    arg=view==="state"?u.searchParams.get("st"):view==="badge"?u.searchParams.get("slug"):"";
  }
  try{
    if(view==="index") return await indexPage();
    if(view==="national"){
      const n=parseInt(u.searchParams.get("page")||"1",10);
      return await nationalPage(Number.isFinite(n)&&n>0?n:1);
    }
    if(view==="state"){
      let raw="";try{raw=decodeURIComponent(arg||"");}catch(_){}
      const st=cleanState(raw);
      if(!st) return notFound("We do not have a state ranking for that location.");
      return await statePage(st);
    }
    if(view==="badge"){
      let raw="";try{raw=decodeURIComponent(arg||"");}catch(_){}
      const slug=cleanSlug(raw);
      if(!slug) return notFound("We could not find that company in the directory.");
      return await badgePage(slug);
    }
    return notFound("That ranking page does not exist.");
  }catch(err){
    console.error("[hmda-rankings]",err);
    try{return unavailable();}catch(_){return new Response("Lender rankings are temporarily unavailable.",{status:200,headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store","X-Robots-Tag":"noindex"}});}
  }
};
