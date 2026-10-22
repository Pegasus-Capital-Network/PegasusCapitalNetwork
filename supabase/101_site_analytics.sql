-- 101 — First-party site analytics: page views and funnel steps.
-- No cookies and no personal data: the path without its query string (query
-- strings can carry invite tokens), the referring host, utm tags, language,
-- device class and a random id kept in sessionStorage for one browser tab.
-- Written only through track_event(); read only through admin_site_funnel().

create table if not exists public.site_events(
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  event        text not null,
  path         text not null,
  slug         text,
  ref_host     text,
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  lang         text,
  sid          text,
  device       text
);
create index if not exists site_events_at_idx on public.site_events(at);
create index if not exists site_events_sid_at_idx on public.site_events(sid, at);
alter table public.site_events enable row level security;
revoke all on public.site_events from anon, authenticated;

create or replace function public.track_event(
  p_event text, p_path text, p_slug text default null, p_ref text default null,
  p_utm_source text default null, p_utm_medium text default null, p_utm_campaign text default null,
  p_lang text default null, p_sid text default null, p_device text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_event is null or p_event !~ '^(page_view|claim_view|claim_signin_prompt|claim_link_sent|claim_submit|claim_done|signup_view|signup_submit|signin_done)$' then return; end if;
  if p_sid is not null and p_sid !~ '^[a-z0-9]{8,32}$' then p_sid := null; end if;
  -- At most 60 events per tab per 10 minutes.
  if p_sid is not null and (select count(*) from site_events where sid = p_sid and at > now() - interval '10 minutes') >= 60 then return; end if;
  insert into site_events(event, path, slug, ref_host, utm_source, utm_medium, utm_campaign, lang, sid, device)
  values (p_event,
          left(coalesce(nullif(split_part(p_path, '?', 1), ''), '/'), 200),
          nullif(left(regexp_replace(coalesce(p_slug, ''), '[^a-z0-9-]', '', 'g'), 120), ''),
          nullif(left(lower(regexp_replace(coalesce(p_ref, ''), '[^A-Za-z0-9.-]', '', 'g')), 120), ''),
          nullif(left(p_utm_source, 60), ''), nullif(left(p_utm_medium, 60), ''), nullif(left(p_utm_campaign, 80), ''),
          case when p_lang ~ '^[a-z]{2}$' then p_lang end,
          p_sid,
          case when p_device in ('mobile', 'desktop') then p_device end);
end $$;
revoke all on function public.track_event(text,text,text,text,text,text,text,text,text,text) from public;
grant execute on function public.track_event(text,text,text,text,text,text,text,text,text,text) to anon, authenticated;

-- Admin summary for the last p_days days. Visitors = distinct tab ids.
create or replace function public.admin_site_funnel(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_from timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));
begin
  if not public.is_admin_user() then raise exception 'admin only'; end if;
  return jsonb_build_object(
    'since', v_from,
    'totals', (select jsonb_build_object(
        'page_views', count(*) filter (where event = 'page_view'),
        'visitors', count(distinct sid) filter (where event = 'page_view'),
        'business_page_visitors', count(distinct sid) filter (where event = 'page_view' and path like '/business/%'))
      from site_events where at >= v_from),
    'funnel', (select coalesce(jsonb_object_agg(event, n), '{}'::jsonb) from (
        select event, count(distinct coalesce(sid, id::text)) n from site_events
        where at >= v_from and event <> 'page_view' group by event) f),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'views', v, 'visitors', u) order by d), '[]'::jsonb) from (
        select at::date d, count(*) v, count(distinct sid) u from site_events
        where at >= v_from and event = 'page_view' group by 1) x),
    'top_pages', (select coalesce(jsonb_agg(jsonb_build_object('path', path, 'views', v) order by v desc), '[]'::jsonb) from (
        select path, count(*) v from site_events where at >= v_from and event = 'page_view'
        group by path order by v desc limit 20) x),
    'referrers', (select coalesce(jsonb_agg(jsonb_build_object('host', ref_host, 'visitors', u) order by u desc), '[]'::jsonb) from (
        select ref_host, count(distinct sid) u from site_events where at >= v_from and event = 'page_view' and ref_host is not null
        group by ref_host order by u desc limit 15) x),
    'campaigns', (select coalesce(jsonb_agg(jsonb_build_object('source', utm_source, 'campaign', utm_campaign, 'visitors', u, 'claim_views', c) order by u desc), '[]'::jsonb) from (
        select utm_source, utm_campaign, count(distinct sid) filter (where event = 'page_view') u,
               count(distinct sid) filter (where event = 'claim_view') c
        from site_events where at >= v_from and utm_source is not null
        group by 1, 2 order by u desc limit 15) x)
  );
end $$;
revoke all on function public.admin_site_funnel(int) from public, anon;
grant execute on function public.admin_site_funnel(int) to authenticated;
