// Compile a reviewed, private JSON plan into a transactional SQL script.
// No database connection or automatic publication. Keep input/output outside
// the Netlify publish directory: they contain internal verification metadata.
import {readFile,writeFile} from 'node:fs/promises';
export function compilePlan(rows) {
  if (!Array.isArray(rows) || !rows.length) throw Error('Empty publication plan');
  const ids=new Set(),slugs=new Set();
  for(const r of rows) {
    if(r.directory?.state!=='publish_ready' || !['create','enrich'].includes(r.action)) throw Error('Only reviewed publish_ready records are allowed');
    if(!/^[0-9a-f-]{36}$/.test(r.canonical_id)||!/^[a-z0-9][a-z0-9-]*$/.test(r.canonical_slug)) throw Error('Invalid canonical identity');
    if(ids.has(r.canonical_id)||slugs.has(r.canonical_slug)) throw Error('Duplicate canonical identity');
    ids.add(r.canonical_id);slugs.add(r.canonical_slug);
    const u=new URL(r.website);
    if(u.protocol!=='https:'||u.username||u.password) throw Error('Official HTTPS website required');
    const words=r.description?.trim().split(/\s+/).length;
    if(!(words>=40&&words<=100)||!r.category||!r.clean_name||!['lender','service'].includes(r.directory.kind)) throw Error('Incomplete verified profile');
    if(!Array.isArray(r.directory.sources)||!r.directory.sources.some(s=>s.role==='official_company')) throw Error('Official evidence required');
    if(r.action==='enrich'&&!r.expected_updated_at) throw Error('Missing concurrency guard');
  }
  const json=JSON.stringify(rows).replace(/'/g,"''");
  return `-- REVIEWED DATA WRITE. Requires explicit production approval before execution.
-- Atomic; re-runnable; aborts on concurrent edits, claims, or identity conflicts.
begin;
lock table public.presences in share row exclusive mode;
do $import$
declare
  rows jsonb := '${json}'::jsonb;
  r jsonb; current_row public.presences%rowtype; actor uuid; matches integer;
begin
  -- Reuse the existing administrator who owns the canonical directory stubs.
  select p.owner_user_id into actor from public.presences p
  join public.profiles pr on pr.id=p.owner_user_id and pr.is_admin=true
  where p.slug='rcn-capital-7c84b' and p.metadata->>'unclaimed'='true';
  if actor is null then raise exception 'Directory administrator/ownership changed; review required'; end if;
  for r in select value from jsonb_array_elements(rows) loop
    if r->'directory'->>'state' <> 'publish_ready' then raise exception 'Non-ready record'; end if;
    select * into current_row from public.presences where id=(r->>'canonical_id')::uuid;
    if found and current_row.metadata->'directory'->>'batch_id'=r->'directory'->>'batch_id' then
      continue; -- Same batch already applied; never overwrite later user edits.
    end if;
    if r->>'action'='enrich' then
      if current_row.id is null or current_row.slug<>r->>'canonical_slug'
         or current_row.updated_at is distinct from (r->>'expected_updated_at')::timestamptz
         or current_row.metadata->>'unclaimed' is distinct from 'true'
         or current_row.status<>'active' or current_row.visibility<>'public_preview'
         or current_row.public_preview_enabled is distinct from true
         or not exists(select 1 from public.profiles where id=current_row.owner_user_id and is_admin=true)
      then raise exception 'Existing profile changed: %',r->>'canonical_slug'; end if;
      update public.presences set
        short_description=r->>'description',category=coalesce(category,r->>'category'),
        website_url=r->>'website', logo_url=coalesce(logo_url,r->>'logo_url'), location=coalesce(r->>'location',location),
        public_cta_label=coalesce(public_cta_label,'Visit website'),
        public_cta_url=coalesce(public_cta_url,r->>'website'),
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('directory',r->'directory'),
        updated_by_user_id=actor,updated_at=now()
      where id=current_row.id;
    else
      select count(*) into matches from public.presences p where p.presence_type<>'personal' and (
        p.id=(r->>'canonical_id')::uuid or p.slug=r->>'canonical_slug'
        or regexp_replace(lower(regexp_replace(p.name,'\\m(llc|inc|corporation|corp|the)\\M','','gi')),'[^a-z0-9]','','g')
         = regexp_replace(lower(regexp_replace(r->>'clean_name','\\m(llc|inc|corporation|corp|the)\\M','','gi')),'[^a-z0-9]','','g')
        or split_part(regexp_replace(lower(p.website_url),'^https?://(www\\.)?',''), '/',1)
         = split_part(regexp_replace(lower(r->>'website'),'^https?://(www\\.)?',''), '/',1));
      if matches<>0 then raise exception 'New canonical match appeared: %; review required',r->>'clean_name'; end if;
      insert into public.presences(id,presence_type,owner_user_id,created_by_user_id,updated_by_user_id,
        name,slug,category,industry,short_description,location,website_url,logo_url,public_cta_label,public_cta_url,
        visibility,status,public_preview_enabled,show_owner_publicly,show_representatives_publicly,metadata)
      values((r->>'canonical_id')::uuid,'company',actor,actor,actor,r->>'clean_name',r->>'canonical_slug',
        r->>'category',r->'directory'->>'primary_type',r->>'description',r->>'location',r->>'website',r->>'logo_url',
        'Visit website',r->>'website','public_preview','active',true,false,false,
        jsonb_build_object('unclaimed',true,'source','aapl_2026_reviewed','directory',r->'directory'));
    end if;
  end loop;
end $import$;
commit;
`;
}
if(process.argv[1]&&import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const [input,output]=process.argv.slice(2);
  if(!input||!output) throw Error('Usage: node scripts/aapl-import-plan.mjs PRIVATE_PLAN.json PRIVATE_OUTPUT.sql');
  await writeFile(output,compilePlan(JSON.parse(await readFile(input,'utf8'))));
  console.log('SQL plan compiled; no database changes executed.');
}
