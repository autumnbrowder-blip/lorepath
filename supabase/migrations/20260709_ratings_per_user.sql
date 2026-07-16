-- Migration: allow one rating per user per book (run in Supabase SQL Editor if you
-- already applied an older version of schema.sql with ratings_book_unique)

alter table public.ratings
  drop constraint if exists ratings_book_unique;

alter table public.ratings
  alter column rated_by set not null;

alter table public.ratings
  drop constraint if exists ratings_user_book_unique;

alter table public.ratings
  add constraint ratings_user_book_unique unique (book_id, rated_by);

-- RLS policies for rating submission
create policy "Authenticated users can insert books"
  on public.books for insert
  with check (auth.role() = 'authenticated');

create policy "Authenticated users can update books"
  on public.books for update
  using (auth.role() = 'authenticated');

create policy "Users can insert own ratings"
  on public.ratings for insert
  with check (auth.uid() = rated_by);

create policy "Users can update own ratings"
  on public.ratings for update
  using (auth.uid() = rated_by);
