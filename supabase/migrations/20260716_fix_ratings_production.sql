-- =============================================================================
-- PRODUCTION FIX: ratings + books save failures (RLS / grants / romance)
-- Paste this entire script into Supabase Dashboard → SQL Editor → Run.
-- Safe to re-run.
-- =============================================================================
-- Prefer the combined script if profiles is also missing:
--   20260716_fix_production_combined.sql
--
-- App note: The Next.js server verifies the user JWT, then writes via the
-- Supabase service role (SUPABASE_SERVICE_ROLE_KEY), which bypasses RLS.
-- Keep policies below as defense-in-depth for direct client access.
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
-- 0. Ensure profiles exists (ratings.rated_by → profiles.id FK)
--    Prior failure: ERROR 42P01 relation "public.profiles" does not exist
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

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists avatar_key text;
alter table public.profiles add column if not exists is_subscriber boolean not null default false;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

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
-- 1. Ensure books exists (ratings.book_id → books.id)
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

-- -----------------------------------------------------------------------------
-- 2. Ensure ratings exists, then romance column
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

-- -----------------------------------------------------------------------------
-- 3. One rating per user per book (required for upsert onConflict)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 4. RLS: books
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
-- 6. Grants
-- -----------------------------------------------------------------------------
grant select, insert, update on table public.books to authenticated;
grant select on table public.books to anon;

grant select, insert, update, delete on table public.ratings to authenticated;
grant select on table public.ratings to anon;

grant select, insert, update on table public.profiles to authenticated;
grant select on table public.profiles to anon;

-- After running: reload a book page, sign in, submit a rating again.
-- For prefs + ratings together, prefer 20260716_fix_production_combined.sql once.
