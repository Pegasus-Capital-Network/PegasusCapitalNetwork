-- ============================================================================
-- PEGASUS Migration 105 — Member activation lifecycle
--
-- Every real member with a live public profile is automatically eligible
-- for three useful, non-duplicating lifecycle messages:
--   1. profile_live   — their public page and share link
--   2. invite_circle  — invite one trusted professional
--   3. share_profile  — use Share Studio for social distribution
--
-- The scheduled Netlify function records a row only after Resend accepts the
-- message. digest_opt_out is the single opt-out for non-essential member mail.
-- ADDITIVE + IDEMPOTENT.
-- ============================================================================

create table if not exists public.pn_member_activation_events (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  step        text not null check (step in ('profile_live','invite_circle','share_profile')),
  email       text not null,
  resend_id   text,
  sent_at     timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  unique(profile_id, step)
);
create index if not exists idx_member_activation_sent
  on public.pn_member_activation_events(step, sent_at);
alter table public.pn_member_activation_events enable row level security;
-- Service role only. No public policies.
revoke all on table public.pn_member_activation_events from public, anon, authenticated;
grant all on table public.pn_member_activation_events to service_role;

create or replace function public.member_activation_candidates(p_limit int default 75)
returns table(
  id uuid,
  email text,
  full_name text,
  profile_slug text,
  professional_title text,
  company_name text,
  step text
)
language sql stable security definer set search_path = public as $$
  with eligible as (
    select p.*,
      (select e.sent_at from public.pn_member_activation_events e
        where e.profile_id=p.id and e.step='profile_live' limit 1) as live_sent,
      (select e.sent_at from public.pn_member_activation_events e
        where e.profile_id=p.id and e.step='invite_circle' limit 1) as invite_sent,
      exists(select 1 from public.pn_member_activation_events e
        where e.profile_id=p.id and e.step='share_profile') as shared_sent
    from public.profiles p
    where p.deleted_at is null
      and nullif(btrim(coalesce(p.profile_slug, '')), '') is not null
      and coalesce(p.email, '') ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
      and lower(p.email) not like '%@pegasuscapitalnetwork.com'
      and coalesce(p.digest_opt_out, false) = false
      and coalesce(p.is_admin, false) = false
  ), due as (
    select e.*,
      case
        when e.live_sent is null then 'profile_live'
        when e.invite_sent is null and e.live_sent <= now() - interval '3 days' then 'invite_circle'
        when not e.shared_sent and e.invite_sent <= now() - interval '7 days' then 'share_profile'
        else null
      end as due_step
    from eligible e
  )
  select d.id, lower(btrim(d.email)), d.full_name, d.profile_slug,
         d.professional_title, d.company_name, d.due_step
  from due d
  where d.due_step is not null
  order by case d.due_step when 'profile_live' then 1 when 'invite_circle' then 2 else 3 end,
           d.created_at asc
  limit greatest(1, least(coalesce(p_limit, 75), 150));
$$;

revoke all on function public.member_activation_candidates(int) from public, anon, authenticated;
grant execute on function public.member_activation_candidates(int) to service_role;

notify pgrst, 'reload schema';

