-- =============================================================================
-- PRODUCTION FIX (COMBINED): profiles + prefs + ratings/books
-- Paste this ENTIRE script into Supabase Dashboard → SQL Editor → Run once.
-- Safe to re-run.
-- =============================================================================
-- Root cause of prior failure:
--   relation "public.profiles" does not exist
-- This script creates profiles (and books / ratings / user_preferences if
-- missing) BEFORE any backfill inserts or FK-dependent steps.
--
-- Skip 20260716_user_preferences_rls_hardening.sql — covered here.
-- =============================================================================

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- A. profiles (MUST exist first — prefs/ratings FK to it)
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      text unique,
  display_name  text,
  avatar_url    text,
  avatar_key    text,
  is_subscriber boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint profiles_username_length check (
    username is null or char_length(username) between 3 and 30
  ),
  constraint profiles_username_format check (
    username is null or username ~ '^[a-zA-Z0-9_]+$'
  ),
  constraint profiles_avatar_key_check check (
    avatar_key is null
    or avatar_key in (
      'dragon.jpg',
      'amphiptere.jpg',
      'phoenix.jpg',
      'griffin.jpg',
      'castle.jpg',
      'stone_golem.jpg',
      'gorgon.jpg',
      'grave.jpg',
      'skull.jpg',
      'orc_male.jpg',
      'orc_female.jpg',
      'oni_male.jpg',
      'oni_female.jpg',
      'wolf.jpg',
      'barbarian_male.jpg',
      'barbarian_female.jpg',
      'druid.jpg',
      'elf_male.jpg',
      'elf_female.jpg',
      'moon_elf_male.jpg',
      'moon_elf_female.jpg',
      'fairy_male.jpg',
      'fairy_female.jpg',
      'pixie.jpg',
      'dryad.jpg',
      'sunward_paladin_male.jpg',
      'sunward_paladin_female.jpg',
      'iron_paladin_male.jpg',
      'iron_paladin_female.jpg',
      'swordmaster_male.jpg',
      'swordmaster_female.jpg',
      'archer_male.jpg',
      'archer_female.jpg',
      'emberblade.jpg',
      'jadewarden.jpg'
    )
  )
);

alter table public.profiles
  add column if not exists username text;
alter table public.profiles
  add column if not exists display_name text;
alter table public.profiles
  add column if not exists avatar_url text;
alter table public.profiles
  add column if not exists avatar_key text;
alter table public.profiles
  add column if not exists is_subscriber boolean not null default false;
alter table public.profiles
  add column if not exists created_at timestamptz not null default now();
alter table public.profiles
  add column if not exists updated_at timestamptz not null default now();

create index if not exists profiles_is_subscriber_idx on public.profiles (is_subscriber);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

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

grant select, insert, update on table public.profiles to authenticated;
grant select on table public.profiles to anon;

-- Backfill profiles for existing auth users
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
-- B. books (ratings FK book_id → books)
-- -----------------------------------------------------------------------------
create table if not exists public.books (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  author          text,
  isbn            text,
  slug            text not null,
  cover_image_url text,
  description     text,
  published_year  smallint,
  genre           text,
  page_count      integer,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint books_slug_unique unique (slug),
  constraint books_isbn_unique unique (isbn),
  constraint books_published_year_check check (
    published_year is null or published_year between 1000 and 2100
  ),
  constraint books_page_count_check check (
    page_count is null or page_count > 0
  )
);

drop trigger if exists books_set_updated_at on public.books;
create trigger books_set_updated_at
  before update on public.books
  for each row execute function public.set_updated_at();

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

grant select, insert, update on table public.books to authenticated;
grant select on table public.books to anon;

