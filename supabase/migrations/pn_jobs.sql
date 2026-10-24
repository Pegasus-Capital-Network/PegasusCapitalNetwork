-- Pegasus Jobs & Talent board. Run once in Supabase → SQL Editor.
-- People can POST a job (kind='hiring') or REQUEST work (kind='seeking').
-- Public read of active listings; any signed-in member can post; owners edit/close their own.

create table if not exists public.pn_jobs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind          text not null check (kind in ('hiring','seeking')),
  title         text not null check (char_length(title) between 2 and 140),
  company       text check (company is null or char_length(company) <= 140),
  category      text not null,
  employment    text,
  location      text,
  remote        text check (remote is null or remote in ('onsite','hybrid','remote')),
  markets       text,
  comp          text,
  description   text not null check (char_length(description) between 10 and 6000),
  apply_url     text,
  contact_email text,
  link_slug     text,
  status        text not null default 'active' check (status in ('active','closed')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists pn_jobs_feed_idx on public.pn_jobs (status, kind, created_at desc);
create index if not exists pn_jobs_cat_idx  on public.pn_jobs (category);
create index if not exists pn_jobs_user_idx on public.pn_jobs (user_id);

alter table public.pn_jobs enable row level security;

drop policy if exists pn_jobs_read_active on public.pn_jobs;
create policy pn_jobs_read_active on public.pn_jobs
  for select using (status = 'active' or user_id = auth.uid());

drop policy if exists pn_jobs_insert on public.pn_jobs;
create policy pn_jobs_insert on public.pn_jobs
  for insert with check (auth.uid() is not null and user_id = auth.uid());

drop policy if exists pn_jobs_update on public.pn_jobs;
create policy pn_jobs_update on public.pn_jobs
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists pn_jobs_delete on public.pn_jobs;
create policy pn_jobs_delete on public.pn_jobs
  for delete using (user_id = auth.uid());

create or replace function public.pn_jobs_touch() returns trigger
  language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists pn_jobs_touch_t on public.pn_jobs;
create trigger pn_jobs_touch_t before update on public.pn_jobs
  for each row execute function public.pn_jobs_touch();
