// Pegasus SEO — server-delivered public Person profile metadata + semantic snapshot.

// Every outbound request gets a 4 s deadline: a hung connection falls into this
// function's own error path (503) instead of running into Netlify's 10 s limit (504).
const fetch=(u,o={})=>globalThis.fetch(u,o.signal?o:{...o,signal:AbortSignal.timeout(4000)});

const ORIGIN = "https://pegasuscapitalnetwork.com";
const PUBLIC_PROFILE_FIELDS = [
  "id","profile_slug","full_name","role","company_name","headline","bio","location",
  "website","avatar_url","professional_title","current_focus","updated_at"
].join(",");

function env(name) { return globalThis.Netlify?.env?.get(name) || ""; }
function cfg() {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_PUBLISHABLE_KEY");
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY");
  return { url: url.replace(/\/$/, ""), key };
}
function esc(v) {
  return String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
function cleanSlug(v) {
  const s=String(v||"").trim();
  return /^[a-z0-9][a-z0-9-]*$/i.test(s)?s:"";
}
function txt(v){return String(v||"").replace(/\s+/g," ").trim();}
function trunc(v,n){const s=txt(v);return s.length<=n?s:s.slice(0,n-1).replace(/\s+\S*$/,"")+"…";}
function safeHttp(v){const s=txt(v);return /^https?:\/\//i.test(s)?s:"";}
function roleLabel(v){return txt(v).replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase());}
function replaceOrInsert(html,regex,replacement,before="</head>"){
  return regex.test(html)?html.replace(regex,replacement):html.replace(before,replacement+"\n"+before);
}
async function getProfile(slug){
  const {url,key}=cfg();
  // Only live profiles are public; 'pending' (not yet activated) → not found.
  const params=new URLSearchParams({select:PUBLIC_PROFILE_FIELDS,profile_slug:"eq."+slug,status:"eq.active",limit:"1"});
  const res=await fetch(url+"/rest/v1/profiles?"+params.toString(),{
    headers:{apikey:key,Authorization:"Bearer "+key,Accept:"application/json"}
  });
  if(!res.ok){
    const body=await res.text().catch(()=> "");
    throw new Error("profile query failed: "+res.status+" "+body.slice(0,300));
  }
  const rows=await res.json();
  return Array.isArray(rows)&&rows.length?rows[0]:null;
}
async function getTemplate(request){
  const u=new URL(request.url);
  const res=await fetch(u.origin+"/public-profile.html?seo_template=1",{headers:{"User-Agent":"Pegasus-SEO-Renderer/1.0"}});
  if(!res.ok) throw new Error("profile template fetch failed: "+res.status);
  return await res.text();
}
function snapshot(p,title,desc,canonical){
  const name=txt(p.full_name)||"Pegasus Member";
  const job=txt(p.professional_title)||roleLabel(p.role);
  const company=txt(p.company_name);
  const location=txt(p.location);
  const avatar=safeHttp(p.avatar_url);
  const website=safeHttp(p.website);
  const bio=trunc(p.bio||p.current_focus||p.headline,700);
  return '<article id="peg-seo-snapshot" itemscope itemtype="https://schema.org/Person" style="max-width:1000px;margin:30px auto 20px;padding:28px 40px;border:1px solid #e4e7eb;border-radius:18px;background:#fff;font-family:Arial,sans-serif;color:#172033">'+
    '<div style="display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap">'+
    (avatar?'<img itemprop="image" src="'+esc(avatar)+'" alt="'+esc(name)+'" width="112" height="112" style="width:112px;height:112px;border-radius:56px;object-fit:cover">':'')+
    '<div style="flex:1;min-width:240px"><h1 itemprop="name" style="margin:0 0 8px;font-size:36px;line-height:1.08">'+esc(name)+'</h1>'+
    (job?'<div itemprop="jobTitle" style="font-size:17px;font-weight:600">'+esc(job)+'</div>':'')+
    ([company,location].filter(Boolean).length?'<div style="margin-top:6px;color:#5b6573">'+esc([company,location].filter(Boolean).join(" · "))+'</div>':'')+
    (txt(p.headline)?'<p style="font-size:16px;line-height:1.55;margin:16px 0 0">'+esc(txt(p.headline))+'</p>':'')+
    '</div></div>'+
    (bio?'<p itemprop="description" style="font-size:15px;line-height:1.65;margin:22px 0 0">'+esc(bio)+'</p>':'')+
    (website?'<p style="margin:18px 0 0"><a itemprop="url" href="'+esc(website)+'">Official website</a></p>':'')+
    '<link itemprop="mainEntityOfPage" href="'+esc(canonical)+'"></article>';
}
// Server-rendered conversion CTA — turns anonymous discovery traffic (Google,
// shared links) into signups. Honest + working today: it routes to the real
// signup/sign-in; it does NOT promise an entity-claim flow that does not exist
// yet. Hidden for already-signed-in visitors via a tiny inline check.
function joinCta(){
  return '<aside id="peg-seo-join" style="max-width:1000px;margin:0 auto 34px;padding:22px 32px;border:1px solid #e4e7eb;border-radius:18px;background:#0b1626;color:#f4f8fc;font-family:Arial,sans-serif;display:flex;gap:18px;align-items:center;justify-content:space-between;flex-wrap:wrap">'+
    '<div style="min-width:240px;flex:1"><div style="font-size:18px;font-weight:700;margin-bottom:4px">Be discovered by the right people.</div>'+
    '<div style="font-size:13px;color:#adbdd0;line-height:1.5">Pegasus Capital Network is where professionals across capital, real estate, and business growth present who they are — and connect. Creating your profile is free.</div></div>'+
    '<div style="display:flex;gap:10px;flex-wrap:wrap"><a href="/signup.html" style="background:#3a8fe8;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 18px;border-radius:10px">Create your free profile</a>'+
    '<a href="/signin.html" style="border:1px solid rgba(255,255,255,.3);color:#f4f8fc;text-decoration:none;font-size:14px;padding:11px 18px;border-radius:10px">Sign in</a></div>'+
    '<script>try{if(localStorage.getItem("pegasus.auth")){var e=document.getElementById("peg-seo-join");if(e)e.style.display="none";}}catch(_){}</script></aside>';
}
function render(html,p){
  const slug=cleanSlug(p.profile_slug);
  const name=txt(p.full_name)||"Pegasus Member";
  const canonical=ORIGIN+"/u/"+encodeURIComponent(slug);
  const job=txt(p.professional_title)||roleLabel(p.role);
  const rawDesc=txt(p.headline)||txt(p.current_focus)||txt(p.bio)||
    [job,txt(p.company_name),txt(p.location)].filter(Boolean).join(" · ");
  const desc=trunc(rawDesc||(name+" on Pegasus Capital Network"),160);
  const title=name+(job?" — "+job:"")+" | Pegasus Capital Network";
  const image=safeHttp(p.avatar_url);

  html=replaceOrInsert(html,/<title>[\s\S]*?<\/title>/i,'<title>'+esc(title)+'</title>');
  html=replaceOrInsert(html,/<link\s+rel=["']canonical["'][^>]*>/i,'<link rel="canonical" href="'+esc(canonical)+'">');
  html=replaceOrInsert(html,/<meta\s+name=["']description["'][^>]*>/i,'<meta name="description" content="'+esc(desc)+'">');
  html=replaceOrInsert(html,/<meta\s+name=["']robots["'][^>]*>/i,'<meta name="robots" content="index,follow,max-image-preview:large">');

  const og=[
    '<meta property="og:type" content="profile">',
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

  const sameAs=[p.website,p.linkedin_url,p.facebook_url,p.instagram_url,p.x_url,p.youtube_url,p.tiktok_url].map(safeHttp).filter(Boolean);
  const person={"@type":"Person",name,url:canonical};
  if(job) person.jobTitle=job;
  if(desc) person.description=desc;
  if(image) person.image=image;
  if(sameAs.length) person.sameAs=sameAs;
  if(txt(p.company_name)) person.worksFor={"@type":"Organization",name:txt(p.company_name)};
  const schema={"@context":"https://schema.org","@type":"ProfilePage",url:canonical,name:title,description:desc,mainEntity:person};
  const jsonLd='<script type="application/ld+json">'+JSON.stringify(schema).replace(/</g,"\\u003c")+'</script>';
  html=html.replace("</head>",og+"\n"+jsonLd+"\n</head>");
  html=html.replace("<body>","<body>\n"+snapshot(p,title,desc,canonical)+"\n"+joinCta());
  return html;
}
function simple(status,title,message){
  return new Response('<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>'+esc(title)+'</title></head><body><main><h1>'+esc(title)+'</h1><p>'+esc(message)+'</p><p><a href="/">Pegasus Capital Network</a></p></main></body></html>',{
    status,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":status===404?"public, max-age=60":"no-store","X-Robots-Tag":"noindex, nofollow"}
  });
}

export default async (request) => {
  const u=new URL(request.url);
  // Netlify function rewrites preserve the incoming public path, but do not
  // reliably expose query parameters supplied by the rewrite destination.
  const publicPath=u.pathname.match(/^\/u\/([^/]+)\/?$/);
  const slug=cleanSlug(publicPath ? publicPath[1] : u.searchParams.get("slug"));
  if(!slug) return simple(404,"Profile not found","This profile does not exist.");
  try{
    const [profile,template]=await Promise.all([getProfile(slug),getTemplate(request)]);
    if(!profile) return simple(404,"Profile not found","This profile does not exist.");
    return new Response(render(template,profile),{
      status:200,
      headers:{
        "Content-Type":"text/html; charset=utf-8",
        "Cache-Control":"public, max-age=0, s-maxage=300, stale-while-revalidate=600",
        "X-Robots-Tag":"index, follow, max-image-preview:large",
        "Link":"<"+ORIGIN+"/u/"+encodeURIComponent(slug)+'>; rel="canonical"'
      }
    });
  }catch(err){
    console.error("[profile-seo-page]",err);
    return simple(503,"Profile temporarily unavailable","Please try again shortly.");
  }
};
