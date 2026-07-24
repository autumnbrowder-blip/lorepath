-- =============================================================================
-- LorePath Database Schema
-- Run this entire script in Supabase Dashboard → SQL Editor
-- =============================================================================
-- Note: Supabase Auth manages users in auth.users — no separate users table.
-- profiles.id references auth.users(id) and is created on sign-up via trigger.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Helper: auto-update updated_at on row changes
-- -----------------------------------------------------------------------------
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
-- 1. profiles
-- Extends auth.users with app-specific fields and subscription status.
-- -----------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      text unique,
  display_name  text,
  avatar_url    text,
  avatar_key    text,
  is_subscriber boolean not null default false,
  is_admin      boolean not null default false,
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
      -- Mystic Clans
      'dragon.jpg',
      'amphiptere.jpg',
      'phoenix.jpg',
      'griffin.jpg',
      -- Stoneborn Clan
      'castle.jpg',
      'stone_golem.jpg',
      'gorgon.jpg',
      'grave.jpg',
      'skull.jpg',
      -- Wild Clans
      'orc_male.jpg',
      'orc_female.jpg',
      'oni_male.jpg',
      'oni_female.jpg',
      'wolf.jpg',
      'barbarian_male.jpg',
      'barbarian_female.jpg',
      'druid.jpg',
      -- Feywild Clan
      'elf_male.jpg',
      'elf_female.jpg',
      'moon_elf_male.jpg',
      'moon_elf_female.jpg',
      'fairy_male.jpg',
      'fairy_female.jpg',
      'pixie.jpg',
      'dryad.jpg',
      -- Human Clans
      'sunward_paladin_male.jpg',
      'sunward_paladin_female.jpg',
      'iron_paladin_male.jpg',
      'iron_paladin_female.jpg',
      'swordmaster_male.jpg',
      'swordmaster_female.jpg',
      'archer_male.jpg',
      'archer_female.jpg',
      -- Legacy Realm crests
      'emberblade.jpg',
      'jadewarden.jpg'
    )
  )
);

create index profiles_is_subscriber_idx on public.profiles (is_subscriber);
create index profiles_is_admin_idx on public.profiles (is_admin)
  where is_admin = true;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Block client self-promotion of is_admin (SQL editor / service_role may set it)
create or replace function public.protect_profiles_is_admin()
returns trigger
language plpgsql
as $$
declare
  jwt_role text := coalesce(auth.jwt() ->> 'role', '');
begin
  if tg_op = 'INSERT' then
    if new.is_admin = true
       and auth.uid() is not null
       and jwt_role <> 'service_role' then
      new.is_admin := false;
    end if;
    return new;
  end if;

  if new.is_admin is distinct from old.is_admin then
    if auth.uid() is not null and jwt_role <> 'service_role' then
      new.is_admin := old.is_admin;
    end if;
  end if;

  return new;
end;
$$;

create trigger profiles_protect_is_admin
  before insert or update on public.profiles
  for each row execute function public.protect_profiles_is_admin();

