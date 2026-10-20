// Pegasus SEO — server-delivered metadata for a single Network Feed post.
// /feed/post/:id → feed.html with the post's title/description/OG tags, a
// SocialMediaPosting JSON-LD and a crawlable snapshot. The client script in
// feed.html then renders the live post (likes, comments) and removes the snapshot.

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
function cleanId(v){const s=String(v||"").trim().toLowerCase();return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s)?s:"";}
function replaceOrInsert(html,regex,replacement,before="</head>"){return regex.test(html)?html.replace(regex,replacement):html.replace(before,replacement+"\n"+before);}
const LBL={update:"Update",event:"Event",deal:"Deal / Offer",offering:"Offer",market_view:"Market view",project:"Project",story:"Story",referral:"Referral request",working_on:"Working on",showcase:"Showcase",seeking_intro:"Seeking intro"};

async function getPost(id){
  const {url,key}=cfg();
  const res=await fetch(url+"/rest/v1/rpc/get_network_feed_v2",{
    method:"POST",
    headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",Accept:"application/json"},
    body:JSON.stringify({p_limit:1,p_id:id})
  });
  if(!res.ok){const body=await res.text().catch(()=> "");throw new Error("feed post query failed: "+res.status+" "+body.slice(0,200));}
  const rows=await res.json();
  const p=Array.isArray(rows)&&rows[0]?rows[0]:null;
  if(p&&p.presence_name){p.author_name=p.presence_name;p.author_company=null;}
  return p;
}
async function getTemplate(request){
  const u=new URL(request.url);
  const res=await fetch(u.origin+"/feed.html?seo_template=1",{headers:{"User-Agent":"Pegasus-SEO-Renderer/1.0"}});
  if(!res.ok) throw new Error("feed template fetch failed: "+res.status);
  return await res.text();
}
function authorHref(p){if(p.presence_slug)return ORIGIN+"/business/"+encodeURIComponent(p.presence_slug);return p.author_slug?ORIGIN+"/u/"+encodeURIComponent(p.author_slug):ORIGIN+"/public-profile.html?id="+encodeURIComponent(p.user_id||"");}
function snapshot(p,canonical){
  const label=LBL[p.signal_type]||"Update";
  const when=p.created_at?new Date(p.created_at).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"}):"";
  const ev=(p.signal_type==="event"&&p.event_at)?'<p style="margin:12px 0 0;color:#8e7020"><strong>When:</strong> '+esc(new Date(p.event_at).toLocaleString("en-US",{weekday:"short",month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}))+(p.event_location?' · '+esc(p.event_location):'')+'</p>':'';
  const img=safeHttp(p.image_url);
  const link=safeHttp(p.link_url);
  return '<article id="peg-seo-snapshot" style="max-width:720px;margin:30px auto 20px;padding:28px 36px;border:1px solid #e4e7eb;border-radius:18px;background:#fff;font-family:Arial,sans-serif;color:#172033">'+
    '<div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#697386">'+esc(label)+' · Pegasus Network Feed</div>'+
    (p.title?'<h1 style="margin:10px 0 6px;font-size:30px;line-height:1.15">'+esc(p.title)+'</h1>':'<h1 style="margin:10px 0 6px;font-size:24px;line-height:1.2">'+esc(trunc(p.content,90))+'</h1>')+
    '<p style="margin:0 0 14px;color:#5b6573;font-size:14px">By <a href="'+esc(authorHref(p))+'" style="color:#235fa6">'+esc(p.author_name)+'</a>'+(p.author_company?' · '+esc(p.author_company):'')+(when?' · '+esc(when):'')+'</p>'+
    '<div style="font-size:15px;line-height:1.65;white-space:pre-wrap">'+esc(p.content||"")+'</div>'+ev+
    (img?'<p style="margin:16px 0 0"><img src="'+esc(img)+'" alt="" style="max-width:100%;border-radius:12px;border:1px solid #e4e7eb"></p>':'')+
    (link?'<p style="margin:14px 0 0"><a href="'+esc(link)+'" rel="nofollow noopener" style="color:#235fa6">'+esc(link.replace(/^https?:\/\//,"").slice(0,80))+'</a></p>':'')+
    '<p style="margin:22px 0 0;font-size:13px;color:#697386"><a href="'+esc(ORIGIN+"/feed")+'" style="color:#235fa6">See the full Network Feed →</a></p>'+
    '<link rel="canonical" href="'+esc(canonical)+'"></article>';
}
function render(html,p){
  const id=cleanId(p.id);
  const canonical=ORIGIN+"/feed/post/"+id;
  const label=LBL[p.signal_type]||"Update";
  const headline=txt(p.title)||trunc(p.content,80);
  const title=headline+" — "+esc(p.author_name)+" | Pegasus Capital Network";
  const desc=trunc((txt(p.title)?txt(p.content):txt(p.content))||headline,160);
  const image=safeHttp(p.image_url)||ORIGIN+"/assets/brand/og-default.png";
  html=replaceOrInsert(html,/<title>[\s\S]*?<\/title>/i,'<title>'+esc(title)+'</title>');
  html=replaceOrInsert(html,/<link\s+rel=["']canonical["'][^>]*>/i,'<link rel="canonical" href="'+esc(canonical)+'">');
  html=replaceOrInsert(html,/<meta\s+name=["']description["'][^>]*>/i,'<meta name="description" content="'+esc(desc)+'">');
  html=replaceOrInsert(html,/<meta\s+name=["']robots["'][^>]*>/i,'<meta name="robots" content="index,follow,max-image-preview:large">');
  // Strip the generic feed OG/twitter tags, then add post-specific ones.
  html=html.replace(/<meta\s+(?:property=["']og:[^"']+["']|name=["']twitter:[^"']+["'])[^>]*>\s*/gi,"");
  const og=[
    '<meta property="og:type" content="article">',
    '<meta property="og:site_name" content="Pegasus Capital Network">',
    '<meta property="og:title" content="'+esc(headline)+'">',
    '<meta property="og:description" content="'+esc(desc)+'">',
    '<meta property="og:url" content="'+esc(canonical)+'">',
    '<meta property="og:image" content="'+esc(image)+'">',
    p.created_at?'<meta property="article:published_time" content="'+esc(new Date(p.created_at).toISOString())+'">':'',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:title" content="'+esc(headline)+'">',
    '<meta name="twitter:description" content="'+esc(desc)+'">',
    '<meta name="twitter:image" content="'+esc(image)+'">'
  ].filter(Boolean).join("\n");
  const schema={"@context":"https://schema.org","@type":"SocialMediaPosting",url:canonical,headline:headline,articleBody:txt(p.content),datePublished:p.created_at||undefined,
    author:{"@type":p.presence_slug?"Organization":"Person",name:txt(p.author_name),url:authorHref(p)},
    publisher:{"@type":"Organization",name:"Pegasus Capital Network",url:ORIGIN},
    isPartOf:{"@type":"WebPage",url:ORIGIN+"/feed",name:"Network Feed — Pegasus Capital Network"},
    about:label};
  if(safeHttp(p.image_url)) schema.image=safeHttp(p.image_url);
  const jsonLd='<script type="application/ld+json">'+JSON.stringify(schema).replace(/</g,"\\u003c")+'</script>';
  html=html.replace("</head>",og+"\n"+jsonLd+"\n</head>");
  html=html.replace("<body>","<body>\n"+snapshot(p,canonical));
  return html;
}
function simple(status,title,message){
  return new Response('<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>'+esc(title)+'</title></head><body><main><h1>'+esc(title)+'</h1><p>'+esc(message)+'</p><p><a href="/feed">Network Feed</a> · <a href="/">Pegasus Capital Network</a></p></main></body></html>',{
    status,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":status===404?"public, max-age=60":"no-store","X-Robots-Tag":"noindex, nofollow"}
  });
}

export default async (request)=>{
  const u=new URL(request.url);
  const m=u.pathname.match(/^\/feed\/post\/([^/]+)\/?$/);
  const id=cleanId(m?m[1]:u.searchParams.get("id"));
  if(!id) return simple(404,"Post not found","This post does not exist.");
  try{
    const [post,template]=await Promise.all([getPost(id),getTemplate(request)]);
    if(!post) return simple(404,"Post not found","This post is no longer available.");
    return new Response(render(template,post),{
      status:200,
      headers:{
        "Content-Type":"text/html; charset=utf-8",
        "Cache-Control":"public, max-age=0, s-maxage=120, stale-while-revalidate=600",
        "X-Robots-Tag":"index, follow, max-image-preview:large",
        "Link":"<"+ORIGIN+"/feed/post/"+id+'>; rel="canonical"'
      }
    });
  }catch(err){
    console.error("[feed-post-seo-page]",err);
    // Degrade to the client-rendered feed rather than failing the share link.
    return Response.redirect(ORIGIN+"/feed?post="+id,302);
  }
};
