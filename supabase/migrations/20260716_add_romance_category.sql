-- Migration: add romance (0–5) to ratings, preferences, and saved profiles.
-- Run this in the Supabase SQL Editor if your project already applied an older schema.
--
-- Without this column, preference SELECT/UPSERT that include `romance` fail.
-- The app falls back to a legacy column set, but Romance will not persist until
-- this migration is applied. Also run 20260716_user_preferences_rls_hardening.sql.

-- ratings
alter table public.ratings
  add column if not exists romance smallint not null default 0;

alter table public.ratings
  drop constraint if exists ratings_romance_range;

alter table public.ratings
  add constraint ratings_romance_range check (romance between 0 and 5);

-- user_preferences
alter table public.user_preferences
  add column if not exists romance smallint not null default 5;

alter table public.user_preferences
  drop constraint if exists user_preferences_romance_range;

alter table public.user_preferences
  add constraint user_preferences_romance_range check (romance between 0 and 5);

-- saved_preference_profiles
alter table public.saved_preference_profiles
  add column if not exists romance smallint not null default 5;

alter table public.saved_preference_profiles
  drop constraint if exists saved_preference_profiles_romance_range;

alter table public.saved_preference_profiles
  add constraint saved_preference_profiles_romance_range check (romance between 0 and 5);
