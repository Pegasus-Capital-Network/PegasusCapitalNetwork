import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
// Existing functions are ESM in a CommonJS package, loaded by Netlify/esbuild.
const source = await readFile(new URL('../netlify/functions/lenders-directory.js', import.meta.url),'utf8');
const {default:handler} = await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const fetchOriginal = globalThis.fetch;
const fixture = {name:'Example & Partners',slug:'example-lender',short_description:'Financing for property renovation.',cat_slug:'private-lenders',lender_type:'private-lenders',cat_label:'Private Lender',location:'Austin, TX',hmda_rank:42};
globalThis.Netlify = {env:{get:key=>key==='SUPABASE_URL'?'https://example.supabase.co':'public-test-key'}};
async function run(query='', rows=[fixture], count=1, status=200) {
  let captured;
  globalThis.fetch = async (url,options)=>{captured={url:new URL(url),options};return new Response(JSON.stringify(rows),{status,headers:{'Content-Range':'0-'+(rows.length-1)+'/'+count}});};
  const res=await handler(new Request('https://pegasuscapitalnetwork.com/lenders'+query));
  return {res,html:await res.text(),captured};
}
test('logged-out server HTML links only canonical businesses and emits SEO',async()=>{
  const {res,html,captured}=await run();
  assert.equal(res.status,200);
  assert.match(html,/<title>Lenders Directory \| Pegasus Capital Network<\/title>/);
  assert.match(html,/<link rel="canonical" href="https:\/\/pegasuscapitalnetwork.com\/lenders">/);
  assert.match(html,/property="og:url"/);
  assert.match(html,/href="\/business\/example-lender"/);
  assert.match(html,/Example &amp; Partners/);
  assert.match(html,/#42/);
  const ld=JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(ld.itemListElement[0].url,'https://pegasuscapitalnetwork.com/business/example-lender');
  assert.equal(captured.url.pathname,'/rest/v1/public_business_discovery');
  assert.equal(captured.options.headers.Range,'0-23');
  assert(!captured.url.searchParams.get('select').includes('metadata'));
});
test('filters execute in the database and survive pagination/canonical',async()=>{
  const {html,captured}=await run('?category=private-lenders&state=TX&q=Example&page=2',[fixture],60);
  assert.equal(captured.url.searchParams.get('lender_type'),'eq.private-lenders');
  assert.equal(captured.url.searchParams.get('state_code'),'eq.TX');
  assert.equal(captured.url.searchParams.get('name'),'ilike.*Example*');
  assert.equal(captured.options.headers.Range,'24-47');
  assert.match(html,/category=private-lenders&amp;state=TX&amp;q=Example&amp;page=3/);
  assert.match(html,/"position":25/);
});
test('default query excludes services and generic capital platforms',async()=>{
  const {captured}=await run();
  const categories=captured.url.searchParams.get('lender_type');
  assert(!categories.includes('capital-platforms'));
  assert(!categories.includes('services'));
  assert(categories.includes('private-lenders'));
});
test('unsafe/invalid filters are rejected without querying',async()=>{
  for(const q of ['?category=legal-1031','?category=__proto__','?state=XX','?page=-1','?page=2oops','?page=10001']) {
    const {res,captured}=await run(q);assert.equal(res.status,404);assert.equal(captured,undefined);
  }
});
test('empty results, missing page and backend failures stay honest',async()=>{
  assert.match((await run('',[],0)).html,/No lenders match/);
  assert.equal((await run('?page=2',[],0)).res.status,404);
  assert.equal((await run('',[],0,500)).res.status,503);
  const bad=await run('',[{...fixture,cat_slug:'insurance',lender_type:null}]);
  assert.equal(bad.res.status,503);assert(!bad.html.includes('Example'));
});
test('untrusted data is escaped and internal fields never serialized',async()=>{
  const {html}=await run('?q=%3Cscript%3E',[{...fixture,name:'<script>alert(1)</script>',metadata:{secret:'private-canary'},email:'private@example.com'}]);
  assert(!html.includes('<script>alert(1)</script>'));
  assert(!html.includes('private-canary'));assert(!html.includes('private@example.com'));
  assert.match(html,/\\u003cscript>/);
});
test('verified capital providers, logos and factual specialties render safely',async()=>{
  const {res,html}=await run('?category=capital-providers',[{...fixture,lender_type:'capital-providers',cat_slug:'capital-platforms',primary_type:'Capital Provider',logo_url:'https://example.com/logo.png',specialties:['Bridge','<b>Construction</b>']}]);
  assert.equal(res.status,200);assert.match(html,/class="lender-logo"/);
  assert.match(html,/Capital Provider/);assert.match(html,/&lt;b&gt;Construction&lt;\/b&gt;/);
  const unsafe=await run('',[{...fixture,logo_url:'javascript:alert(1)',specialties:[{private:'private-canary'}]}]);
  assert(!unsafe.html.includes('javascript:'));assert(!unsafe.html.includes('private-canary'));
});
test('sitemap route and navigation are wired',async()=>{
  const files=await Promise.all(['netlify.toml','sitemap.xml','js/pegasus-core.js','netlify/functions/entity-sitemap.js'].map(p=>readFile(new URL('../'+p,import.meta.url),'utf8')));
  assert.match(files[0],/from = "\/lenders"\s+to = "\/\.netlify\/functions\/lenders-directory"\s+status = 200/);
  assert.match(files[1],/<loc>https:\/\/pegasuscapitalnetwork.com\/lenders<\/loc>/);
  assert.match(files[2],/Lenders Directory','\/lenders/);
  assert.match(files[3],/urlNode\(ORIGIN \+ "\/lenders"/);
});
test.after(()=>{globalThis.fetch=fetchOriginal;delete globalThis.Netlify;});