-- Auto-create a profile when a new auth user signs up
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 2. books
-- -----------------------------------------------------------------------------
create table public.books (
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

create index books_title_idx on public.books using gin (to_tsvector('english', title));
create index books_author_idx on public.books (author);
create index books_genre_idx on public.books (genre);
create index books_published_year_idx on public.books (published_year);

create trigger books_set_updated_at
  before update on public.books
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. ratings
-- Content ratings per book on a 0–5 scale (0 = none, 5 = very high).
-- One rating row per user per book.
-- -----------------------------------------------------------------------------
create table public.ratings (
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

create index ratings_book_id_idx on public.ratings (book_id);
create index ratings_sexual_content_idx on public.ratings (sexual_content);
create index ratings_horror_idx on public.ratings (horror);

create trigger ratings_set_updated_at
  before update on public.ratings
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 4. user_preferences
-- Active content tolerance thresholds for each user (max acceptable level 0–5).
-- -----------------------------------------------------------------------------
create table public.user_preferences (
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

create index user_preferences_user_id_idx on public.user_preferences (user_id);

create trigger user_preferences_set_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 5. saved_preference_profiles (multi-profile; gated in RLS for later rollout)
-- Named, reusable preference presets.
-- -----------------------------------------------------------------------------
create table public.saved_preference_profiles (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  name             text not null,
  sexual_content   smallint not null default 5,
  romance          smallint not null default 5,
  lgbt             smallint not null default 5,
  horror           smallint not null default 5,
  ideology         smallint not null default 5,
  pacing           smallint not null default 5,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint saved_preference_profiles_user_name_unique unique (user_id, name),
  constraint saved_preference_profiles_name_length check (char_length(name) between 1 and 50),
  constraint saved_preference_profiles_sexual_content_range check (sexual_content between 0 and 5),
  constraint saved_preference_profiles_romance_range check (romance between 0 and 5),
  constraint saved_preference_profiles_lgbt_range check (lgbt between 0 and 5),
  constraint saved_preference_profiles_horror_range check (horror between 0 and 5),
  constraint saved_preference_profiles_ideology_range check (ideology between 0 and 5),
  constraint saved_preference_profiles_pacing_range check (pacing between 0 and 5)
);

create index saved_preference_profiles_user_id_idx on public.saved_preference_profiles (user_id);

create trigger saved_preference_profiles_set_updated_at
  before update on public.saved_preference_profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 6. wishlists (gated in RLS for later rollout)
-- -----------------------------------------------------------------------------
create table public.wishlists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  book_id    uuid not null references public.books (id) on delete cascade,
  notes      text,
  created_at timestamptz not null default now(),

  constraint wishlists_user_book_unique unique (user_id, book_id)
);

create index wishlists_user_id_idx on public.wishlists (user_id);
create index wishlists_book_id_idx on public.wishlists (book_id);
create index wishlists_user_created_idx on public.wishlists (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 7. feedback (in-app Send Feedback)
-- -----------------------------------------------------------------------------
create table public.feedback (
  id         uuid primary key default gen_random_uuid(),
  page_path  text not null default '/',
  message    text not null,
  email      text,
  user_id    uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint feedback_message_length check (
    char_length(trim(message)) between 1 and 2000
  ),
  constraint feedback_page_path_length check (
    char_length(page_path) between 1 and 500
  ),
  constraint feedback_email_length check (
    email is null or char_length(email) between 3 and 254
  )
);

create index feedback_created_at_idx on public.feedback (created_at desc);
create index feedback_user_id_idx on public.feedback (user_id)
  where user_id is not null;

-- -----------------------------------------------------------------------------
-- Row Level Security (RLS)
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.books enable row level security;
alter table public.ratings enable row level security;
alter table public.user_preferences enable row level security;
alter table public.saved_preference_profiles enable row level security;
alter table public.wishlists enable row level security;
alter table public.feedback enable row level security;

-- profiles: users can read all, insert/update own
create policy "Profiles are viewable by everyone"
  on public.profiles for select
  using (true);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- books & ratings: public read
create policy "Books are viewable by everyone"
  on public.books for select
  using (true);

create policy "Ratings are viewable by everyone"
  on public.ratings for select
  using (true);

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
  using (auth.uid() = rated_by)
  with check (auth.uid() = rated_by);

-- user_preferences: users manage own
create policy "Users can view own preferences"
  on public.user_preferences for select
  using (auth.uid() = user_id);

create policy "Users can insert own preferences"
  on public.user_preferences for insert
  with check (auth.uid() = user_id);

create policy "Users can update own preferences"
  on public.user_preferences for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own preferences"
  on public.user_preferences for delete
  using (auth.uid() = user_id);

-- Table privileges for PostgREST roles (RLS still constrains rows).
grant select, insert, update on table public.profiles to authenticated;
grant select on table public.profiles to anon;

grant select, insert, update on table public.books to authenticated;
grant select on table public.books to anon;

grant select, insert, update, delete on table public.ratings to authenticated;
grant select on table public.ratings to anon;

grant select, insert, update, delete on table public.user_preferences to authenticated;
grant select on table public.user_preferences to anon;

-- saved_preference_profiles: reserved flag (is_subscriber) for later rollout
create policy "Subscribers can view own saved profiles"
  on public.saved_preference_profiles for select
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and is_subscriber = true
    )
  );

create policy "Subscribers can insert own saved profiles"
  on public.saved_preference_profiles for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and is_subscriber = true
    )
  );

create policy "Subscribers can update own saved profiles"
  on public.saved_preference_profiles for update
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and is_subscriber = true
    )
  );

create policy "Subscribers can delete own saved profiles"
  on public.saved_preference_profiles for delete
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and is_subscriber = true
    )
  );

-- wishlists: reserved flag (is_subscriber) for later rollout
create policy "Subscribers can view own wishlist"
  on public.wishlists for select
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and is_subscriber = true
    )
  );

create policy "Subscribers can insert into own wishlist"
  on public.wishlists for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and is_subscriber = true
    )
  );

create policy "Subscribers can update own wishlist"
  on public.wishlists for update
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and is_subscriber = true
    )
  );

create policy "Subscribers can delete from own wishlist"
  on public.wishlists for delete
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and is_subscriber = true
    )
  );

-- feedback: anyone may insert; only admins may select; no public update/delete
create policy "Anyone can submit feedback"
  on public.feedback
  for insert
  to anon, authenticated
  with check (
    char_length(trim(message)) >= 1
    and (user_id is null or user_id = auth.uid())
  );

create policy "Admins can read feedback"
  on public.feedback
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_admin = true
    )
  );

grant insert on table public.feedback to anon, authenticated;
grant select on table public.feedback to authenticated;
