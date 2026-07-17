-- =============================================================================
-- PRODUCTION FIX: user_preferences save failures (RLS / grants / romance / FK)
-- Paste this entire script into Supabase Dashboard → SQL Editor → Run.
-- Safe to re-run.
-- =============================================================================
-- Fixes:
--   1. Missing romance column (app may fall back, but column should exist)
--   2. Incomplete RLS (upsert needs SELECT + INSERT WITH CHECK + UPDATE
--      USING/WITH CHECK where user_id = auth.uid())
--   3. Missing table GRANTs to authenticated (surfaces as "permission denied"
--      and is often mistaken for RLS)
--   4. Unique(user_id) required for upsert onConflict: "user_id"
--   5. Missing profiles rows (user_preferences.user_id → profiles.id FK)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Romance column (noop if already present)
-- -----------------------------------------------------------------------------
alter table public.user_preferences
  add column if not exists romance smallint not null default 5;

alter table public.user_preferences
  drop constraint if exists user_preferences_romance_range;

alter table public.user_preferences
  add constraint user_preferences_romance_range check (romance between 0 and 5);

-- -----------------------------------------------------------------------------
-- 2. Unique user_id (required for upsert onConflict)
-- -----------------------------------------------------------------------------
alter table public.user_preferences
  drop constraint if exists user_preferences_user_unique;

alter table public.user_preferences
  add constraint user_preferences_user_unique unique (user_id);

-- -----------------------------------------------------------------------------
-- 3. Backfill profiles for any auth users missing a row (FK safety)
-- -----------------------------------------------------------------------------
insert into public.profiles (id, display_name, avatar_url, avatar_key)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
  u.raw_user_meta_data ->> 'avatar_url',
  'dragon.jpg'
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 4. RLS policies
-- -----------------------------------------------------------------------------
alter table public.user_preferences enable row level security;

drop policy if exists "Users can view own preferences" on public.user_preferences;
create policy "Users can view own preferences"
  on public.user_preferences for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own preferences" on public.user_preferences;
create policy "Users can insert own preferences"
  on public.user_preferences for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own preferences" on public.user_preferences;
create policy "Users can update own preferences"
  on public.user_preferences for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own preferences" on public.user_preferences;
create policy "Users can delete own preferences"
  on public.user_preferences for delete
  using (auth.uid() = user_id);

-- profiles (needed for ensureProfileExists + FK)
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
-- 5. Grants
-- -----------------------------------------------------------------------------
grant select, insert, update, delete on table public.user_preferences to authenticated;
grant select on table public.user_preferences to anon;

grant select, insert, update on table public.profiles to authenticated;
grant select on table public.profiles to anon;

-- -----------------------------------------------------------------------------
-- 6. Quick self-check (optional — SQL Editor runs as postgres, so auth.uid()
--    is null here; use the app after running).
-- -----------------------------------------------------------------------------
-- select polname, cmd, qual, with_check
-- from pg_policies
-- where tablename = 'user_preferences';
--
-- After running: reload /preferences and save again.
