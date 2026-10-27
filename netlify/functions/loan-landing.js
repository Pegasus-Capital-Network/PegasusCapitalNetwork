// Pegasus SEO — programmatic borrower landing pages by loan type (x state).
// Routes (via netlify.toml):
//   /loans                         -> index of loan types
//   /loans/:type                   -> national page for a loan type
//   /loans/:type/in/:state         -> loan type in a state
//   /sitemap-loans.xml             -> sitemap of all the above
// Content is the real matching lenders from the appetite board; every page
// funnels to /scenario-intake.html (submit a deal once, see who fits). Public
// data only (publishable key + security-definer RPC get_public_lenders_by_type).

const fetch=(u,o={})=>globalThis.fetch(u,o.signal?o:{...o,signal:AbortSignal.timeout(4000)});
const ORIGIN="https://pegasuscapitalnetwork.com";
function env(name){return globalThis.Netlify?.env?.get(name)||"";}
function cfg(){const url=env("SUPABASE_URL"),key=env("SUPABASE_PUBLISHABLE_KEY");if(!url||!key)throw new Error("Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY");return {url:url.replace(/\/$/,""),key};}
function esc(v){return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}
function txt(v){return String(v||"").replace(/\s+/g," ").trim();}
function cleanSlug(v){const s=String(v||"").trim().toLowerCase();return /^[a-z0-9][a-z0-9-]*$/.test(s)?s:"";}
const STATE_NAMES={AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",DC:"District of Columbia",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming",DC2:"District of Columbia"};
function stName(v){const s=String(v||"").trim().toUpperCase();return Object.prototype.hasOwnProperty.call(STATE_NAMES,s)?STATE_NAMES[s]:"";}
function cleanState(v){const s=String(v||"").trim().toUpperCase();return Object.prototype.hasOwnProperty.call(STATE_NAMES,s)&&s!=="DC2"?s:"";}
const ST_CODES=Object.keys(STATE_NAMES).filter(s=>s!=="DC2");
function money(n){const v=Number(n);if(!Number.isFinite(v)||v<=0)return "";if(v>=1e6)return "$"+(v/1e6).toFixed(v%1e6?1:0)+"M";if(v>=1e3)return "$"+Math.round(v/1e3)+"K";return "$"+Math.round(v);}

// Loan taxonomy: slug -> matcher loan_type (or 'hard_money' umbrella), copy.
const LOANS=[
 {slug:"fix-and-flip",type:"fix_flip",label:"Fix & Flip Loans",kw:"fix and flip loans",what:"short-term financing to buy and renovate a property for resale, usually covering a large share of purchase plus rehab, interest-only, with a sale exit."},
 {slug:"hard-money",type:"hard_money",label:"Hard Money Loans",kw:"hard money loans",what:"fast, asset-based financing for investment property secured by the real estate rather than the borrower's income, for flips, bridges and construction."},
 {slug:"bridge",type:"bridge",label:"Bridge Loans",kw:"bridge loans",what:"short-term financing to acquire, reposition or refinance an investment property before a longer-term loan or sale."},
 {slug:"dscr-rental",type:"dscr_rental",label:"DSCR Rental Loans",kw:"DSCR rental loans",what:"long-term rental financing qualified on the property's cash flow (debt service coverage ratio) instead of personal income."},
 {slug:"new-construction",type:"construction",label:"New Construction Loans",kw:"new construction loans",what:"ground-up and completion financing for residential and small commercial builds, funded against cost and after-built value."},
 {slug:"multifamily",type:"multifamily",label:"Multifamily Loans",kw:"multifamily loans",what:"acquisition, bridge and construction financing for 5+ unit and small multifamily investment property."},
 {slug:"commercial",type:"commercial",label:"Commercial Real Estate Loans",kw:"commercial real estate loans",what:"bridge and value-add financing for commercial, mixed-use and larger investment assets."},
 {slug:"cash-out-refinance",type:"residential_refi",label:"Investment Property Cash-Out Refinance",kw:"investment property cash-out refinance",what:"refinancing an investment property to pull equity or improve terms, often DSCR-qualified."},
];
const BYSLUG=Object.fromEntries(LOANS.map(l=>[l.slug,l]));

