-- Migration: ensure profiles.display_name can be updated by the owning user
-- Safe to re-run.
--
-- Apply via Supabase Dashboard → SQL Editor → paste this entire file → Run.
-- Then wait a few seconds for the schema/API cache and reload /profile.

-- -----------------------------------------------------------------------------
-- 1. Column exists (noop if already present)
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists display_name text;

comment on column public.profiles.display_name is
  'Public display name shown in Navbar and on Profile.';

-- -----------------------------------------------------------------------------
-- 2. RLS: SELECT / INSERT / UPDATE own profile
-- Client + server upsert need INSERT + UPDATE; Profile / AuthNav need SELECT.
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "Profiles are viewable by everyone" on public.profiles;
create policy "Profiles are viewable by everyone"
  on public.profiles for select
  using (true);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- UPDATE must include WITH CHECK so changing display_name is allowed.
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- -----------------------------------------------------------------------------
-- 3. Grants (Supabase default roles)
-- -----------------------------------------------------------------------------
grant select, insert, update on table public.profiles to authenticated;
grant select on table public.profiles to anon;
