-- Pegasus AI restructure: Directory (reference) vs real opportunity surfaces.
-- Run once in Supabase -> SQL Editor.

-- 1) SEEKING CAPITAL — confirmed need, members-only.
alter table public.funding_requests add column if not exists member_visible boolean not null default false;

create or replace function public.ai_seeking_capital()
returns table (
  id uuid, company_name text, website text, sector text, stage text,
  raising_amount text, one_liner text, traction text, location text, created_at timestamptz
)
language sql security definer set search_path = public as $$
  select id, company_name, website, sector, stage, raising_amount, one_liner, traction, location, created_at
    from public.funding_requests
   where member_visible = true
     and coalesce(status,'new') <> 'passed'
     and auth.uid() is not null
   order by created_at desc
   limit 300;
$$;
grant execute on function public.ai_seeking_capital() to authenticated;
revoke execute on function public.ai_seeking_capital() from anon;

create or replace function public.ai_seeking_capital_count()
returns integer
language sql security definer set search_path = public as $$
  select count(*)::int from public.funding_requests
   where member_visible = true and coalesce(status,'new') <> 'passed';
$$;
grant execute on function public.ai_seeking_capital_count() to anon, authenticated;

-- 2) CAPITAL PROVIDERS — keep existing public; new self-listings need consent.
alter table public.ai_investors add column if not exists consent boolean not null default false;

create or replace function public.submit_investor_listing(
  p_name text, p_firm text, p_investor_type text, p_focus text, p_stage text,
  p_check_size text, p_location text, p_website text, p_angle text,
  p_contact_email text, p_consent boolean
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if coalesce(p_consent,false) is not true then
    return jsonb_build_object('ok', false, 'message', 'Consent is required to be listed.');
  end if;
  if nullif(btrim(coalesce(p_name,'')),'') is null and nullif(btrim(coalesce(p_firm,'')),'') is null then
    return jsonb_build_object('ok', false, 'message', 'Add your name or firm.');
  end if;
  insert into public.ai_investors(name, firm, investor_type, focus, stage, check_size, location, website, angle, notes, consent, status, source_name)
  values (nullif(btrim(p_name),''), nullif(btrim(p_firm),''), nullif(btrim(p_investor_type),''),
          nullif(btrim(p_focus),''), nullif(btrim(p_stage),''), nullif(btrim(p_check_size),''),
          nullif(btrim(p_location),''), nullif(btrim(p_website),''), nullif(btrim(p_angle),''),
          case when nullif(btrim(p_contact_email),'') is not null then 'self-listed contact: '||btrim(p_contact_email) else null end,
          true, 'pending', 'self')
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;
grant execute on function public.submit_investor_listing(text,text,text,text,text,text,text,text,text,text,boolean) to anon, authenticated;

create or replace view public.public_ai_investors as
  select id, name, firm, focus, stage, check_size, tier, location, consent
    from public.ai_investors
   where status not in ('passed','pending');

-- 3) INVESTMENT MATCHES — curated pairs; names masked until BOTH consent.
create table if not exists public.ai_matches (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid references public.ai_startups(id) on delete set null,
  company_name   text not null,
  company_sector text,
  investor_id    uuid references public.ai_investors(id) on delete set null,
  investor_name  text not null,
  investor_firm  text,
  rationale      text not null,
  company_consent  boolean not null default false,
  investor_consent boolean not null default false,
  status         text not null default 'draft' check (status in ('draft','published','archived')),
  sort           int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.ai_matches enable row level security;

drop policy if exists ai_matches_admin_all on public.ai_matches;
create policy ai_matches_admin_all on public.ai_matches
  for all using (public.is_admin_user()) with check (public.is_admin_user());

create or replace view public.public_ai_matches as
  select id, rationale, sort, created_at,
         (company_consent and investor_consent) as revealed,
         case when company_consent and investor_consent then company_name
              else coalesce(nullif(company_sector,'')||' company', 'An AI company') end as company_label,
         case when company_consent and investor_consent then investor_name else null end as investor_name_pub,
         case when company_consent and investor_consent then investor_firm
              else coalesce(nullif(investor_firm,'') , 'A capital provider') end as investor_label
    from public.ai_matches
   where status = 'published'
   order by sort asc, created_at desc;

grant select on public.public_ai_matches to anon, authenticated;
grant select on public.public_ai_investors to anon, authenticated;
