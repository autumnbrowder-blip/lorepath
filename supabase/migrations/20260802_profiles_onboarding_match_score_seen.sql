-- Migration: persist first Match Score seen for onboarding checklist
-- Safe to re-run.
--
-- Apply via Supabase Dashboard → SQL Editor → paste this entire file → Run.

alter table public.profiles
  add column if not exists onboarding_match_score_seen boolean not null default false;

comment on column public.profiles.onboarding_match_score_seen is
  'True after the reader has been shown a Match Score % (first-rating celebrate or equivalent). Used to hide the onboarding path checklist.';
