-- Hardening: user_preferences RLS + grants for authenticated upserts.
-- OPTIONAL / SKIP if you already ran:
--   20260716_fix_user_preferences_production.sql
--   OR 20260716_fix_production_combined.sql
-- Safe to re-run. Only needed if prefs still return RLS errors after those.
--
-- NOTE (app architecture): The Next.js server verifies the user JWT, then
-- writes via the Supabase service role (SUPABASE_SERVICE_ROLE_KEY), which
-- bypasses RLS. Keep these policies as defense-in-depth for direct
-- browser/anon PostgREST access; server preference/rating writes do not
-- depend on auth.uid() matching for INSERT/UPDATE.
--
-- Upsert (INSERT ... ON CONFLICT DO UPDATE) needs:
--   SELECT + INSERT (WITH CHECK) + UPDATE (USING + WITH CHECK)
-- plus table GRANTs to the authenticated role (same pattern as profiles).

alter table public.user_preferences enable row level security;

-- -----------------------------------------------------------------------------
-- Policies
-- -----------------------------------------------------------------------------
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
-- Grants (Supabase default roles) — missing grants surface as permission denied
-- and the app maps that to the RLS error message.
-- -----------------------------------------------------------------------------
grant select, insert, update, delete on table public.user_preferences to authenticated;
grant select on table public.user_preferences to anon;
