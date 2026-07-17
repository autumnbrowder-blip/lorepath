-- =============================================================================
-- RATINGS + BOOKS RLS / GRANTS (idempotent, defense-in-depth)
-- =============================================================================
-- Intended state for direct/client access (column is rated_by, NOT user_id):
--
-- ratings:
--   SELECT  — everyone (community averages use anon/authenticated SELECT of all rows)
--   INSERT  — auth.uid() = rated_by
--   UPDATE  — own rows only (USING + WITH CHECK)
--   DELETE  — own rows only
--   GRANT   — authenticated: SELECT, INSERT, UPDATE, DELETE; anon: SELECT
--
-- books (needed if ensureBookRecord runs as the user, not service_role):
--   SELECT  — everyone
--   INSERT  — authenticated
--   UPDATE  — authenticated
--   GRANT   — authenticated: SELECT, INSERT, UPDATE; anon: SELECT
--
-- App note: submitUserRating currently verifies JWT then writes via service_role
-- (bypasses RLS). These policies still matter for community reads, session-client
-- fallbacks, and defense-in-depth if writes move to the user-scoped client.
--
-- Gaps this closes vs older sources:
--   - schema.sql grants DELETE but had no DELETE policy
--   - 20260709_ratings_per_user.sql lacked DELETE and UPDATE WITH CHECK
-- Production fixes 20260716_fix_ratings_production.sql and
-- 20260716_fix_production_combined.sql already match this target.
-- =============================================================================

alter table public.books enable row level security;
alter table public.ratings enable row level security;

-- -----------------------------------------------------------------------------
-- books
-- -----------------------------------------------------------------------------
drop policy if exists "Books are viewable by everyone" on public.books;
create policy "Books are viewable by everyone"
  on public.books for select
  using (true);

drop policy if exists "Authenticated users can insert books" on public.books;
create policy "Authenticated users can insert books"
  on public.books for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can update books" on public.books;
create policy "Authenticated users can update books"
  on public.books for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- -----------------------------------------------------------------------------
-- ratings (rated_by)
-- -----------------------------------------------------------------------------
drop policy if exists "Ratings are viewable by everyone" on public.ratings;
create policy "Ratings are viewable by everyone"
  on public.ratings for select
  using (true);

drop policy if exists "Users can insert own ratings" on public.ratings;
create policy "Users can insert own ratings"
  on public.ratings for insert
  with check (auth.uid() = rated_by);

drop policy if exists "Users can update own ratings" on public.ratings;
create policy "Users can update own ratings"
  on public.ratings for update
  using (auth.uid() = rated_by)
  with check (auth.uid() = rated_by);

drop policy if exists "Users can delete own ratings" on public.ratings;
create policy "Users can delete own ratings"
  on public.ratings for delete
  using (auth.uid() = rated_by);

-- -----------------------------------------------------------------------------
-- grants
-- -----------------------------------------------------------------------------
grant select, insert, update on table public.books to authenticated;
grant select on table public.books to anon;

grant select, insert, update, delete on table public.ratings to authenticated;
grant select on table public.ratings to anon;