async function fetchLenders(type,state){
  const {url,key}=cfg();
  const res=await fetch(url+"/rest/v1/rpc/get_public_lenders_by_type",{
    method:"POST",
    headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",Accept:"application/json"},
    body:JSON.stringify({p_type:type,p_state:state||null,p_limit:60})
  });
  if(!res.ok)return [];
  try{return await res.json()||[];}catch(_){return [];}
}

function head(title,desc,canonical,jsonld){
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">'+
  '<title>'+esc(title)+'</title><meta name="description" content="'+esc(desc)+'">'+
  '<link rel="canonical" href="'+esc(canonical)+'"><meta name="robots" content="index,follow,max-image-preview:large">'+
  '<meta property="og:type" content="website"><meta property="og:site_name" content="Pegasus Capital Network"><meta property="og:title" content="'+esc(title)+'"><meta property="og:description" content="'+esc(desc)+'"><meta property="og:url" content="'+esc(canonical)+'"><meta property="og:image" content="'+ORIGIN+'/assets/brand/og-default.png">'+
  '<meta name="twitter:card" content="summary_large_image">'+
  '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'+
  '<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Serif:wght@300;400;600&family=IBM+Plex+Sans:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">'+
  '<link rel="stylesheet" href="/css/pegasus.css"><link rel="icon" href="/assets/brand/favicon.ico" sizes="any"><meta name="theme-color" content="#08111C">'+
  (jsonld?'<script type="application/ld+json">'+JSON.stringify(jsonld)+'</script>':'')+
  '<style>'+
  '.ll-wrap{max-width:860px;margin:0 auto;padding:0 20px}'+
  '.ll-top{display:flex;align-items:center;justify-content:space-between;padding:16px 0;border-bottom:1px solid var(--border)}'+
  '.ll-logo{font-family:var(--serif);font-weight:400;font-size:17px;color:var(--text);text-decoration:none}'+
  '.ll-crumb{font-size:11px;font-family:var(--mono);letter-spacing:.04em;color:var(--text4);margin:18px 0 6px}'+
  '.ll-crumb a{color:var(--text3);text-decoration:none}'+
  '.ll-h1{font-family:var(--serif);font-weight:300;font-size:33px;line-height:1.12;color:var(--text);margin:6px 0 12px}'+
  '.ll-lead{font-size:15px;color:var(--text2);line-height:1.65;max-width:68ch;margin-bottom:20px}'+
  '.ll-cta{display:inline-block;background:var(--blue,#2f6df6);color:#fff;font-size:14.5px;font-weight:500;padding:13px 22px;border-radius:10px;text-decoration:none}'+
  '.ll-cta.ghost{background:transparent;color:var(--text);border:1px solid var(--border)}'+
  '.ll-ctarow{display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:30px}'+
  '.ll-ctanote{font-size:12px;color:var(--text4)}'+
  '.ll-sect{font-family:var(--serif);font-weight:300;font-size:23px;color:var(--text);margin:34px 0 4px}'+
  '.ll-sub{font-size:13.5px;color:var(--text3);margin-bottom:16px}'+
  '.ll-list{border-top:1px solid var(--border)}'+
  '.ll-row{display:flex;gap:14px;align-items:flex-start;padding:14px 0;border-bottom:1px solid var(--border)}'+
  '.ll-name{font-size:15px;color:var(--text);font-weight:500}'+
  '.ll-name a{color:var(--text);text-decoration:none}'+
  '.ll-prog{font-size:12.5px;color:var(--text3);margin-top:2px}'+
  '.ll-meta{font-size:11.5px;font-family:var(--mono);color:var(--text4);margin-top:6px;letter-spacing:.02em}'+
  '.ll-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:8px 0 10px}'+
  '@media(max-width:640px){.ll-steps{grid-template-columns:1fr}.ll-h1{font-size:27px}}'+
  '.ll-step{background:var(--bg1);border:1px solid var(--border);border-radius:12px;padding:15px 16px}'+
  '.ll-step b{color:var(--text);font-size:13.5px;display:block;margin-bottom:4px}'+
  '.ll-step span{color:var(--text3);font-size:12.5px;line-height:1.5}'+
  '.ll-faq{border-top:1px solid var(--border);margin-top:6px}'+
  '.ll-q{padding:14px 0;border-bottom:1px solid var(--border)}'+
  '.ll-q b{color:var(--text);font-size:14px}.ll-q p{color:var(--text2);font-size:13.5px;line-height:1.6;margin:6px 0 0}'+
  '.ll-chips{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 10px}'+
  '.ll-chip{font-size:12px;color:var(--text2);background:var(--bg1);border:1px solid var(--border);border-radius:999px;padding:6px 12px;text-decoration:none}'+
  '.ll-foot{border-top:1px solid var(--border);margin-top:40px;padding:22px 0 50px;font-size:11.5px;color:var(--text4);line-height:1.6}'+
  '.ll-foot a{color:var(--text3)}'+
  '</style></head><body>';
}
function topbar(){return '<div class="ll-wrap"><div class="ll-top"><a class="ll-logo" href="/">Pegasus Capital Network</a><a class="ll-cta" href="/scenario-intake.html">Submit a scenario</a></div></div>';}
function footer(){return '<div class="ll-wrap"><div class="ll-foot">Pegasus Capital Network is a membership marketplace that connects borrowers, brokers and private lenders. It is not a lender and charges no referral or success fees; lenders quote each file directly and an appetite match is a signal, not an approval or an offer of credit. Lender information is compiled from public sources. &nbsp;·&nbsp; <a href="/scenario-intake.html">Submit a scenario</a> &nbsp;·&nbsp; <a href="/lender-directory.html">Lender directory</a> &nbsp;·&nbsp; <a href="/disclosures.html">Disclosures</a><br>&copy; Pegasus Capital Network · Los Angeles, CA</div></div></body></html>';}

