-- Founding Member numbering + warm welcome announcement. Applied live.
alter table public.profiles add column if not exists founding_no int;
alter table public.profiles add column if not exists founding_at timestamptz;

-- Backfill existing members by join order.
with ranked as (
  select id, row_number() over (order by created_at asc, id asc) as rn
    from public.profiles
   where coalesce(is_admin,false)=false and coalesce(full_name,'')<>'' and coalesce(status,'active')='active'
)
update public.profiles p set founding_no=r.rn, founding_at=coalesce(p.founding_at,p.created_at,now())
from ranked r where r.id=p.id and p.founding_no is null;

-- Warm welcome announcement + founding-number assignment (first N members).
create or replace function public.feed_announce_member()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_cap int := 250;
  v_next int;
  v_fn text;
begin
  if new.feed_announced_at is not null then return new; end if;
  if coalesce(new.full_name,'')='' then return new; end if;
  if coalesce(new.is_admin,false) then new.feed_announced_at=now(); return new; end if;
  if new.id='ed5ef0c9-d6d6-4a6d-86cb-8c093225956c' then new.feed_announced_at=now(); return new; end if;
  if coalesce(new.status,'active') not in ('active') then return new; end if;

  if new.founding_no is null then
    select coalesce(max(founding_no),0)+1 into v_next from public.profiles;
    if v_next <= v_cap then new.founding_no := v_next; new.founding_at := now(); end if;
  end if;

  new.feed_announced_at=now();
  v_fn := new.full_name || coalesce(' — '||nullif(new.headline,''),'') || coalesce(' · '||nullif(new.location,''),'');

  insert into public.member_signals (user_id, signal_type, title, content, link_url)
  values (
    'ed5ef0c9-d6d6-4a6d-86cb-8c093225956c','update',
    'Welcome, '||new.full_name||'!',
    v_fn
      || case when new.founding_no is not null
              then ' just joined Pegasus as Founding Member No.'||lpad(new.founding_no::text,2,'0')||'. '
              else ' just joined the network. ' end
      || 'Say hi and help them get started.',
    case when coalesce(new.profile_slug,'')<>'' then 'https://pegasuscapitalnetwork.com/u/'||new.profile_slug else null end
  );
  return new;
end $function$;

create or replace function public.my_founding_number()
returns int language sql security definer set search_path = public as $$
  select founding_no from public.profiles where id = auth.uid();
$$;
grant execute on function public.my_founding_number() to authenticated;

create or replace function public.founding_members_count()
returns int language sql security definer set search_path = public as $$
  select count(*)::int from public.profiles where founding_no is not null;
$$;
grant execute on function public.founding_members_count() to anon, authenticated;
