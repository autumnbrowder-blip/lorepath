-- =============================================================================
-- VERIFY: user_preferences RLS + grants (read-only checks)
-- Paste into Supabase Dashboard → SQL Editor → Run.
-- =============================================================================

-- 1) Policies on user_preferences (expect SELECT/INSERT/UPDATE/DELETE for own user_id)
select
  polname as policy_name,
  cmd as command,
  qual as using_expression,
  with_check as with_check_expression
from pg_policies
where schemaname = 'public'
  and tablename = 'user_preferences'
order by cmd, polname;

-- 2) Table privileges for authenticated (expect true for insert/update/select)
select
  has_table_privilege('authenticated', 'public.user_preferences', 'select') as can_select,
  has_table_privilege('authenticated', 'public.user_preferences', 'insert') as can_insert,
  has_table_privilege('authenticated', 'public.user_preferences', 'update') as can_update,
  has_table_privilege('authenticated', 'public.user_preferences', 'delete') as can_delete;

-- 3) RLS enabled?
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'user_preferences';

-- 4) Quick sanity: romance column exists
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'user_preferences'
  and column_name in ('user_id', 'romance', 'sexual_content')
order by column_name;

-- If insert privilege is false or policies are missing, re-run:
--   supabase/migrations/20260716_fix_user_preferences_production.sql
-- or the combined script:
--   supabase/migrations/20260716_fix_production_combined.sql
