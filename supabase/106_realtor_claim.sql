-- 106 — Realtor profile claiming. Agents in the directory (pn_agents, imported
-- from public info) can claim and edit their own listing. Claims verify
-- instantly when the signed-in email matches the email on file, else a Pegasus
-- admin reviews. Claimed agents edit their card (title, specialty, website,
-- photo, contact visibility). Nothing here exposes private data: the public
-- view keeps phone/email hidden unless the agent marks them public.

alter table public.pn_agents add column if not exists slug text;
alter table public.pn_agents add column if not exists claimed_by uuid references auth.users(id) on delete set null;
alter table public.pn_agents add column if not exists claimed_at timestamptz;

-- One stable slug per agent: name + 6 hex of the id (id is unique → slug is).
update public.pn_agents
   set slug = trim(both '-' from regexp_replace(lower(coalesce(nullif(full_name,''),'agent')), '[^a-z0-9]+', '-', 'g'))
              || '-' || substr(replace(id::text,'-',''),1,6)
 where slug is null;
create unique index if not exists pn_agents_slug_key on public.pn_agents(slug);

-- public_realtors: add slug + claimed at the END (CREATE OR REPLACE is
-- append-only on column order); claimable now keys off claimed_by.
create or replace view public.public_realtors as
 select id, full_name, company_name_snapshot as brokerage, job_title,
        license_number as dre, city, state, specialty,
        case when (metadata->>'contact_public')='true' then phone end as phone,
        case when (metadata->>'contact_public')='true' then email end as email,
        website, metadata->>'photo_url' as photo_url, metadata->>'profile_url' as profile_url,
        (metadata->>'contact_public')='true' as contact_public,
        (coalesce(metadata->>'claimable','false')='true' and claimed_by is null) as claimable,
        slug,
        claimed_by is not null as claimed
   from pn_agents where status='active';

create table if not exists public.pn_agent_claims(
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references pn_agents(id) on delete cascade,
  claimant_id uuid not null references auth.users(id) on delete cascade,
  claimant_email text, evidence text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz default now(), reviewed_by uuid, reviewed_at timestamptz
);
create index if not exists pn_agent_claims_status_idx on public.pn_agent_claims(status, created_at);
alter table public.pn_agent_claims enable row level security;
revoke all on public.pn_agent_claims from anon, authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='pn_agent_claims' and policyname='pn_agent_claims_own') then
    create policy pn_agent_claims_own on public.pn_agent_claims for select to authenticated
      using (claimant_id = auth.uid() or public.is_admin_user());
  end if;
end $$;

-- Anon: resolve one agent's public card by slug (for the claim page).
create or replace function public.public_realtor_by_slug(p_slug text)
returns jsonb language sql stable security definer set search_path=public as $$
  select to_jsonb(r) from public.public_realtors r where r.slug = p_slug limit 1;
$$;
grant execute on function public.public_realtor_by_slug(text) to anon, authenticated;

-- Claim a listing. Instant when the signed-in email matches the email on file.
create or replace function public.create_agent_claim(p_agent_id uuid, p_evidence text default null, p_contact text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid := auth.uid(); v_uemail text; v_aemail text; v_claimed uuid; v_status text;
begin
  if v_uid is null then raise exception 'sign in required'; end if;
  select claimed_by, lower(email) into v_claimed, v_aemail from pn_agents where id=p_agent_id and status='active';
  if not found then raise exception 'listing not found'; end if;
  if v_claimed is not null then
    if v_claimed = v_uid then return jsonb_build_object('status','approved','mine',true); end if;
    raise exception 'already claimed';
  end if;
  select lower(email) into v_uemail from auth.users where id=v_uid;
  if v_uemail is not null and v_aemail is not null and v_uemail = v_aemail then
    update pn_agents set claimed_by=v_uid, claimed_at=now(),
       metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object('claimed',true) where id=p_agent_id;
    insert into pn_agent_claims(agent_id,claimant_id,claimant_email,evidence,status,reviewed_at)
      values (p_agent_id,v_uid,v_uemail,p_evidence,'approved',now());
    v_status := 'approved';
  else
    insert into pn_agent_claims(agent_id,claimant_id,claimant_email,evidence,status)
      values (p_agent_id,v_uid,v_uemail,coalesce(nullif(p_evidence,''),p_contact),'pending');
    v_status := 'pending';
  end if;
  return jsonb_build_object('status',v_status);
end $$;
grant execute on function public.create_agent_claim(uuid,text,text) to authenticated;

-- The listings the signed-in user has claimed (for the edit page).
create or replace function public.get_my_agent_listings()
returns setof jsonb language sql stable security definer set search_path=public as $$
  select to_jsonb(a) from (
    select id, slug, full_name, company_name_snapshot as brokerage, job_title, license_number as dre,
           city, state, specialty, website, phone, email,
           metadata->>'photo_url' as photo_url, (metadata->>'contact_public')='true' as contact_public
    from pn_agents where claimed_by = auth.uid()
  ) a;
$$;
grant execute on function public.get_my_agent_listings() to authenticated;

-- The owner edits their own card. Only the fields an agent controls.
create or replace function public.agent_update_my_listing(
  p_agent_id uuid, p_job_title text default null, p_specialty text default null,
  p_website text default null, p_photo_url text default null,
  p_phone text default null, p_email text default null, p_contact_public boolean default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'sign in required'; end if;
  update pn_agents set
    job_title = coalesce(nullif(p_job_title,''), job_title),
    specialty = coalesce(p_specialty, specialty),
    website   = coalesce(nullif(p_website,''), website),
    phone     = coalesce(nullif(p_phone,''), phone),
    email     = coalesce(nullif(p_email,''), email),
    metadata  = coalesce(metadata,'{}'::jsonb)
                || case when p_photo_url is not null then jsonb_build_object('photo_url', nullif(p_photo_url,'')) else '{}'::jsonb end
                || case when p_contact_public is not null then jsonb_build_object('contact_public', p_contact_public) else '{}'::jsonb end,
    updated_at = now()
  where id = p_agent_id and claimed_by = v_uid;
  if not found then raise exception 'not your listing'; end if;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.agent_update_my_listing(uuid,text,text,text,text,text,text,boolean) to authenticated;

-- Admin reviews a pending claim.
create or replace function public.admin_review_agent_claim(p_claim_id uuid, p_approve boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_agent uuid; v_claimant uuid;
begin
  if not public.is_admin_user() then raise exception 'admin only'; end if;
  select agent_id, claimant_id into v_agent, v_claimant from pn_agent_claims where id=p_claim_id and status='pending';
  if not found then raise exception 'claim not pending'; end if;
  if p_approve then
    update pn_agents set claimed_by=v_claimant, claimed_at=now(),
      metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object('claimed',true)
      where id=v_agent and claimed_by is null;
    update pn_agent_claims set status='approved', reviewed_by=auth.uid(), reviewed_at=now() where id=p_claim_id;
  else
    update pn_agent_claims set status='rejected', reviewed_by=auth.uid(), reviewed_at=now() where id=p_claim_id;
  end if;
  return jsonb_build_object('ok', true, 'approved', p_approve);
end $$;
grant execute on function public.admin_review_agent_claim(uuid,boolean) to authenticated;
