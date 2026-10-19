// Pegasus SEO — public, crawlable People / Businesses / Events directories.
// Businesses AND People are organized into capital-stack SECTIONS with sub
// (category / role) chips and dedicated landing pages for SEO. People are REAL,
// consented members only — grouped by their own public fields, never fabricated.

const ORIGIN="https://pegasuscapitalnetwork.com";

// ── People taxonomy (inlined; Netlify functions do not reliably bundle a
//    cross-file ESM import, so keep each function self-contained). ──
const PERSON_SECTIONS = [
  { slug:"lenders",    label:"Lenders & Loan Officers" },
  { slug:"advisors",   label:"Brokers & Advisors" },
  { slug:"realestate", label:"Real Estate" },
  { slug:"investors",  label:"Investors & Capital" },
  { slug:"services",   label:"Services & Operators" },
  { slug:"other",      label:"Other" },
];
const PERSON_ROLES = [
  { slug:"loan-officers",       label:"Loan Officers",                 section:"lenders",    match:["loan officer","loan originator","mlo","mortgage loan originator"] },
  { slug:"real-estate-agents",  label:"Real Estate Agents & Brokers",  section:"realestate", match:["real estate agent","realtor","real estate broker","real estate salesperson"] },
  { slug:"mortgage-brokers",    label:"Mortgage Brokers",              section:"advisors",   match:["mortgage broker","broker"] },
  { slug:"developers",          label:"Developers",                    section:"realestate", match:["real estate developer","developer","homebuilder","builder"] },
  { slug:"property-managers",   label:"Property Managers",             section:"realestate", match:["property manager","property management"] },
  { slug:"private-lenders",     label:"Private & Hard Money Lenders",  section:"lenders",    match:["private lender","hard money","bridge lender"] },
  { slug:"financial-advisors",  label:"Financial Advisors & Planners", section:"advisors",   match:["financial advisor","financial planner","wealth manager","wealth advisor","wealth management","financial advisory"] },
  { slug:"capital-advisors",    label:"Capital Advisors",              section:"advisors",   match:["capital strategist","capital advisor","capital placement","investment banker","capital markets"] },
  { slug:"fund-managers",       label:"Fund Managers",                 section:"investors",  match:["fund manager","general partner","portfolio manager"] },
  { slug:"family-offices",      label:"Family Offices",                section:"investors",  match:["family office"] },
  { slug:"investors",           label:"Investors & LPs",               section:"investors",  match:["investor","limited partner","syndicator","syndication"] },
  { slug:"appraisers",          label:"Appraisers",                    section:"services",   match:["appraiser","appraisal"] },
  { slug:"attorneys",           label:"Attorneys",                     section:"services",   match:["attorney","lawyer","legal counsel"] },
  { slug:"accountants",         label:"Accountants & CPAs",            section:"services",   match:["cpa","accountant","accounting"] },
  { slug:"title-escrow",        label:"Title & Escrow Officers",       section:"services",   match:["escrow","title officer"] },
  { slug:"proptech",            label:"Proptech / Fintech",            section:"services",   match:["proptech","fintech","tokenization","rwa"] },
  { slug:"bankers",             label:"Bankers",                       section:"lenders",    match:["banker"] },
  { slug:"lenders",             label:"Lenders",                       section:"lenders",    match:["lender","lending"] },
  { slug:"capital-seekers",     label:"Capital Seekers",               section:"investors",  match:["borrower","seeking capital","capital seeker"] },
  { slug:"founders",            label:"Founders & Operators",          section:"services",   match:["founder","ceo","entrepreneur","startup","intrapreneur","operator","owner","principal"] },
];
const PR_BY_SLUG = Object.fromEntries(PERSON_ROLES.map(r => [r.slug, r]));
function personHaystack(p){
  const extra = Array.isArray(p && p.additional_roles) ? p.additional_roles.join(" ") : "";
  return [p && p.role, p && p.professional_title, p && p.headline, extra].filter(Boolean).join(" ").toLowerCase().replace(/_/g," ");
}
function classifyPerson(p){
  const h = personHaystack(p);
  if (h.trim()) { for (const r of PERSON_ROLES) { for (const kw of r.match) { if (h.includes(kw)) return r.slug; } } }
  return "other";
}
function sectionOf(roleSlug){ return (PR_BY_SLUG[roleSlug] && PR_BY_SLUG[roleSlug].section) || "other"; }
function buildPeopleSections(rows){
  const counts = {};
  for (const row of rows) {
    const role = row._role || classifyPerson(row);
    const sec = sectionOf(role);
    (counts[sec] = counts[sec] || {})[role] = (counts[sec][role] || 0) + 1;
  }
  const out = [];
  for (const s of PERSON_SECTIONS) {
    const rc = counts[s.slug]; if (!rc) continue;
    const subs = PERSON_ROLES.filter(r => r.section === s.slug && rc[r.slug]).map(r => ({ slug:r.slug, label:r.label, n:rc[r.slug] }));
    const total = subs.reduce((a,x)=>a+x.n,0);
    if (total > 0) out.push({ slug:s.slug, label:s.label, total, subs });
  }
  return out;
}
const PAGE_SIZE=48;
const PEOPLE_MAX=1000;
function env(name){return globalThis.Netlify?.env?.get(name)||"";}
function cfg(){
  const url=env("SUPABASE_URL"),key=env("SUPABASE_PUBLISHABLE_KEY");
  if(!url||!key) throw new Error("Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY");
  return {url:url.replace(/\/$/,""),key};
}
function esc(v){return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}
function txt(v){return String(v||"").replace(/\s+/g," ").trim();}
function role(v){return txt(v).replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase());}
function pageNum(v){const n=parseInt(v||"1",10);return Number.isFinite(n)&&n>0?Math.min(n,1000):1;}
function cleanSlug(v){const s=String(v||"").trim();return /^[a-z0-9][a-z0-9-]*$/i.test(s)?s:"";}
// US states + DC + PR. A state code is only ever used (URL, PostgREST filter,
// H1) after it has been validated against this map via cleanState().
const STATE_NAMES={AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",DC:"District of Columbia",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",PR:"Puerto Rico",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming"};
function cleanState(v){const s=String(v||"").trim().toUpperCase();return Object.prototype.hasOwnProperty.call(STATE_NAMES,s)?s:"";}
// "$1.2B" / "$504M" / "$9.8M" / "$900K" — compact USD for the HMDA badge.
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
async function fetchRows(path,params,page){
  const {url,key}=cfg();
  const offset=(page-1)*PAGE_SIZE;
  const qs=new URLSearchParams(params);
  const res=await fetch(url+"/rest/v1/"+path+"?"+qs.toString(),{
    headers:{apikey:key,Authorization:"Bearer "+key,Range:offset+"-"+(offset+PAGE_SIZE-1),"Range-Unit":"items",Prefer:"count=exact"}
  });
  if(res.status===416) return {rows:[],total:parseTotal(res.headers.get("content-range"))};
  if(!res.ok){const body=await res.text().catch(()=> "");throw new Error(path+" directory query failed: "+res.status+" "+body.slice(0,300));}
  return {rows:await res.json(),total:parseTotal(res.headers.get("content-range"))};
}
// Business facet counts (small table) → section tabs + category chips.
async function loadBusinessFacets(){
  try{
    const {url,key}=cfg();
    const qs=new URLSearchParams({select:"section_slug,section_label,section_sort,cat_slug,cat_label,cat_sort,n",order:"section_sort.asc,cat_sort.asc"});
    const res=await fetch(url+"/rest/v1/public_business_facets?"+qs.toString(),{
      headers:{apikey:key,Authorization:"Bearer "+key,Range:"0-499","Range-Unit":"items"}
    });
    if(!res.ok) return [];
    const rows=await res.json();
    return Array.isArray(rows)?rows:[];
  }catch(_){return [];}
}
// State × section × category counts (small table) → "Browse by state" chips,
// state-page counts. Rows only carry valid 2-letter states.
async function loadStateFacets(){
  try{
    const {url,key}=cfg();
    const qs=new URLSearchParams({select:"state_code,section_slug,cat_slug,n"});
    const res=await fetch(url+"/rest/v1/public_business_state_facets?"+qs.toString(),{
      headers:{apikey:key,Authorization:"Bearer "+key,Range:"0-9999","Range-Unit":"items"}
    });
    if(!res.ok) return [];
    const rows=await res.json();
    return Array.isArray(rows)?rows:[];
  }catch(_){return [];}
}
// Per-state totals for the current section/category scope, largest first.
function stateCounts(stateFacets,activeSection,activeSub){
  const counts=new Map();
  for(const f of stateFacets){
    const st=cleanState(f.state_code);if(!st) continue;
    if(activeSection!=="all"&&(cleanSlug(f.section_slug)||"other")!==activeSection) continue;
    if(activeSub&&(cleanSlug(f.cat_slug)||"other")!==activeSub) continue;
    counts.set(st,(counts.get(st)||0)+(Number(f.n)||0));
  }
  return counts;
}
function buildBusinessSections(facets){
  const map=new Map();
  for(const f of facets){
    const ss=cleanSlug(f.section_slug)||"other";
    if(!map.has(ss)) map.set(ss,{slug:ss,label:txt(f.section_label)||"Other",sort:f.section_sort??99,total:0,subs:[]});
    const s=map.get(ss);
    const cs=cleanSlug(f.cat_slug)||"other";
    s.subs.push({slug:cs,label:txt(f.cat_label)||"Other",sort:f.cat_sort??99,n:f.n||0});
    s.total+=(f.n||0);
  }
  const sections=[...map.values()].sort((a,b)=>a.sort-b.sort||a.label.localeCompare(b.label));
  for(const s of sections) s.subs.sort((a,b)=>a.sort-b.sort||a.label.localeCompare(b.label));
  return sections;
}
// All listable public profiles (safe columns only — never email/phone), each
// tagged with its inferred role for section grouping + filtering.
async function loadPeopleAll(){
  const {url,key}=cfg();
  const qs=new URLSearchParams({
    select:"profile_slug,full_name,role,professional_title,company_name,location,avatar_url,headline,additional_roles,updated_at",
    // Only live profiles: concierge-built ones stay 'pending' until activated.
    profile_slug:"not.is.null",full_name:"not.is.null",status:"eq.active",order:"updated_at.desc"
  });
  const res=await fetch(url+"/rest/v1/profiles?"+qs.toString(),{
    headers:{apikey:key,Authorization:"Bearer "+key,Range:"0-"+(PEOPLE_MAX-1),"Range-Unit":"items"}
  });
  if(!res.ok){const body=await res.text().catch(()=> "");throw new Error("people query failed: "+res.status+" "+body.slice(0,200));}
  const rows=await res.json();
  if(!Array.isArray(rows)) return [];
  for(const r of rows) r._role=classifyPerson(r);
  return rows;
}
async function loadBusinesses(section,category,state,page){
  const params={
    select:"presence_type,name,slug,tagline,short_description,category,industry,location,market,status,section_slug,cat_slug,state_code,hmda_rank,hmda_volume_usd,hmda_count,unclaimed",
    // Category/state landing pages lead with the largest lenders (HMDA 2025).
    order:(state||category)?"hmda_rank.asc.nullslast,name.asc":"name.asc"
  };
  if(section&&section!=="all") params.section_slug="eq."+section;
  if(category) params.cat_slug="eq."+category;
  if(state) params.state_code="eq."+state;
  try{
    return await fetchRows("public_business_directory",params,page);
  }catch(err){
    console.warn("[public-directory] taxonomy view unavailable, flat fallback:",err&&err.message);
    return await fetchRows("public_presence_previews",{
      select:"presence_type,name,slug,tagline,short_description,category,industry,location,market,status",
      presence_type:"eq.company",status:"eq.active",order:"name.asc"
    },page);
  }
}
// Active Featured (house) / Sponsored (paid) placements — a handful of rows.
async function loadPlacements(){
  try{
    const {url,key}=cfg();
    const qs=new URLSearchParams({select:"slug,name,category,cat_slug,cat_label,section_slug,location,state_code,tagline,short_description,hmda_rank,kind,weight,surfaces,states",order:"weight.desc,name.asc"});
    const res=await fetch(url+"/rest/v1/public_business_placements?"+qs.toString(),{headers:{apikey:key,Authorization:"Bearer "+key,Range:"0-49","Range-Unit":"items"}});
    if(!res.ok) return [];
    const rows=await res.json();
    return Array.isArray(rows)?rows.filter(r=>r&&Array.isArray(r.surfaces)&&r.surfaces.includes("directory")):[];
  }catch(_){return [];}
}
// Featured placements show on every business page; Sponsored ones only where
// relevant (matching section / category / state).
function placementsFor(list,activeSection,activeSub,activeState){
  const out=list.filter(p=>{
    if(p.kind==="featured") return true;
    if(activeSection!=="all"&&p.section_slug!==activeSection) return false;
    if(activeSub&&p.cat_slug!==activeSub) return false;
    if(activeState){const sts=Array.isArray(p.states)?p.states:[];if(!(sts.includes(activeState)||p.state_code===activeState)) return false;}
    return true;
  });
  out.sort((a,b)=>(a.kind==="featured"?0:1)-(b.kind==="featured"?0:1)||(b.weight||0)-(a.weight||0));
  return out.slice(0,4);
}
async function searchBusinesses(q){
  const {url,key}=cfg();
  const res=await fetch(url+"/rest/v1/rpc/search_businesses",{method:"POST",
    headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",Accept:"application/json"},
    body:JSON.stringify({p_q:q,p_limit:50})});
  if(!res.ok){const body=await res.text().catch(()=> "");throw new Error("search failed: "+res.status+" "+body.slice(0,200));}
  const rows=await res.json();
  return Array.isArray(rows)?rows:[];
}
function placementTag(kind){
  return kind==="featured"?'<span class="dir-tag">Featured</span>':kind==="sponsored"?'<span class="dir-tag dir-tag-sp">Sponsored</span>':"";
}
// Client type-ahead for the search box (plain ES5, no template literals).
const SEARCH_JS=String.raw`<script>(function(){var i=document.getElementById("dirQ"),box=document.getElementById("dirSug");if(!i||!box)return;var t=null,seq=0,act=-1;
function e(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
function hide(){box.hidden=true;box.innerHTML="";act=-1;}
function tag(p){return p==="featured"?'<span class="dir-tag">Featured</span>':p==="sponsored"?'<span class="dir-tag dir-tag-sp">Sponsored</span>':"";}
function draw(rows){act=-1;if(!rows.length){box.innerHTML='<div class="dir-sug-empty">No companies match</div>';box.hidden=false;return;}
box.innerHTML=rows.map(function(r,k){var m=[r.cat_label,r.location].filter(Boolean).join(" · ");return '<a role="option" id="dirSug'+k+'" href="/business/'+encodeURIComponent(r.slug)+'"><span class="dir-sug-n">'+e(r.name)+'</span>'+tag(r.placement)+(m?'<span class="dir-sug-m">'+e(m)+'</span>':'')+'</a>';}).join("")+
'<a class="dir-sug-all" href="/businesses/search?q='+encodeURIComponent(i.value.trim())+'">See all results →</a>';box.hidden=false;}
i.addEventListener("input",function(){clearTimeout(t);var q=i.value.trim();if(!q){hide();return;}t=setTimeout(function(){var my=++seq;fetch("/api/business-search?q="+encodeURIComponent(q)+"&limit=8").then(function(r){return r.ok?r.json():[];}).then(function(rows){if(my===seq&&i.value.trim())draw(Array.isArray(rows)?rows:[]);}).catch(function(){});},160);});
i.addEventListener("keydown",function(ev){var as=box.querySelectorAll("a[role=option]");if(box.hidden||!as.length)return;if(ev.key==="ArrowDown"||ev.key==="ArrowUp"){ev.preventDefault();act=(act+(ev.key==="ArrowDown"?1:-1)+as.length)%as.length;for(var k=0;k<as.length;k++)as[k].classList.toggle("on",k===act);i.setAttribute("aria-activedescendant","dirSug"+act);}else if(ev.key==="Enter"&&act>=0){ev.preventDefault();location.href=as[act].getAttribute("href");}else if(ev.key==="Escape"){hide();}});
document.addEventListener("click",function(ev){if(!ev.target.closest||!ev.target.closest(".dir-search"))hide();});})();</script>`;
// Search box (GET /businesses/search?q=) with a type-ahead dropdown fed by /api/business-search.
function searchBox(q){
  return '<form class="dir-search" action="/businesses/search" method="get" role="search" autocomplete="off">'+
    '<input id="dirQ" name="q" type="search" value="'+esc(q||"")+'" placeholder="Search companies by name…" aria-label="Search companies" aria-autocomplete="list" aria-controls="dirSug" maxlength="80">'+
    '<button type="submit">Search</button><div id="dirSug" class="dir-sug" role="listbox" hidden></div></form>'+SEARCH_JS;
}
const SEARCH_CSS='.dir-search{position:relative;display:flex;gap:8px;max-width:620px;margin:20px auto 0}.dir-search input{flex:1;min-width:0;padding:12px 16px;border:1px solid var(--border);border-radius:12px;background:var(--bg1);color:var(--text);font-size:14px}.dir-search button{padding:0 18px;border:0;border-radius:12px;background:var(--blue);color:#fff;font-weight:600;cursor:pointer}'+
  '.dir-sug{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:20;background:var(--bg1);border:1px solid var(--border);border-radius:12px;box-shadow:var(--sh-card);text-align:left;overflow:hidden}.dir-sug a{display:block;padding:10px 14px;text-decoration:none;color:var(--text);border-bottom:1px solid var(--border)}.dir-sug a.on,.dir-sug a:hover{background:var(--blue-dim)}.dir-sug-n{font-weight:600;font-size:13.5px}.dir-sug-m{display:block;font-size:11.5px;color:var(--text3);margin-top:2px}.dir-sug-all{font-size:12px;color:var(--blue)!important}.dir-sug-empty{padding:12px 14px;font-size:12.5px;color:var(--text3)}'+
  '.dir-tag{display:inline-block;vertical-align:middle;margin-left:6px;font-size:9.5px;font-family:var(--mono);letter-spacing:.06em;text-transform:uppercase;color:#7a5a00;background:#f6e7b8;border-radius:999px;padding:2px 7px}.dir-tag-sp{color:var(--text2);background:var(--bg2,#eef0f3)}'+
  '.dir-feat{margin-top:22px}.dir-feat .dir-grid{margin-top:8px}.dir-feat .dir-card{border-color:#e3c76d}.dir-feat-h{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--text3)}';
// state (validated 2-letter code) appends the pretty "/in/:st" suffix (lowercase).
function dirPath(kind,section,sub,state){
  const base=kind==="people"?"/people":kind==="businesses"?"/businesses":"/"+kind;
  let p=base;
  if(section&&section!=="all"){p+="/"+section;if(sub)p+="/"+sub;}
  if(state) p+="/in/"+state.toLowerCase();
  return p;
}
// Shared section tabs + sub-chips for sectioned directories (businesses, people).
// When a state is active (businesses only) every tab/chip keeps the state so
// navigating between sections/categories stays within that state.
function sectionNav(kind,sections,activeSection,activeSub,state){
  if(!sections.length) return "";
  const grand=sections.reduce((a,s)=>a+s.total,0);
  let secRow='<div class="biz-sections"><a href="'+esc(dirPath(kind,null,null,state))+'" class="'+(activeSection==="all"?"on":"")+'">All <span>'+grand+'</span></a>';
  for(const s of sections){
    secRow+='<a href="'+esc(dirPath(kind,s.slug,null,state))+'" class="'+(activeSection===s.slug?"on":"")+'">'+esc(s.label)+' <span>'+s.total+'</span></a>';
  }
  secRow+='</div>';
  let subRow="";
  if(activeSection!=="all"){
    const sec=sections.find(s=>s.slug===activeSection);
    if(sec&&sec.subs.length){
      subRow='<div class="biz-cats"><a href="'+esc(dirPath(kind,sec.slug,null,state))+'" class="'+(!activeSub?"on":"")+'">All '+esc(sec.label)+'</a>';
      for(const c of sec.subs){
        subRow+='<a href="'+esc(dirPath(kind,sec.slug,c.slug,state))+'" class="'+(activeSub===c.slug?"on":"")+'">'+esc(c.label)+' <span>'+c.n+'</span></a>';
      }
      subRow+='</div>';
    }
  }
  return secRow+subRow;
}
// "Browse by state" chip row: top 12 states (by count) within the current
// section/category scope, plus an "All states" chip that drops the state.
function stateNav(kind,stateFacets,activeSection,activeSub,activeState){
  const counts=stateCounts(stateFacets,activeSection,activeSub);
  const top=[...counts.entries()].filter(([,n])=>n>0).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,12);
  if(activeState&&!top.some(([s])=>s===activeState)) top.push([activeState,counts.get(activeState)||0]);
  if(!top.length) return "";
  let row='<div class="biz-states"><span class="biz-states-label">Browse by state</span><a href="'+esc(dirPath(kind,activeSection,activeSub))+'" class="'+(!activeState?"on":"")+'">All states</a>';
  for(const [st,n] of top){
    row+='<a href="'+esc(dirPath(kind,activeSection,activeSub,st))+'" class="'+(activeState===st?"on":"")+'">'+esc(STATE_NAMES[st])+' <span>'+n+'</span></a>';
  }
  return row+'</div>';
}
// HMDA 2025 badge line for company cards (rank 1 = largest originator).
function hmdaBadge(item){
  const rank=Number(item.hmda_rank);
  if(!Number.isFinite(rank)||rank<1) return "";
  const parts=[];
  if(rank<=100) parts.push("Top 100 U.S. lender");else if(rank<=1000) parts.push("Top 1000 U.S. lender");
  parts.push("#"+fmtInt(rank)+" nationwide");
  const vol=fmtUsd(item.hmda_volume_usd);if(vol) parts.push(vol+" 2025 originations");
  const cnt=Number(item.hmda_count);if(Number.isFinite(cnt)&&cnt>0) parts.push(fmtInt(cnt)+" loans");
  return '<span class="dir-badge">'+esc(parts.join(" · "))+'</span>';
}
function card(item,kind){
  if(kind==="people"){
    const slug=encodeURIComponent(item.profile_slug||"");
    const meta=[txt(item.professional_title)||role(item.role),txt(item.company_name),txt(item.location)].filter(Boolean).join(" · ");
    const av=txt(item.avatar_url);
    return '<article class="dir-card"><a class="dir-link" href="/u/'+slug+'">'+
      (av?'<img class="dir-avatar" src="'+esc(av)+'" alt="'+esc(item.full_name||"")+'" loading="lazy" width="68" height="68">':'<div class="dir-avatar dir-initial">'+esc((txt(item.full_name)[0]||"P").toUpperCase())+'</div>')+
      '<div><h2>'+esc(item.full_name||"Pegasus Member")+'</h2>'+(meta?'<p class="dir-meta">'+esc(meta)+'</p>':'')+
      (txt(item.headline)?'<p class="dir-desc">'+esc(txt(item.headline))+'</p>':'')+
      '<span class="dir-open">View profile →</span></div></a></article>';
  }
  const seg=kind==="events"?"event":"business";
  const meta=[txt(item.category),txt(item.industry),txt(item.location),txt(item.market)].filter(Boolean).join(" · ");
  const desc=txt(item.tagline)||txt(item.short_description);
  return '<article class="dir-card"><a class="dir-link" href="/'+seg+'/'+encodeURIComponent(item.slug||"")+'">'+
    '<div class="dir-avatar dir-initial">'+esc((txt(item.name)[0]||"P").toUpperCase())+'</div>'+
    '<div><h2>'+esc(item.name||"Pegasus "+(kind==="events"?"Event":"Business"))+(item.placement?" "+placementTag(item.placement):"")+'</h2>'+(meta?'<p class="dir-meta">'+esc(meta)+'</p>':'')+
    (kind==="events"?'':hmdaBadge(item))+
    (desc?'<p class="dir-desc">'+esc(desc)+'</p>':'')+'<span class="dir-open">View '+(kind==="events"?"event":"business")+' →</span></div></a></article>';
}
function render(ctx){
  const {kind,page,rows,total,sections=[],activeSection="all",activeSub=null,stateFacets=[],featured=[],search=null}=ctx;
  if(search!==null) return renderSearch(ctx);
  const sectioned=(kind==="businesses"||kind==="people");
  const activeState=kind==="businesses"?(cleanState(ctx.activeState)||null):null;
  const stateName=activeState?STATE_NAMES[activeState]:"";
  const label=kind==="people"?"People":kind==="events"?"Events":"Businesses";
  const singular=kind==="people"?"professionals":kind==="events"?"capital and industry events":"companies";

  let secObj=null,subObj=null;
  if(sectioned&&activeSection!=="all"){
    secObj=sections.find(s=>s.slug===activeSection)||null;
    if(secObj&&activeSub) subObj=secObj.subs.find(c=>c.slug===activeSub)||null;
  }
  const path=sectioned?dirPath(kind,activeSection,activeSub,activeState):("/"+kind);
  const canonical=ORIGIN+path+(page>1?"?page="+page:"");
  const scopeLabel=subObj?subObj.label:secObj?secObj.label:"Companies";
  const h1=activeState?scopeLabel+" in "+stateName:subObj?subObj.label:secObj?secObj.label:label;
  const title=(activeState?h1:subObj?subObj.label+" — "+label:secObj?secObj.label+" — "+label:label)+" — Pegasus Capital Network"+(page>1?" | Page "+page:"");

  let desc;
  if(activeState){
    const n=total!=null?total:(stateCounts(stateFacets,activeSection,activeSub).get(activeState)||0);
    // The HMDA ranking only means something for lenders (Capital & Lenders section).
    const ranked=(activeSection==="capital"||activeSection==="all")?", ranked by 2025 mortgage origination volume (HMDA)":"";
    desc=(n>0?n+" "+scopeLabel.toLowerCase():scopeLabel)+" in "+stateName+" on Pegasus Capital Network"+ranked+". Public, claimable company pages.";
  }else if(kind==="businesses"){
    desc=subObj?"Browse "+subObj.label.toLowerCase()+" on Pegasus Capital Network — claimable company pages across private capital, lending, real estate and investment."
      :secObj?"Browse "+secObj.label.toLowerCase()+" on Pegasus Capital Network — companies across private capital, lending, real estate and investment."
      :"Discover companies on Pegasus Capital Network — lenders, private capital, brokers, real estate and transaction services. Public, claimable business pages.";
  }else if(kind==="people"){
    desc=subObj?"Find "+subObj.label.toLowerCase()+" on Pegasus Capital Network — professionals across private capital, lending, real estate and investment."
      :secObj?"Find "+secObj.label.toLowerCase()+" on Pegasus Capital Network — professionals across private capital, lending, real estate and investment."
      :"Discover professionals on Pegasus Capital Network — loan officers, brokers, advisors, agents, developers and investors across private capital and real estate.";
  }else{
    desc="Discover "+singular+" on Pegasus Capital Network. Public profiles connect people, businesses and events across private capital, lending, real estate and investment.";
  }

  const pages=total==null?null:Math.max(1,Math.ceil(total/PAGE_SIZE));
  const hasPrev=page>1,hasNext=pages? page<pages : rows.length===PAGE_SIZE;
  const itemList={"@context":"https://schema.org","@type":"ItemList","name":title,"itemListElement":rows.map((x,i)=>({
    "@type":"ListItem",position:(page-1)*PAGE_SIZE+i+1,
    url:ORIGIN+(kind==="people"?"/u/"+encodeURIComponent(x.profile_slug||""):kind==="events"?"/event/"+encodeURIComponent(x.slug||""):"/business/"+encodeURIComponent(x.slug||""))
  }))};

  // Breadcrumbs (businesses only): Businesses › Section › Category › State.
  let breadcrumbLd="";
  if(kind==="businesses"){
    const crumbs=[{name:"Businesses",item:ORIGIN+"/businesses"}];
    if(secObj) crumbs.push({name:secObj.label,item:ORIGIN+dirPath(kind,secObj.slug)});
    if(secObj&&subObj) crumbs.push({name:subObj.label,item:ORIGIN+dirPath(kind,secObj.slug,subObj.slug)});
    if(activeState) crumbs.push({name:stateName,item:ORIGIN+dirPath(kind,activeSection,activeSub,activeState)});
    if(crumbs.length>1){
      const bl={"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":crumbs.map((c,i)=>({"@type":"ListItem",position:i+1,name:c.name,item:c.item}))};
      breadcrumbLd='<script type="application/ld+json">'+JSON.stringify(bl).replace(/</g,"\\u003c")+'</script>';
    }
  }

  const subnav=(sectioned?sectionNav(kind,sections,activeSection,activeSub,activeState):"")+(kind==="businesses"?stateNav(kind,stateFacets,activeSection,activeSub,activeState):"");
  const emptyMsg=activeState
    ? 'No '+scopeLabel.toLowerCase()+' are listed in '+stateName+' yet.'
    : sectioned&&(secObj||subObj)
    ? (kind==="people"?'No members are listed in this category yet. Be the first — create your free profile.':'No companies are listed in this category yet.')
    : 'No public '+label.toLowerCase()+' are listed yet.';

  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>'+esc(title)+'</title><meta name="description" content="'+esc(desc)+'"><meta name="robots" content="index,follow,max-image-preview:large">'+
    '<link rel="canonical" href="'+esc(canonical)+'">'+
    (hasPrev?'<link rel="prev" href="'+esc(ORIGIN+path+(page===2?"":"?page="+(page-1)))+'">':'')+
    (hasNext?'<link rel="next" href="'+esc(ORIGIN+path+"?page="+(page+1))+'">':'')+
    '<link rel="stylesheet" href="/css/pegasus.css"><link rel="icon" href="/assets/brand/favicon.ico">'+
    '<script type="application/ld+json">'+JSON.stringify(itemList).replace(/</g,"\\u003c")+'</script>'+breadcrumbLd+
    '<style>.dir-wrap{max-width:1120px;margin:auto;padding:48px 40px 72px}.dir-head{text-align:center;max-width:760px;margin:0 auto 20px}.dir-head h1{font-family:var(--serif);font-size:clamp(34px,5vw,54px);font-weight:400;margin:8px 0 12px}.dir-head p{color:var(--text2);line-height:1.65}.dir-tabs{display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin:22px 0 0}.dir-tabs a{padding:8px 14px;border:1px solid var(--border);border-radius:999px;text-decoration:none;color:var(--text2);font-size:12px}.dir-tabs a.on{background:var(--text);color:var(--bg);border-color:var(--text)}'+
    '.biz-sections{display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin:18px auto 0;max-width:960px}.biz-sections a{padding:8px 14px;border:1px solid var(--border);border-radius:10px;text-decoration:none;color:var(--text2);font-size:12.5px;font-weight:600}.biz-sections a span{color:var(--text3);font-weight:400}.biz-sections a.on{background:var(--blue);color:#fff;border-color:var(--blue)}.biz-sections a.on span{color:rgba(255,255,255,.75)}'+
    '.biz-cats{display:flex;justify-content:center;gap:7px;flex-wrap:wrap;margin:12px auto 0;max-width:960px}.biz-cats a{padding:6px 12px;border:1px solid var(--border);border-radius:999px;text-decoration:none;color:var(--text2);font-size:11.5px}.biz-cats a span{color:var(--text3)}.biz-cats a.on{background:var(--text);color:var(--bg);border-color:var(--text)}.biz-cats a.on span{color:rgba(255,255,255,.7)}'+
    '.biz-states{display:flex;justify-content:center;align-items:center;gap:7px;flex-wrap:wrap;margin:14px auto 0;max-width:960px}.biz-states-label{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--text3);margin-right:4px}.biz-states a{padding:6px 12px;border:1px solid var(--border);border-radius:999px;text-decoration:none;color:var(--text2);font-size:11.5px}.biz-states a span{color:var(--text3)}.biz-states a.on{background:var(--blue);color:#fff;border-color:var(--blue)}.biz-states a.on span{color:rgba(255,255,255,.75)}'+
    '.dir-badge{display:inline-block;margin-top:6px;font-size:10.5px;font-family:var(--mono);letter-spacing:.04em;color:var(--blue);background:var(--blue-dim);border-radius:999px;padding:3px 9px}'+
    '.dir-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:26px}.dir-card{background:var(--bg1);border:1px solid var(--border);border-radius:16px;box-shadow:var(--sh-card)}.dir-link{display:flex;gap:16px;padding:20px;text-decoration:none}.dir-avatar{width:68px;height:68px;border-radius:50%;object-fit:cover;flex:none}.dir-initial{display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#17315A,#0E1E36);color:#fff;font-family:var(--serif);font-size:28px}.dir-card h2{font-size:16px;margin:2px 0 5px;color:var(--text)}.dir-meta{font-size:12px;color:var(--text3);margin:0}.dir-desc{font-size:12.5px;line-height:1.5;color:var(--text2);margin:8px 0 0}.dir-open{display:inline-block;margin-top:10px;font-size:11.5px;color:var(--blue)}.dir-pager{display:flex;justify-content:center;gap:10px;margin-top:30px}.dir-pager a{padding:9px 14px;border:1px solid var(--border);border-radius:9px;text-decoration:none;color:var(--text2)}.dir-empty{text-align:center;padding:50px;color:var(--text3)}'+SEARCH_CSS+'@media(max-width:760px){.dir-wrap{padding:32px 20px 54px}.dir-grid{grid-template-columns:1fr}}</style></head><body>'+
    '<nav class="pub-nav"><a class="brand" href="/"><img class="brand-mark" src="/assets/brand/pegasus-symbol.svg" alt="Pegasus"><span>Pegasus Network</span></a><div class="pub-links"><a href="/feed">Feed</a><a href="/people">People</a><a href="/businesses">Businesses</a><a href="/lenders">Lenders</a><a href="/events">Events</a><a href="/explore.html">Explore</a></div><div class="nav-cta" id="dirNavCta"><a class="btn btn-ghost" href="/signin.html">Sign In</a><a class="btn btn-pri" href="/signup.html">Create Free Profile</a></div></nav>'+
    // Page is CDN-cached for everyone, so swap the guest CTA client-side for signed-in members.
    '<script>(function(){try{var raw=localStorage.getItem("pegasus.auth");if(!raw)return;var pj=JSON.parse(raw);if(!(pj&&(pj.access_token||(pj.currentSession&&pj.currentSession.access_token))))return;var c=document.getElementById("dirNavCta");if(!c)return;var s="";try{s=localStorage.getItem("peg_slug")||"";}catch(_){}c.innerHTML=\'<a class="btn btn-ghost" href="/members.html">Members Network</a><a class="btn btn-ghost" href="\'+(s?"/u/"+encodeURIComponent(s):"/profile-edit.html")+\'">My Profile</a><a class="btn btn-pri" href="/dashboard.html">My Workspace →</a>\';}catch(_){}})();</script>'+
    '<main class="dir-wrap"><header class="dir-head"><div class="eyebrow" style="justify-content:center">Public Network</div><h1>'+esc(h1)+'</h1><p>'+esc(desc)+'</p>'+
    // Capital & Lenders section → HMDA 2025 lender rankings (/rankings) + Lender Matcher (/find-a-lender).
    (kind==="businesses"&&activeSection==="capital"?'<p style="margin:8px 0 0;font-size:13px"><a href="/rankings" style="color:var(--blue);text-decoration:none;font-weight:600">2025 lender rankings →</a> · <a href="/find-a-lender" style="color:var(--blue);text-decoration:none;font-weight:600">Find a lender for your deal →</a></p>':'')+
    '<div class="dir-tabs">'+
    '<a href="/people" class="'+(kind==="people"?"on":"")+'">People</a><a href="/businesses" class="'+(kind==="businesses"?"on":"")+'">Businesses</a><a href="/events" class="'+(kind==="events"?"on":"")+'">Events</a></div>'+(kind==="businesses"?searchBox(""):"")+subnav+'</header>'+
    (featured.length?'<section class="dir-feat" aria-label="Featured companies"><div class="dir-feat-h">Featured</div><div class="dir-grid">'+featured.map(x=>card(Object.assign({},x,{placement:x.kind}),kind)).join("")+'</div></section>':'')+
    (rows.length?'<section class="dir-grid">'+rows.map(x=>card(x,kind)).join("")+'</section>':'<div class="dir-empty">'+esc(emptyMsg)+'</div>')+
    '<nav class="dir-pager" aria-label="Pagination">'+(hasPrev?'<a href="'+esc(path+(page===2?"":"?page="+(page-1)))+'">← Previous</a>':'')+(hasNext?'<a href="'+esc(path+"?page="+(page+1))+'">Next →</a>':'')+'</nav></main>'+
    '<footer style="text-align:center;padding:28px;color:var(--text3);border-top:1px solid var(--border)"><a href="/" style="color:inherit">Pegasus Capital Network</a> · Public professional discovery network</footer></body></html>';
}
function renderSearch(ctx){
  const {rows,search}=ctx;
  const q=search||"";
  const title=(q?'Search: "'+q+'"':"Search companies")+" — Pegasus Capital Network";
  const head=q?(rows.length?rows.length+(rows.length===50?"+":"")+' compan'+(rows.length===1?'y matches':'ies match')+' "'+q+'"':'No companies match "'+q+'"'):"Search companies";
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>'+esc(title)+'</title><meta name="robots" content="noindex,follow"><link rel="canonical" href="'+ORIGIN+'/businesses">'+
    '<link rel="stylesheet" href="/css/pegasus.css"><link rel="icon" href="/assets/brand/favicon.ico">'+
    '<style>.dir-wrap{max-width:1120px;margin:auto;padding:48px 40px 72px}.dir-head{text-align:center;max-width:760px;margin:0 auto 20px}.dir-head h1{font-family:var(--serif);font-size:clamp(28px,4.2vw,44px);font-weight:400;margin:8px 0 12px}'+
    '.dir-badge{display:inline-block;margin-top:6px;font-size:10.5px;font-family:var(--mono);letter-spacing:.04em;color:var(--blue);background:var(--blue-dim);border-radius:999px;padding:3px 9px}'+
    '.dir-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:26px}.dir-card{background:var(--bg1);border:1px solid var(--border);border-radius:16px;box-shadow:var(--sh-card)}.dir-link{display:flex;gap:16px;padding:20px;text-decoration:none}.dir-avatar{width:68px;height:68px;border-radius:50%;flex:none}.dir-initial{display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#17315A,#0E1E36);color:#fff;font-family:var(--serif);font-size:28px}.dir-card h2{font-size:16px;margin:2px 0 5px;color:var(--text)}.dir-meta{font-size:12px;color:var(--text3);margin:0}.dir-desc{font-size:12.5px;line-height:1.5;color:var(--text2);margin:8px 0 0}.dir-open{display:inline-block;margin-top:10px;font-size:11.5px;color:var(--blue)}.dir-empty{text-align:center;padding:50px;color:var(--text3)}'+
    SEARCH_CSS+'@media(max-width:760px){.dir-wrap{padding:32px 16px 54px}.dir-grid{grid-template-columns:1fr}}</style></head><body>'+
    '<nav class="pub-nav"><a class="brand" href="/"><img class="brand-mark" src="/assets/brand/pegasus-symbol.svg" alt="Pegasus"><span>Pegasus Network</span></a><div class="pub-links"><a href="/feed">Feed</a><a href="/people">People</a><a href="/businesses">Businesses</a><a href="/lenders">Lenders</a><a href="/events">Events</a><a href="/explore.html">Explore</a></div><div class="nav-cta"><a class="btn btn-ghost" href="/signin.html">Sign In</a><a class="btn btn-pri" href="/signup.html">Create Free Profile</a></div></nav>'+
    '<main class="dir-wrap"><header class="dir-head"><div class="eyebrow" style="justify-content:center"><a href="/businesses" style="color:inherit;text-decoration:none">← All businesses</a></div><h1>'+esc(head)+'</h1>'+searchBox(q)+'</header>'+
    (rows.length?'<section class="dir-grid">'+rows.map(x=>card(x,"businesses")).join("")+'</section>':(q?'<div class="dir-empty">Try fewer letters, or browse <a href="/businesses">all businesses</a>.</div>':''))+
    '</main><footer style="text-align:center;padding:28px;color:var(--text3);border-top:1px solid var(--border)"><a href="/" style="color:inherit">Pegasus Capital Network</a> · Public professional discovery network</footer></body></html>';
}
function errPage(status,title){
  return new Response('<!doctype html><html><head><meta name="robots" content="noindex,nofollow"><title>'+esc(title)+'</title></head><body><h1>'+esc(title)+'</h1><a href="/">Pegasus Capital Network</a></body></html>',{status,headers:{"Content-Type":"text/html; charset=utf-8","X-Robots-Tag":"noindex,nofollow","Cache-Control":"no-store"}});
}

