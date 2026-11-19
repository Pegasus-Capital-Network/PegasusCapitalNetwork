import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
const source=readFileSync(new URL('../netlify/functions/public-directory.js',import.meta.url),'utf8');
const sample={slug:'preview-platform',name:'Preview Platform',logo_url:'https://example.com/logo.svg',tagline:'Platform in development',short_description:'Preview stage. Not yet operating; no offer or commitment to lend.',category:'Proptech / Fintech / AI'};
function context(){
 const requests=[];
 const ctx=vm.createContext({URL,URLSearchParams,Response,Request,AbortSignal,console,Netlify:{env:{get:n=>n==='SUPABASE_URL'?'https://example.test':'test-public-key'}},fetch:async(url)=>{
  const u=new URL(url);requests.push(u);
  let rows=[];
  if(u.pathname.endsWith('/search_businesses')) rows=[{slug:sample.slug,name:sample.name,placement:'featured'}];
  else if(u.pathname.endsWith('/public_business_discovery')) rows=[sample];
  else if(u.pathname.endsWith('/public_business_directory')) rows=[{slug:sample.slug,name:sample.name}];
  else if(u.pathname.endsWith('/public_business_placements')) rows=[{slug:sample.slug,name:sample.name,kind:'featured',surfaces:['directory']}];
  else if(u.pathname.endsWith('/public_business_facets')) rows=[{section_slug:'services',section_label:'Services',cat_slug:'proptech-fintech',cat_label:'Proptech / Fintech / AI',n:1}];
  return new Response(JSON.stringify(rows),{headers:{'content-range':'0-0/1'}});
 }});
 vm.runInContext(source.replace('export default async (request)=>{','globalThis.handler=async (request)=>{'),ctx);
 return {ctx,requests};
}
for(const path of ['/businesses','/businesses/services/proptech-fintech','/businesses/search?q=preview']) test('public branding on '+path,async()=>{
 const {ctx,requests}=context();const response=await ctx.handler(new Request('https://site.test'+path));const html=await response.text();
 assert.equal(response.status,200);assert.ok(html.includes('src="'+sample.logo_url+'"'));assert.ok(html.includes(sample.short_description));
 assert.ok(requests.some(u=>u.pathname.endsWith('/public_business_discovery')));
 assert.ok(requests.every(u=>!u.pathname.includes('/presences')));
});
test('cards escape labels and retain initials for missing or unsafe logo',()=>{
 const {ctx}=context();ctx.sample={...sample,name:'<script>bad</script>',logo_url:'javascript:alert(1)'};
 const html=vm.runInContext('card(sample,"businesses")',ctx);
 assert.ok(!html.includes('javascript:'));assert.ok(!html.includes('<script>bad'));assert.ok(html.includes('dir-initial'));assert.ok(html.includes('&lt;script&gt;'));
});
test('typeahead endpoint returns public logo and preview description',async()=>{
 const {ctx}=context(); const api=readFileSync(new URL('../netlify/functions/business-search.js',import.meta.url),'utf8');
 const isolated=vm.createContext({URL,URLSearchParams,Response,Request,AbortSignal,console,Netlify:ctx.Netlify,fetch:ctx.fetch});
 vm.runInContext(api.replace('export default async (request)=>{','globalThis.handler=async (request)=>{'),isolated);
 const result=await (await isolated.handler(new Request('https://site.test/api/business-search?q=preview'))).json();
 assert.equal(result[0].logo_url,sample.logo_url);assert.equal(result[0].short_description,sample.short_description);assert.equal(result[0].placement,'featured');
});
test('network search enriches companies without changing member results',async()=>{
 const html=readFileSync(new URL('../search.html',import.meta.url),'utf8');
 const enrich=html.slice(html.indexOf('  async function enrichCompanies'),html.indexOf('  async function run(q)'));
 const ctx=vm.createContext({URL,location:{origin:'https://site.test'},c:{from:name=>{assert.equal(name,'public_business_discovery');return {select:()=>({in:async()=>({data:[sample]})})}}}});
 vm.runInContext(enrich,ctx);
 const person={kind:'member',name:'Member',url:'/u/member',logo_url:'https://example.com/person.jpg',subtitle:'Member title'};
 const results=await ctx.enrichCompanies([{kind:'company',name:sample.name,url:'/company/'+sample.slug},person]);
 assert.equal(results[0].logo_url,sample.logo_url);assert.equal(results[0].subtitle,sample.short_description);assert.equal(results[1],person);
 assert.ok(html.includes('white-space:normal'));assert.ok(html.includes('object-fit:contain'));
});
test('inline search scripts parse',()=>{
 const html=readFileSync(new URL('../search.html',import.meta.url),'utf8');
 for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
 const {ctx}=context();const inline=vm.runInContext('SEARCH_JS',ctx);new vm.Script(inline.slice(8,-9));
});