function lenderRows(lenders){
  if(!lenders.length) return '<div class="ll-sub">No lenders have published appetite here yet. Submit your scenario and we match it as lenders join and claim their programs.</div>';
  return '<div class="ll-list">'+lenders.map(function(r){
    const meta=[];
    if(r.max_ltv)meta.push("to "+r.max_ltv+"% LTV");
    if(r.max_loan)meta.push("up to "+money(r.max_loan));
    if(r.rate_from)meta.push("from "+esc(r.rate_from));
    if(r.location)meta.push(esc(r.location));
    const name=r.unclaimed?esc(r.lender):'<a href="/business/'+encodeURIComponent(r.slug)+'">'+esc(r.lender)+'</a>';
    return '<div class="ll-row"><div style="flex:1 1 auto"><div class="ll-name">'+name+'</div>'+
      '<div class="ll-prog">'+esc(r.program||"")+'</div>'+
      (meta.length?'<div class="ll-meta">'+meta.join("  ·  ")+'</div>':'')+'</div></div>';
  }).join("")+'</div>';
}

function faqFor(loan,stateName){
  const where=stateName?(" in "+stateName):"";
  const q=[
    ["What are "+loan.kw+where+"?","These are "+loan.what+" "+(stateName?("Lenders on Pegasus that fund in "+stateName+" are listed above."):"Private and institutional lenders on Pegasus that offer this program are listed above.")],
    ["How do I find a lender for my deal"+where+"?","Submit your scenario once on Pegasus — loan type, property, numbers and exit. We score it against each lender's stated appetite with a tolerance band and show you the ones that fit, in seconds. It is free and there are no referral fees."],
    ["Do these lenders publish fixed rates and LTV?","Private lenders quote per file, so published figures are a guide, not a quote. Appetite shows the shape of what a lender does; the real terms come once they see your actual file."],
    ["Does Pegasus charge borrowers or brokers?","No. Pegasus is a membership marketplace and charges no referral or success fees. Lenders quote you directly."]
  ];
  return q;
}
function faqSchema(pairs){return {"@context":"https://schema.org","@type":"FAQPage","mainEntity":pairs.map(function(p){return {"@type":"Question","name":p[0],"acceptedAnswer":{"@type":"Answer","text":p[1]}};})};}
function crumbSchema(items){return {"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":items.map(function(it,i){return {"@type":"ListItem","position":i+1,"name":it[0],"item":ORIGIN+it[1]};})};}

