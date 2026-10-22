-- 102 — Members due a one-time profile-completion reminder (used by the
-- scheduled function netlify/functions/profile-reminder.js, service role only).
create or replace function public.profile_reminder_candidates(p_limit int default 50)
returns table(id uuid, email text, full_name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.email, p.full_name
  from public.profiles p
  where p.deleted_at is null
    and coalesce(p.onboarding_complete, false) = false
    and coalesce(p.email, '') <> ''
    and coalesce(p.digest_opt_out, false) = false
    and coalesce(p.is_admin, false) = false
    and p.completion_reminded_at is null
    and p.created_at <= now() - interval '1 day'
    and p.created_at >= now() - interval '21 days'
  order by p.created_at
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;
revoke all on function public.profile_reminder_candidates(int) from public, anon, authenticated;
grant execute on function public.profile_reminder_candidates(int) to service_role;
