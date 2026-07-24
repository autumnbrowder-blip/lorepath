-- Migration: feedback is authenticated-only (no anon inserts)
-- Safe to re-run.
--
-- Apply via Supabase Dashboard → SQL Editor → paste this entire file → Run.

comment on table public.feedback is
  'In-app feedback submissions. Authenticated insert (user_id required); admin-only select.';

alter table public.feedback enable row level security;

-- Remove public / anon insert policy from the earlier migration
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

-- Keep admin-only reads
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

revoke insert on table public.feedback from anon;
grant insert on table public.feedback to authenticated;
grant select on table public.feedback to authenticated;
revoke update, delete on table public.feedback from anon, authenticated;