function renderType(loan,state,lenders){
  const sName=state?stName(state):"";
  const title=loan.label+(sName?(" in "+sName):"")+" — Compare Lenders | Pegasus";
  const h1=loan.label+(sName?(" in "+sName):"");
  const n=lenders.length;
  const desc=(n?("Compare "+n+" "+loan.kw+" "+(sName?("that lend in "+sName):"across the U.S."))+" — appetite, LTV, loan size. Submit your deal once and see which private lenders fit. Free, no fees."
    :("Find "+loan.kw+(sName?(" in "+sName):"")+". Submit your deal once on Pegasus and see which private lenders fit — free, no referral fees."));
  const canonical=ORIGIN+"/loans/"+loan.slug+(state?("/in/"+state.toLowerCase()):"");
  const crumbs=[["Home","/"],["Loans","/loans"],[loan.label,"/loans/"+loan.slug]];
  if(state)crumbs.push([sName,"/loans/"+loan.slug+"/in/"+state.toLowerCase()]);
  const faqs=faqFor(loan,sName);
  const jsonld=[crumbSchema(crumbs),faqSchema(faqs)];
  let h=head(title,desc,canonical,jsonld)+topbar()+'<div class="ll-wrap">';
  h+='<div class="ll-crumb">'+crumbs.map(function(c,i){return i<crumbs.length-1?'<a href="'+c[1]+'">'+esc(c[0])+'</a> › ':esc(c[0]);}).join("")+'</div>';
  h+='<h1 class="ll-h1">'+esc(h1)+'</h1>';
  h+='<p class="ll-lead">'+(n?(""+n+" lender"+(n>1?"s":"")+" on Pegasus offer "):"Pegasus matches ")+esc(loan.kw)+(sName?(" "+(n?"that fund in ":"in ")+esc(sName)):"")+". "+esc(loan.what.charAt(0).toUpperCase()+loan.what.slice(1))+" Tell us your deal once and we show you which ones actually fit, sized to your numbers, not a generic list.</p>";
  h+='<div class="ll-ctarow"><a class="ll-cta" href="/scenario-intake.html">Match my deal in 60 seconds →</a><span class="ll-ctanote">Free · no referral fees · you review before anyone is contacted</span></div>';
  h+='<div class="ll-sect">Lenders'+(sName?(" lending in "+esc(sName)):"")+'</div><div class="ll-sub">Ranked by how much of their program they have published. Submit your scenario to see who fits your exact numbers.</div>';
  h+=lenderRows(lenders);
  h+='<div class="ll-sect">How matching works</div><div class="ll-steps">'+
     '<div class="ll-step"><b>1 · Tell us the deal</b><span>Type it or dictate it. Property, loan type, numbers, exit.</span></div>'+
     '<div class="ll-step"><b>2 · We match appetite</b><span>Scored against each lender\'s stated box with a sensible tolerance band.</span></div>'+
     '<div class="ll-step"><b>3 · See who fits</b><span>A ranked shortlist in seconds. You decide who to engage.</span></div></div>';
  h+='<div class="ll-sect">Questions</div><div class="ll-faq">'+faqs.map(function(p){return '<div class="ll-q"><b>'+esc(p[0])+'</b><p>'+esc(p[1])+'</p></div>';}).join("")+'</div>';
  // related
  if(state){
    h+='<div class="ll-sect">'+esc(loan.label)+' in other states</div><div class="ll-chips">'+
      ["CA","TX","FL","NY","AZ","CO","GA","NC","WA","NJ","PA","TN"].filter(function(s){return s!==state;}).map(function(s){return '<a class="ll-chip" href="/loans/'+loan.slug+'/in/'+s.toLowerCase()+'">'+esc(loan.label.replace(" Loans",""))+' in '+esc(stName(s))+'</a>';}).join("")+'</div>';
  }
  h+='<div class="ll-sect">Other loan types'+(sName?(" in "+esc(sName)):"")+'</div><div class="ll-chips">'+
     LOANS.filter(function(l){return l.slug!==loan.slug;}).map(function(l){return '<a class="ll-chip" href="/loans/'+l.slug+(state?("/in/"+state.toLowerCase()):"")+'">'+esc(l.label)+(sName?(" in "+esc(sName)):"")+'</a>';}).join("")+'</div>';
  h+='</div>'+footer();
  return h;
}

