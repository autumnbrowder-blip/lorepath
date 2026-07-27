-- Migration: public.page_views — privacy-light visit tracking (path + timestamp only)
-- Safe to re-run.
--
-- Apply via Supabase Dashboard → SQL Editor → paste this entire file → Run.

-- -----------------------------------------------------------------------------
-- 1. Table
-- -----------------------------------------------------------------------------
create table if not exists public.page_views (
  id         uuid primary key default gen_random_uuid(),
  path       text not null,
  created_at timestamptz not null default now(),

  constraint page_views_path_length check (
    char_length(path) between 1 and 500
  )
);

create index if not exists page_views_created_at_idx
  on public.page_views (created_at desc);

create index if not exists page_views_path_idx
  on public.page_views (path);

comment on table public.page_views is
  'Anonymous page views. Stores only path + timestamp — no IP, user id, or personal data.';

-- -----------------------------------------------------------------------------
-- 2. Top-paths helper (called server-side with service role)
-- -----------------------------------------------------------------------------
create or replace function public.page_view_top_paths(limit_count int default 5)
returns table(path text, visits bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    pv.path,
    count(*)::bigint as visits
  from public.page_views pv
  group by pv.path
  order by visits desc, pv.path asc
  limit greatest(1, least(coalesce(limit_count, 5), 50));
$$;

revoke all on function public.page_view_top_paths(int) from public;
grant execute on function public.page_view_top_paths(int) to service_role;

-- -----------------------------------------------------------------------------
-- 3. RLS
-- -----------------------------------------------------------------------------
alter table public.page_views enable row level security;

-- Public insert is allowed so tracking can work with the anon key if needed.
-- The app prefers the service-role API route; this is a soft fallback.
drop policy if exists "Anyone can record a page view" on public.page_views;
create policy "Anyone can record a page view"
  on public.page_views
  for insert
  to anon, authenticated
  with check (
    char_length(path) between 1 and 500
    and path like '/%'
  );

-- Only admins may read raw rows from the client; admin dashboard uses service role.
drop policy if exists "Admins can read page views" on public.page_views;
create policy "Admins can read page views"
  on public.page_views
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

-- No UPDATE / DELETE policies → clients cannot mutate or erase rows.

-- -----------------------------------------------------------------------------
-- 4. Grants
-- -----------------------------------------------------------------------------
grant insert on table public.page_views to anon, authenticated;
grant select on table public.page_views to authenticated;
revoke update, delete on table public.page_views from anon, authenticated;
