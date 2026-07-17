-- =============================================================================
-- PRODUCTION FIX: user_preferences save failures (RLS / grants / romance)
-- Paste this entire script into Supabase Dashboard → SQL Editor → Run.
-- Safe to re-run.
-- =============================================================================
-- Fixes:
--   1. Missing romance column (app may fall back, but column should exist)
--   2. Incomplete RLS (upsert needs SELECT + INSERT WITH CHECK + UPDATE
--      USING/WITH CHECK where user_id = auth.uid())
--   3. Missing table GRANTs to authenticated (surfaces as "permission denied"
--      and is often mistaken for RLS)
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
-- 2. RLS policies
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

-- -----------------------------------------------------------------------------
-- 3. Grants
-- -----------------------------------------------------------------------------
grant select, insert, update, delete on table public.user_preferences to authenticated;
grant select on table public.user_preferences to anon;

-- -----------------------------------------------------------------------------
-- 4. Quick self-check (optional — run as a signed-in user in the SQL editor
--    will show auth.uid() as null; use the Table Editor or the app instead).
--    After running, reload /preferences and save again.
-- -----------------------------------------------------------------------------
-- select polname, cmd, qual, with_check
-- from pg_policies
-- where tablename = 'user_preferences';
