-- 104 — Founding offer for claims: the first 50 company pages that get an owner
-- (claim verified instantly or approved by an admin) are Featured free for
-- 60 days in the business directory and search, where relevant (their own
-- section / category / state pages), labelled "Featured". Not in the Lender
-- Matcher, and HMDA rankings and awards are never affected.
-- House placements, existing placements, member-only pages and Pegasus's own
-- companies are left alone.

create or replace function public.peg_award_featured_perk(p_presence uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_end timestamptz; v_ok boolean;
begin
  if p_presence is null then return null; end if;
  select ends_at into v_end from public.presence_placements where presence_id = p_presence and note = 'founding_perk' limit 1;
  if found then return v_end; end if;
  select exists (
    select 1 from public.presences p
     where p.id = p_presence and p.presence_type = 'company' and coalesce(p.status, 'active') = 'active'
       and p.visibility = 'public_preview'
       and exists (select 1 from public.presence_members m where m.presence_id = p.id and m.role = 'owner')
       -- Pegasus's own companies (owned by an admin) do not use up spots.
       and not exists (select 1 from public.presence_members m join public.profiles a on a.id = m.user_id
                        where m.presence_id = p.id and m.role = 'owner' and coalesce(a.is_admin, false))
  ) and not exists (
    select 1 from public.presence_placements x where x.presence_id = p_presence and (x.ends_at is null or x.ends_at > now())
  ) into v_ok;
  if not v_ok then return null; end if;
  perform pg_advisory_xact_lock(hashtext('founding_featured_perk'));
  if (select count(*) from public.presence_placements where note = 'founding_perk') >= 50 then return null; end if;
  v_end := now() + interval '60 days';
  insert into public.presence_placements(presence_id, kind, weight, surfaces, starts_at, ends_at, note)
  values (p_presence, 'featured', 10, array['directory', 'search'], now(), v_end, 'founding_perk');
  return v_end;
end $$;
revoke all on function public.peg_award_featured_perk(uuid) from public, anon, authenticated;

create or replace function public.peg_featured_perk_on_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'owner' then perform public.peg_award_featured_perk(new.presence_id); end if;
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_zz_featured_perk_on_owner') then
    create trigger trg_zz_featured_perk_on_owner after insert or update of role on public.presence_members
      for each row execute function public.peg_featured_perk_on_owner();
  end if;
end $$;

-- Spots left (shown on the claim page and in outreach while the offer lasts).
create or replace function public.founding_perk_spots_left()
returns int language sql stable security definer set search_path = public as $$
  select greatest(0, 50 - (select count(*) from public.presence_placements where note = 'founding_perk'))::int;
$$;
grant execute on function public.founding_perk_spots_left() to anon, authenticated;

-- My page's perk (for the "you're Featured until …" line after a claim).
create or replace function public.my_featured_perk(p_slug text)
returns timestamptz language sql stable security definer set search_path = public as $$
  select pl.ends_at from public.presence_placements pl join public.presences p on p.id = pl.presence_id
   where p.slug = p_slug and pl.note = 'founding_perk' and pl.ends_at > now()
     and exists (select 1 from public.presence_members m where m.presence_id = p.id and m.user_id = auth.uid())
   limit 1;
$$;
grant execute on function public.my_featured_perk(text) to authenticated;

-- The public view tells the directory which placements are founding perks
-- (shown only where relevant, like sponsored ones, but labelled Featured).
create or replace view public.public_business_placements as
 select d.slug, d.name, d.category, d.cat_slug, d.cat_label, d.section_slug, d.location, d.state_code,
        d.tagline, d.short_description, d.hmda_rank, pl.kind, pl.weight, pl.surfaces, pl.states,
        (coalesce(pl.note, '') = 'founding_perk') as perk
   from public.presence_placements pl
   join public.public_business_directory d on d.id = pl.presence_id
  where pl.starts_at <= now() and (pl.ends_at is null or pl.ends_at > now());
grant select on public.public_business_placements to anon, authenticated;

-- Companies already claimed before this offer existed get it too.
select public.peg_award_featured_perk(m.presence_id)
  from (select distinct presence_id from public.presence_members where role = 'owner') m;
