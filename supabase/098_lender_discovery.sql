-- Public projection over canonical presences; no separate lender identities.
-- The existing directory supplies the active/public/company visibility boundary.
-- Only explicit discovery fields are exposed. Source names, research notes,
-- owner IDs, verification evidence and the rest of metadata stay private.
create or replace view public.public_business_discovery with (security_barrier=true) as
select d.*, p.logo_url,
  case when p.metadata->'directory'->>'state' = 'publish_ready'
    then p.metadata->'directory'->>'primary_type' end as primary_type,
  case when p.metadata->'directory'->>'state' = 'publish_ready'
         and jsonb_typeof(p.metadata->'directory'->'specialties') = 'array'
    then p.metadata->'directory'->'specialties' else '[]'::jsonb end as specialties,
  case when p.metadata->'directory'->>'state' = 'publish_ready'
         and p.metadata->'directory'->>'aapl_2026_confirmed' = 'true'
    then 'AAPL Annual Conference 2026 industry participant' end as conference_affiliation,
  case
    when p.metadata->'directory'->>'state' in ('verify','duplicate_or_related') then null
    when p.metadata->'directory'->>'state' = 'publish_ready'
         and p.metadata->'directory'->>'kind' <> 'lender' then null
    when p.metadata->'directory'->>'state' = 'publish_ready'
         and p.metadata->'directory'->>'kind' = 'lender'
         and p.metadata->'directory'->>'primary_type' = 'Capital Provider' then 'capital-providers'
    when p.metadata->'directory'->>'state' = 'publish_ready'
         and p.metadata->'directory'->>'kind' = 'lender'
         and p.metadata->'directory'->>'primary_type' in ('Private Lender','Bridge Lender','Construction Lender') then 'private-lenders'
    when p.metadata->'directory'->>'state' = 'publish_ready'
         and p.metadata->'directory'->>'kind' = 'lender'
         and p.metadata->'directory'->>'primary_type' = 'Mortgage Lender' then 'mortgage-companies'
    when p.metadata->'directory'->>'state' = 'publish_ready'
         and p.metadata->'directory'->>'kind' = 'lender'
         and p.metadata->'directory'->>'primary_type' = 'Institutional Lender' then 'financial-institutions'
    when d.cat_slug in ('private-lenders','mortgage-companies','financial-institutions',
                       'commercial-finance','sba-business-lenders') then d.cat_slug
    else null
  end as lender_type
from public.public_business_directory d
join public.presences p on p.id=d.id;
grant select on public.public_business_discovery to anon, authenticated;
notify pgrst, 'reload schema';
