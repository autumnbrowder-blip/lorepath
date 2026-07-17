-- =============================================================================
-- PRODUCTION FIX: ratings + books save failures (RLS / grants / romance)
-- Paste this entire script into Supabase Dashboard → SQL Editor → Run.
-- Safe to re-run.
-- =============================================================================
-- Fixes:
--   1. Missing romance column on ratings
--   2. Incomplete RLS on ratings (insert WITH CHECK + update USING/WITH CHECK
--      where rated_by = auth.uid()) and books (authenticated insert/update)
--   3. Missing table GRANTs to authenticated/anon (schema.sql only granted
--      user_preferences — ratings/books often lack grants and surface as RLS)
--   4. Unique (book_id, rated_by) required for upsert onConflict
--   5. Backfill missing profiles rows (ratings.rated_by → profiles.id FK)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Romance column on ratings (noop if already present)
-- -----------------------------------------------------------------------------
alter table public.ratings
  add column if not exists romance smallint not null default 0;

alter table public.ratings
  drop constraint if exists ratings_romance_range;

alter table public.ratings
  add constraint ratings_romance_range check (romance between 0 and 5);

-- -----------------------------------------------------------------------------
-- 2. One rating per user per book (required for upsert onConflict)
-- -----------------------------------------------------------------------------
alter table public.ratings
  drop constraint if exists ratings_book_unique;

alter table public.ratings
  alter column rated_by set not null;

alter table public.ratings
  drop constraint if exists ratings_user_book_unique;

alter table public.ratings
  add constraint ratings_user_book_unique unique (book_id, rated_by);

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
-- 4. RLS: books (needed before rating — ensureBookRecord upserts books)
-- -----------------------------------------------------------------------------
alter table public.books enable row level security;

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
-- 5. RLS: ratings (column is rated_by — NOT user_id)
-- -----------------------------------------------------------------------------
alter table public.ratings enable row level security;

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
-- 6. Grants (CRITICAL — missing grants look like RLS in the app)
-- -----------------------------------------------------------------------------
grant select, insert, update on table public.books to authenticated;
grant select on table public.books to anon;

grant select, insert, update, delete on table public.ratings to authenticated;
grant select on table public.ratings to anon;

grant select, insert, update on table public.profiles to authenticated;
grant select on table public.profiles to anon;

-- -----------------------------------------------------------------------------
-- 7. Quick self-check (optional)
-- -----------------------------------------------------------------------------
-- select polname, cmd, qual, with_check
-- from pg_policies
-- where tablename in ('ratings', 'books')
-- order by tablename, cmd;
--
-- After running: reload a book page, sign in, submit a rating again.
