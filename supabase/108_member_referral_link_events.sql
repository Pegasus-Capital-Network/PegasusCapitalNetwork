-- 108 — Member referral-link acquisition events.
-- Adds measurable member share-loop steps to the existing first-party funnel.

create or replace function public.track_event(
  p_event text, p_path text, p_slug text default null, p_ref text default null,
  p_utm_source text default null, p_utm_medium text default null, p_utm_campaign text default null,
  p_lang text default null, p_sid text default null, p_device text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_event is null or p_event !~ '^(page_view|engaged|claim_view|claim_signin_prompt|claim_link_sent|claim_submit|claim_done|signup_view|signup_submit|signin_done|financing_view|financing_start|financing_submit|financing_done|partner_link_view|partner_link_copy|partner_link_share|partner_link_open)$' then return; end if;
  if p_sid is not null and p_sid !~ '^[a-z0-9]{8,32}$' then p_sid := null; end if;
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