function renderIndex(){
  const title="Investment Property & Private Lending — Find a Loan | Pegasus";
  const desc="Fix and flip, DSCR rental, bridge, construction, commercial and multifamily lenders. Submit your deal once and see which private lenders fit — free, no referral fees.";
  const canonical=ORIGIN+"/loans";
  const jsonld=[crumbSchema([["Home","/"],["Loans","/loans"]])];
  let h=head(title,desc,canonical,jsonld)+topbar()+'<div class="ll-wrap">';
  h+='<h1 class="ll-h1">Find the right lender for your deal</h1>';
  h+='<p class="ll-lead">Pegasus matches your scenario against private and institutional lenders across the U.S. Pick a loan type, or just submit your deal once and we show you who fits — sized to your numbers. Free, and no referral fees.</p>';
  h+='<div class="ll-ctarow"><a class="ll-cta" href="/scenario-intake.html">Match my deal in 60 seconds →</a></div>';
  h+='<div class="ll-sect">Loan types</div><div class="ll-list">'+LOANS.map(function(l){return '<div class="ll-row"><div style="flex:1 1 auto"><div class="ll-name"><a href="/loans/'+l.slug+'">'+esc(l.label)+'</a></div><div class="ll-prog">'+esc(l.what)+'</div></div></div>';}).join("")+'</div>';
  h+='</div>'+footer();
  return h;
}

function sitemap(){
  const now=new Date().toISOString().slice(0,10);
  const urls=[ORIGIN+"/loans"];
  for(const l of LOANS){
    urls.push(ORIGIN+"/loans/"+l.slug);
    for(const s of ST_CODES) urls.push(ORIGIN+"/loans/"+l.slug+"/in/"+s.toLowerCase());
  }
  const body='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+
    urls.map(function(u){return "<url><loc>"+u+"</loc><lastmod>"+now+"</lastmod><changefreq>weekly</changefreq></url>";}).join("\n")+'\n</urlset>';
  return body;
}

export default async (request)=>{
  const u=new URL(request.url);
  try{
    if(u.searchParams.get("sitemap")==="1"){
      return new Response(sitemap(),{status:200,headers:{"Content-Type":"application/xml; charset=utf-8","Cache-Control":"public, max-age=0, s-maxage=3600, stale-while-revalidate=86400"}});
    }
    const typeSlug=cleanSlug(u.searchParams.get("type")||"");
    const state=cleanState(u.searchParams.get("state")||"");
    if(!typeSlug){
      return new Response(renderIndex(),{status:200,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"public, max-age=0, s-maxage=3600, stale-while-revalidate=86400","X-Robots-Tag":"index,follow,max-image-preview:large"}});
    }
    const loan=BYSLUG[typeSlug];
    if(!loan){
      return new Response(renderIndex(),{status:404,headers:{"Content-Type":"text/html; charset=utf-8","X-Robots-Tag":"noindex,follow"}});
    }
    const lenders=await fetchLenders(loan.type,state||null);
    return new Response(renderType(loan,state||null,lenders),{status:200,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"public, max-age=0, s-maxage=900, stale-while-revalidate=86400","X-Robots-Tag":"index,follow,max-image-preview:large"}});
  }catch(err){
    console.error("[loan-landing]",err);
    return new Response(renderIndex(),{status:200,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"public, max-age=0, s-maxage=60","X-Robots-Tag":"index,follow"}});
  }
};
