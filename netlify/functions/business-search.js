// Pegasus — business type-ahead: GET /api/business-search?q=wes[&limit=8]
// JSON [{slug,name,cat_label,location,hmda_rank,placement}] from the
// search_businesses RPC (Featured/Sponsored matches first, then names starting
// with q, then a word starting with q, then names containing q).
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
function json(body,status,cache){
  return new Response(JSON.stringify(body),{status:status||200,headers:{"Content-Type":"application/json; charset=utf-8",
    "Cache-Control":cache||"public, max-age=0, s-maxage=120, stale-while-revalidate=600","Netlify-Vary":"query=q|limit","X-Robots-Tag":"noindex"}});
}

export default async (request)=>{
  const u=new URL(request.url);
  const q=String(u.searchParams.get("q")||"").replace(/\s+/g," ").trim().slice(0,80);
  const limit=Math.max(1,Math.min(parseInt(u.searchParams.get("limit")||"8",10)||8,50));
  if(!q) return json([]);
  try{
    const {url,key}=cfg();
    const res=await fetch(url+"/rest/v1/rpc/search_businesses",{method:"POST",
      headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",Accept:"application/json"},
      body:JSON.stringify({p_q:q,p_limit:limit})});
    if(!res.ok) return json({error:"search unavailable"},502,"no-store");
    const rows=await res.json();
    return json(Array.isArray(rows)?rows:[]);
  }catch(err){
    console.error("[business-search]",err);
    return json({error:"search unavailable"},502,"no-store");
  }
};
