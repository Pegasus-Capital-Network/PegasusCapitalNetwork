import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../netlify/functions/presence-seo-page.js',import.meta.url),'utf8');
const {default:handler}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const original=globalThis.fetch;
globalThis.Netlify={env:{get:n=>n==='SUPABASE_URL'?'https://example.test':'public-key'}};
let locked=false,affiliation=true;
globalThis.fetch=async(input)=>{
 const u=new URL(input);
 if(u.pathname==='/presence.html')return new Response('<html><head><title>Profile</title></head><body></body></html>');
 if(u.pathname.endsWith('/get_presence_page_by_slug')) return Response.json(locked?{access:'locked'}:{access:'full',presence:{name:'Example Lender',slug:'example-lender',presence_type:'company',visibility:'public_preview',status:'active',short_description:'Verified lending business.',metadata:{secret:'NEVER_PUBLIC'}}});
 if(u.pathname.endsWith('/public_presence_previews'))return Response.json([{is_claimable:true}]);
 if(u.pathname.endsWith('/public_business_discovery'))return Response.json([{conference_affiliation:affiliation?'AAPL Annual Conference 2026 industry participant':null}]);
 if(u.pathname.endsWith('/public_business_directory'))return Response.json([{cat_slug:'private-lenders',cat_label:'Private Lenders',section_slug:'capital',section_label:'Capital',hmda_rank:42}]);
 throw Error('Unexpected request');
};
test('conference context preserves the canonical page, claim and ranking badge',async()=>{
 const r=await handler(new Request('https://pegasuscapitalnetwork.com/business/example-lender'));const html=await r.text();
 assert.equal(r.status,200);assert.match(html,/AAPL Annual Conference 2026 industry participant/);
 assert.match(html,/href="https:\/\/aaplonline.com\/conference\/"/);
 assert.match(html,/\/claim\?presence=example-lender/);assert.match(html,/\/rankings\/badge\/example-lender/);
 assert.match(html,/rel="canonical" href="https:\/\/pegasuscapitalnetwork.com\/business\/example-lender"/);
 assert(!html.includes('NEVER_PUBLIC'));assert(!html.includes('sponsor'));
});
test('unknown affiliation stays absent and locked profiles remain private',async()=>{
 affiliation=false;let r=await handler(new Request('https://pegasuscapitalnetwork.com/business/example-lender'));assert(!(await r.text()).includes('aaplonline.com'));
 locked=true;affiliation=true;r=await handler(new Request('https://pegasuscapitalnetwork.com/business/example-lender'));
 assert.match(r.headers.get('X-Robots-Tag'),/noindex/);assert(!(await r.text()).includes('AAPL'));
});
test.after(()=>{globalThis.fetch=original;delete globalThis.Netlify;});
