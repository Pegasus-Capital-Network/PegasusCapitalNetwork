// Public discovery over canonical Business Profiles. No lender identity table.
const ORIGIN = 'https://pegasuscapitalnetwork.com';
const SIZE = 24;
// Deliberately excludes generic platforms, brokers, managers and service firms.
const TYPES = {
  'capital-providers': 'Capital providers',
  'private-lenders': 'Private lenders',
  'mortgage-companies': 'Mortgage lenders',
  'financial-institutions': 'Banks & credit unions',
  'commercial-finance': 'Commercial & multifamily lenders',
  'sba-business-lenders': 'Business lenders',
};
const STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA PR RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function path(filters, page = 1) {
  const q = new URLSearchParams();
  for (const key of ['category', 'state', 'q']) if (filters[key]) q.set(key, filters[key]);
  if (page > 1) q.set('page', String(page));
  return '/lenders' + (q.size ? '?' + q : '');
}
function response(body, status = 200) {
  return new Response(body, {status, headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': status === 200 ? 'public, max-age=0, s-maxage=300, stale-while-revalidate=600' : 'no-store',
    'Netlify-Vary': 'query=category|state|q|page',
    'X-Robots-Tag': status === 200 ? 'index,follow' : 'noindex,follow',
  }});
}
function error(status, message) {
  return response('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(message)+' | Pegasus</title><meta name="robots" content="noindex,follow"></head><body><main><h1>'+esc(message)+'</h1><a href="/lenders">Lenders directory</a></main></body></html>', status);
}
function card(r) {
  const logo = /^https:\/\//i.test(r.logo_url || '') ? r.logo_url : '';
  const tags = Array.isArray(r.specialties) ? r.specialties.filter(t => typeof t === 'string').slice(0, 6) : [];
  const url = '/business/' + encodeURIComponent(r.slug);
  const rank = Number(r.hmda_rank);
  return '<article class="lender-card"><div class="lender-top">'+(logo?'<img class="lender-logo" src="'+esc(logo)+'" alt="" width="48" height="48" loading="lazy" referrerpolicy="no-referrer">':'<span class="lender-initial" aria-hidden="true">'+esc(r.name.slice(0,1))+'</span>')+'<div><p class="lender-type">'+esc(r.primary_type || r.cat_label || r.category)+'</p><h2><a href="'+url+'">'+esc(r.name)+'</a></h2></div></div>'+
    (r.location ? '<p class="lender-location">'+esc(r.location)+'</p>' : '')+
    '<p class="lender-description">'+esc(r.short_description || r.tagline || '')+'</p>'+
    (tags.length ? '<ul class="lender-tags" aria-label="Specialties">'+tags.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul>' : '')+
    (rank > 0 ? '<p class="lender-rank"><a href="/rankings/top-mortgage-lenders-2025">#'+esc(rank)+' · 2025 HMDA ranking</a></p>' : '')+
    '<a class="lender-open" href="'+url+'">View business profile <span aria-hidden="true">→</span></a></article>';
}
function render(rows, total, filters, page) {
  const canonical = ORIGIN + path(filters, page);
  const title = (filters.category ? TYPES[filters.category] : 'Lenders Directory')+(filters.state ? ' in '+filters.state : '')+(filters.q ? ' — '+filters.q : '')+(page > 1 ? ' — Page '+page : '')+' | Pegasus Capital Network';
  const description = 'Discover private, mortgage, commercial and business lenders. Browse public company profiles, explore lender categories and connect through Pegasus Capital Network.';
  const pages = total === null ? null : Math.ceil(total / SIZE);
  const next = pages === null ? rows.length === SIZE : page < pages;
  const ld = {'@context':'https://schema.org','@type':'ItemList',name:title,url:canonical,itemListElement:rows.map((r,i)=>({'@type':'ListItem',position:(page-1)*SIZE+i+1,name:r.name,url:ORIGIN+'/business/'+encodeURIComponent(r.slug)}))};
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>'+esc(title)+'</title><meta name="description" content="'+esc(description)+'"><meta name="robots" content="index,follow,max-image-preview:large"><link rel="canonical" href="'+esc(canonical)+'">'+
    '<meta property="og:type" content="website"><meta property="og:title" content="'+esc(title)+'"><meta property="og:description" content="'+esc(description)+'"><meta property="og:url" content="'+esc(canonical)+'">'+
    '<meta property="og:image" content="'+ORIGIN+'/assets/brand/pegasus-mark.png"><link rel="icon" href="/assets/brand/favicon.ico"><link rel="stylesheet" href="/css/pegasus.css"><link rel="stylesheet" href="/css/lenders-directory.css">'+
    (page > 1 ? '<link rel="prev" href="'+esc(ORIGIN+path(filters,page-1))+'">' : '')+
    (next ? '<link rel="next" href="'+esc(ORIGIN+path(filters,page+1))+'">' : '')+
    '<script type="application/ld+json">'+JSON.stringify(ld).replace(/</g,'\\u003c')+'</script><script src="/js/i18n.js?v=20261021e"></script><script src="/js/ticker.js?v=20261021b" defer></script></head><body>'+
    '<a class="lenders-skip" href="#maincontent">Skip to lenders</a><nav class="lenders-nav" aria-label="Main"><a class="brand" href="/"><img class="brand-mark" src="/assets/brand/pegasus-symbol.svg" alt=""><span>Pegasus Network</span></a><div><a href="/people">People</a><a href="/businesses">Businesses</a><a href="/lenders" aria-current="page">Lenders</a><a href="/rankings">Rankings</a></div></nav>'+
    '<main id="maincontent" class="lenders-wrap"><header class="lenders-header"><p class="lenders-eyebrow">The Pegasus capital network</p><h1>Find your next lending partner.</h1><p>Explore lenders by business type and location. Every listing connects to its company’s Business Profile.</p><a href="/businesses/services">Looking for servicing, legal, insurance or technology providers? Browse business services →</a></header>'+
    '<form class="lenders-filters" action="/lenders" method="get" role="search"><label>Company name<input type="search" name="q" value="'+esc(filters.q)+'" maxlength="80" placeholder="Search lenders"></label><label>Lender type<select name="category"><option value="">All lender types</option>'+Object.entries(TYPES).map(([k,v])=>'<option value="'+k+'"'+(filters.category===k?' selected':'')+'>'+esc(v)+'</option>').join('')+'</select></label><label>Headquarters state<select name="state"><option value="">All states</option>'+STATES.map(s=>'<option'+(filters.state===s?' selected':'')+'>'+s+'</option>').join('')+'</select></label><button type="submit">Search lenders</button></form>'+
    '<div class="lenders-results"><h2>'+(total === null ? 'Lenders' : total.toLocaleString('en-US')+' '+(total===1?'lender':'lenders'))+'</h2><p>Page '+page+(pages ? ' of '+pages : '')+'</p>'+(Object.values(filters).some(Boolean)?'<a href="/lenders">Clear filters</a>':'')+'</div>'+
    (rows.length ? '<section class="lenders-grid" aria-label="Lender profiles">'+rows.map(card).join('')+'</section>' : '<section class="lenders-empty"><h2>No lenders match these filters</h2><p>Try another name, lender type or headquarters state.</p><a href="/lenders">Browse all lenders</a></section>')+
    '<nav class="lenders-pager" aria-label="Pagination">'+(page>1?'<a rel="prev" href="'+esc(path(filters,page-1))+'">← Previous</a>':'')+(next?'<a rel="next" href="'+esc(path(filters,page+1))+'">Next →</a>':'')+'</nav>'+
    '<aside class="lenders-note"><h2>Represent a listed company?</h2><p>Open your Business Profile to use the existing claim process, update company details and connect your team.</p></aside></main><footer class="lenders-footer"><a href="/businesses">All businesses</a><a href="/lenders">Lenders directory</a><a href="/rankings">Lender rankings</a><a href="/disclosures.html">Disclosures</a><p>Pegasus is a professional network. Financing is provided by independent lenders.</p></footer></body></html>';
}
export default async function handler(request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return error(405, 'Method not allowed');
  const q = new URL(request.url).searchParams;
  const filters = {category:q.get('category')||'',state:(q.get('state')||'').toUpperCase(),q:(q.get('q')||'').replace(/\s+/g,' ').trim().slice(0,80)};
  const rawPage = q.get('page') || '1';
  if (!/^\d+$/.test(rawPage) || +rawPage < 1 || +rawPage > 10000 || (filters.category && !Object.hasOwn(TYPES,filters.category)) || (filters.state && !STATES.includes(filters.state))) return error(404,'Directory page not found');
  const page = +rawPage;
  try {
    const env = name => globalThis.Netlify?.env?.get(name) || '';
    const url = env('SUPABASE_URL'), key = env('SUPABASE_PUBLISHABLE_KEY');
    if (!url || !key) throw new Error('Configuration missing');
    const params = new URLSearchParams({
      select:'name,slug,short_description,tagline,category,cat_slug,cat_label,location,hmda_rank,logo_url,primary_type,specialties,lender_type',
      lender_type:filters.category?'eq.'+filters.category:'in.('+Object.keys(TYPES).join(',')+')',
      order:'name.asc,slug.asc',
    });
    if (filters.state) params.set('state_code','eq.'+filters.state);
    // A single-column PostgREST filter; escape user wildcards for literal names.
    if (filters.q) params.set('name','ilike.*'+filters.q.replace(/[\\%_*]/g,'\\$&')+'*');
    const res = await fetch(url.replace(/\/$/,'')+'/rest/v1/public_business_discovery?'+params, {headers:{apikey:key,Authorization:'Bearer '+key,Range:((page-1)*SIZE)+'-'+(page*SIZE-1),'Range-Unit':'items',Prefer:'count=exact'},signal:AbortSignal.timeout(10000)});
    if (res.status === 416) return error(404,'Directory page not found');
    if (!res.ok) throw new Error('Directory unavailable');
    const rows = await res.json();
    // Fail closed: never replace filtered results with the general directory.
    if (!Array.isArray(rows) || rows.some(r=>!r.name || !/^[a-z0-9][a-z0-9-]*$/i.test(r.slug) || !Object.hasOwn(TYPES,r.lender_type))) throw new Error('Invalid directory response');
    if (page > 1 && !rows.length) return error(404,'Directory page not found');
    const count = /\/(\d+)$/.exec(res.headers.get('content-range')||'');
    const result = response(render(rows,count?+count[1]:null,filters,page));
    return request.method==='HEAD'?new Response(null,{status:result.status,headers:result.headers}):result;
  } catch (_) {
    return error(503,'Lenders directory temporarily unavailable');
  }
}
