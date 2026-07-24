-- Migration: public.feedback for in-app “Send Feedback”
-- Safe to re-run.
--
-- Apply via Supabase Dashboard → SQL Editor → paste this entire file → Run.

-- -----------------------------------------------------------------------------
-- 1. Table
-- -----------------------------------------------------------------------------
create table if not exists public.feedback (
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

create index if not exists feedback_created_at_idx
  on public.feedback (created_at desc);

create index if not exists feedback_user_id_idx
  on public.feedback (user_id)
  where user_id is not null;

comment on table public.feedback is
  'In-app feedback submissions. Authenticated insert (user_id required); admin-only select.';

-- -----------------------------------------------------------------------------
-- 2. RLS
-- -----------------------------------------------------------------------------
alter table public.feedback enable row level security;

-- Inserts from signed-in users only (must stamp own user_id)
drop policy if exists "Anyone can submit feedback" on public.feedback;
drop policy if exists "Authenticated users can submit feedback" on public.feedback;
create policy "Authenticated users can submit feedback"
  on public.feedback
  for insert
  to authenticated
  with check (
    char_length(trim(message)) >= 1
    and user_id = auth.uid()
  );

-- Only admins can read feedback (service_role bypasses RLS for server tools)
drop policy if exists "Admins can read feedback" on public.feedback;
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

-- No UPDATE / DELETE policies → public clients cannot mutate or erase rows.

-- -----------------------------------------------------------------------------
-- 3. Grants
-- -----------------------------------------------------------------------------
grant insert on table public.feedback to authenticated;
grant select on table public.feedback to authenticated;
-- Revoke broad defaults if present (safe if already restricted)
revoke insert on table public.feedback from anon;
revoke update, delete on table public.feedback from anon, authenticated;
