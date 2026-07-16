-- Migration: fantasy avatar key on profiles (filename keys used by Navbar / Profile)
-- Safe to re-run: uses IF NOT EXISTS / DROP IF EXISTS patterns where applicable.
--
-- Apply via Supabase Dashboard (no CLI required):
--   1. Open https://supabase.com/dashboard → your project
--   2. SQL Editor → New query
--   3. Paste this entire file → Run
--   4. Wait a few seconds for the API schema cache to refresh, then reload the app
--
-- avatar_key stores the image filename under public/avatars/ (e.g. 'dragon.jpg').
-- If you already applied an older version that constrained symbolic keys
-- ('dragons', 'elves', …), re-run from the constraint section below — or paste
-- supabase/migrations/20260715_profiles_avatar_filenames.sql — to DROP/ADD
-- the check and migrate existing rows to filenames.

-- -----------------------------------------------------------------------------
-- 1. Column + default + backfill
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists avatar_key text default 'dragon.jpg';

alter table public.profiles
  alter column avatar_key set default 'dragon.jpg';

update public.profiles
set avatar_key = 'dragon.jpg'
where avatar_key is null;

-- Migrate legacy symbolic / plural / singular keys → on-disk picker filenames.
-- Prefer 20260715_profiles_avatar_clans.sql if you only need the constraint bump.
-- Gendered / phoenix / griffin keys are kept as-is (they are selectable crests).
update public.profiles set avatar_key = 'elf_male.jpg'       where avatar_key in ('elves', 'elves.jpg', 'elf.jpg');
update public.profiles set avatar_key = 'orc_male.jpg'       where avatar_key in ('orcs', 'orcs.jpg', 'orc.jpg');
update public.profiles set avatar_key = 'oni_male.jpg'       where avatar_key in ('oni', 'oni.jpg');
update public.profiles set avatar_key = 'wolf.jpg'           where avatar_key in ('wolves', 'wolves.jpg');
update public.profiles set avatar_key = 'dragon.jpg'         where avatar_key = 'dragons';
update public.profiles set avatar_key = 'fairy_male.jpg'     where avatar_key in ('fairies', 'fairies.jpg', 'fairy.jpg');
update public.profiles set avatar_key = 'castle.jpg'         where avatar_key in ('castles', 'castles.jpg');
update public.profiles set avatar_key = 'grave.jpg'          where avatar_key in ('graves', 'graves.jpg');
update public.profiles set avatar_key = 'skull.jpg'          where avatar_key in ('skulls', 'skulls.jpg');
update public.profiles set avatar_key = 'phoenix.jpg'        where avatar_key = 'phoenix';
update public.profiles set avatar_key = 'griffin.jpg'        where avatar_key = 'griffin';
update public.profiles set avatar_key = 'barbarian_male.jpg' where avatar_key in ('barbarian', 'barbarian.jpg');
-- Constrain to full clan picker (gendered + mythic + Realm).
-- Prefer supabase/migrations/20260715_profiles_avatar_clans.sql for the
-- latest DROP/ADD + remaps.
alter table public.profiles
  drop constraint if exists profiles_avatar_key_check;

alter table public.profiles
  add constraint profiles_avatar_key_check
  check (
    avatar_key is null
    or avatar_key in (
      'oni_male.jpg',
      'oni_female.jpg',
      'skull.jpg',
      'grave.jpg',
      'wolf.jpg',
      'orc_male.jpg',
      'orc_female.jpg',
      'elf_male.jpg',
      'elf_female.jpg',
      'fairy_male.jpg',
      'fairy_female.jpg',
      'dragon.jpg',
      'phoenix.jpg',
      'griffin.jpg',
      'castle.jpg',
      'barbarian_male.jpg',
      'barbarian_female.jpg',
      'emberblade.jpg',
      'jadewarden.jpg'
    )
  );

comment on column public.profiles.avatar_key is
  'Fantasy clan crest filename under public/avatars/ (e.g. phoenix.jpg).';-- -----------------------------------------------------------------------------
-- 2. RLS: SELECT / INSERT / UPDATE own profile
-- Client-side upsert needs INSERT + UPDATE; AuthNav / Profile need SELECT.
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

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- -----------------------------------------------------------------------------
-- 3. Ensure signup trigger creates a profiles row (with avatar_key default)
-- Idempotent: replaces the function and recreates the trigger if missing.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url, avatar_key)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url',
    'dragon.jpg'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for any auth users that somehow lack a row
insert into public.profiles (id, display_name, avatar_url, avatar_key)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
  u.raw_user_meta_data ->> 'avatar_url',
  'dragon.jpg'
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
);