-- -----------------------------------------------------------------------------
-- C. ratings (FK: book_id → books, rated_by → profiles)
-- -----------------------------------------------------------------------------
create table if not exists public.ratings (
  id               uuid primary key default gen_random_uuid(),
  book_id          uuid not null references public.books (id) on delete cascade,
  sexual_content   smallint not null default 0,
  romance          smallint not null default 0,
  lgbt             smallint not null default 0,
  horror           smallint not null default 0,
  ideology         smallint not null default 0,
  pacing           smallint not null default 0,
  summary          text,
  rated_by         uuid not null references public.profiles (id) on delete cascade,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint ratings_user_book_unique unique (book_id, rated_by),
  constraint ratings_sexual_content_range check (sexual_content between 0 and 5),
  constraint ratings_romance_range check (romance between 0 and 5),
  constraint ratings_lgbt_range check (lgbt between 0 and 5),
  constraint ratings_horror_range check (horror between 0 and 5),
  constraint ratings_ideology_range check (ideology between 0 and 5),
  constraint ratings_pacing_range check (pacing between 0 and 5)
);

alter table public.ratings
  add column if not exists romance smallint not null default 0;

alter table public.ratings
  drop constraint if exists ratings_romance_range;

alter table public.ratings
  add constraint ratings_romance_range check (romance between 0 and 5);

alter table public.ratings
  drop constraint if exists ratings_book_unique;

alter table public.ratings
  drop constraint if exists ratings_user_book_unique;

delete from public.ratings
where rated_by is null;

delete from public.ratings r
using public.ratings newer
where r.rated_by is not null
  and newer.rated_by is not null
  and r.book_id = newer.book_id
  and r.rated_by = newer.rated_by
  and (
    r.updated_at < newer.updated_at
    or (r.updated_at = newer.updated_at and r.id < newer.id)
  );

alter table public.ratings
  alter column rated_by set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ratings_user_book_unique'
      and conrelid = 'public.ratings'::regclass
  ) then
    alter table public.ratings
      add constraint ratings_user_book_unique unique (book_id, rated_by);
  end if;
end $$;

drop trigger if exists ratings_set_updated_at on public.ratings;
create trigger ratings_set_updated_at
  before update on public.ratings
  for each row execute function public.set_updated_at();

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

grant select, insert, update, delete on table public.ratings to authenticated;
grant select on table public.ratings to anon;

-- -----------------------------------------------------------------------------
-- D. user_preferences (FK: user_id → profiles)
-- -----------------------------------------------------------------------------
create table if not exists public.user_preferences (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  sexual_content   smallint not null default 5,
  romance          smallint not null default 5,
  lgbt             smallint not null default 5,
  horror           smallint not null default 5,
  ideology         smallint not null default 5,
  pacing           smallint not null default 5,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint user_preferences_user_unique unique (user_id),
  constraint user_preferences_sexual_content_range check (sexual_content between 0 and 5),
  constraint user_preferences_romance_range check (romance between 0 and 5),
  constraint user_preferences_lgbt_range check (lgbt between 0 and 5),
  constraint user_preferences_horror_range check (horror between 0 and 5),
  constraint user_preferences_ideology_range check (ideology between 0 and 5),
  constraint user_preferences_pacing_range check (pacing between 0 and 5)
);

alter table public.user_preferences
  add column if not exists romance smallint not null default 5;

alter table public.user_preferences
  drop constraint if exists user_preferences_romance_range;

alter table public.user_preferences
  add constraint user_preferences_romance_range check (romance between 0 and 5);

alter table public.user_preferences
  drop constraint if exists user_preferences_user_unique;

delete from public.user_preferences p
using public.user_preferences newer
where p.user_id = newer.user_id
  and (
    p.updated_at < newer.updated_at
    or (p.updated_at = newer.updated_at and p.id < newer.id)
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_preferences_user_unique'
      and conrelid = 'public.user_preferences'::regclass
  ) then
    alter table public.user_preferences
      add constraint user_preferences_user_unique unique (user_id);
  end if;
end $$;

drop trigger if exists user_preferences_set_updated_at on public.user_preferences;
create trigger user_preferences_set_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

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

grant select, insert, update, delete on table public.user_preferences to authenticated;
grant select on table public.user_preferences to anon;

-- =============================================================================
-- Done. Reload the app, sign in, save preferences and submit a rating.
-- If anything still fails, paste the exact Supabase error text.
-- =============================================================================