export default async (request)=>{
  const u=new URL(request.url);
  // Netlify rewrites (/businesses/:section → ?kind=…&section=…) hand the
  // function the ORIGINAL request URL, so the rewrite's query params are not
  // in u.searchParams. Derive kind/section/sub from the pretty path first and
  // only fall back to query params (direct /.netlify/functions/… calls).
  // Business state pages add a trailing "/in/:state" segment pair:
  //   /businesses/in/ca · /businesses/:section/in/ca · /businesses/:section/:category/in/ca
  // ("in" is never a section/category; the negative lookaheads keep it out).
  const publicPath=u.pathname.match(/^\/(people|businesses|events)(?:\/(?!in(?:\/|$))([^\/]+))?(?:\/(?!in(?:\/|$))([^\/]+))?(?:\/in(?:\/([^\/]+))?)?\/?$/);
  const requested=publicPath ? publicPath[1] : u.searchParams.get("kind");
  const kind=requested==="businesses"?"businesses":requested==="events"?"events":"people";
  if(publicPath && publicPath[2] && !u.searchParams.get("section")) u.searchParams.set("section",publicPath[2]);
  if(publicPath && publicPath[3]){
    const subKey=kind==="people"?"role":"category";
    if(!u.searchParams.get(subKey)) u.searchParams.set(subKey,publicPath[3]);
  }
  if(publicPath && publicPath[4] && !u.searchParams.get("state")) u.searchParams.set("state",publicPath[4]);
  const page=pageNum(u.searchParams.get("page"));
  try{
    if(kind==="businesses"&&u.searchParams.get("section")==="search"){
      const q=String(u.searchParams.get("q")||"").replace(/\s+/g," ").trim().slice(0,80);
      const rows=q?await searchBusinesses(q):[];
      return new Response(render({kind,page:1,rows,total:rows.length,search:q}),{status:200,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"public, max-age=0, s-maxage=120, stale-while-revalidate=600","Netlify-Vary":"query=q","X-Robots-Tag":"noindex,follow"}});
    }
    if(kind==="businesses"){
      const [facets,stateFacets,placements]=await Promise.all([loadBusinessFacets(),loadStateFacets(),loadPlacements()]);
      const sections=buildBusinessSections(facets);
      let activeSection=cleanSlug(u.searchParams.get("section"))||"all";
      let activeSub=cleanSlug(u.searchParams.get("category"))||null;
      // Unknown state → plain (non-state) page, never a 404.
      const activeState=cleanState(u.searchParams.get("state"))||null;
      if(activeSection!=="all" && !sections.some(s=>s.slug===activeSection)){activeSection="all";activeSub=null;}
      if(activeSub){const sec=sections.find(s=>s.slug===activeSection);if(!sec||!sec.subs.some(c=>c.slug===activeSub)) activeSub=null;}
      const {rows,total}=await loadBusinesses(activeSection,activeSub,activeState,page);
      if(page>1&&!rows.length) return errPage(404,"Directory page not found");
      const featured=placementsFor(placements,activeSection,activeSub,activeState);
      return new Response(render({kind,page,rows,total,sections,activeSection,activeSub,activeState,stateFacets,featured}),{status:200,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"public, max-age=0, s-maxage=300, stale-while-revalidate=600","Netlify-Vary":"query=page|section|category|state","X-Robots-Tag":"index,follow,max-image-preview:large"}});
    }
    if(kind==="people"){
      const all=await loadPeopleAll();
      const sections=buildPeopleSections(all);
      let activeSection=cleanSlug(u.searchParams.get("section"))||"all";
      let activeSub=cleanSlug(u.searchParams.get("role"))||null;
      if(activeSection!=="all" && !sections.some(s=>s.slug===activeSection)){activeSection="all";activeSub=null;}
      if(activeSub){const sec=sections.find(s=>s.slug===activeSection);if(!sec||!sec.subs.some(c=>c.slug===activeSub)) activeSub=null;}
      let rows=all;
      if(activeSection!=="all") rows=rows.filter(r=>sectionOf(r._role)===activeSection);
      if(activeSub) rows=rows.filter(r=>r._role===activeSub);
      const total=rows.length;
      const pageRows=rows.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);
      if(page>1&&!pageRows.length) return errPage(404,"Directory page not found");
      return new Response(render({kind,page,rows:pageRows,total,sections,activeSection,activeSub}),{status:200,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"public, max-age=0, s-maxage=300, stale-while-revalidate=600","Netlify-Vary":"query=page|section|role","X-Robots-Tag":"index,follow,max-image-preview:large"}});
    }
    const {rows,total}=await fetchRows("public_presence_previews",{
      select:"presence_type,name,slug,tagline,short_description,category,industry,location,market,status",
      presence_type:"eq.event",status:"eq.active",order:"name.asc"
    },page);
    if(page>1&&!rows.length) return errPage(404,"Directory page not found");
    return new Response(render({kind:"events",page,rows,total}),{status:200,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"public, max-age=0, s-maxage=300, stale-while-revalidate=600","Netlify-Vary":"query=page","X-Robots-Tag":"index,follow,max-image-preview:large"}});
  }catch(err){
    console.error("[public-directory]",err);
    // Never 503 the directory — fall back to a flat, un-sectioned list.
    try{
      if(kind==="people"){
        const all=await loadPeopleAll();
        const pageRows=all.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);
        return new Response(render({kind:"people",page,rows:pageRows,total:all.length}),{status:200,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"public, max-age=0, s-maxage=60","X-Robots-Tag":"index,follow,max-image-preview:large"}});
      }
      const type=kind==="events"?"event":"company";
      const {rows,total}=await fetchRows("public_presence_previews",{
        select:"presence_type,name,slug,tagline,short_description,category,industry,location,market,status",
        presence_type:"eq."+type,status:"eq.active",order:"name.asc"
      },page);
      return new Response(render({kind,page,rows,total}),{status:200,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"public, max-age=0, s-maxage=60","X-Robots-Tag":"index,follow,max-image-preview:large"}});
    }catch(err2){
      console.error("[public-directory:fallback]",err2);
      return errPage(503,"Directory temporarily unavailable");
    }
  }
};
