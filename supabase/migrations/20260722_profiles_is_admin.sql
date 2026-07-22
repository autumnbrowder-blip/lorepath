-- Migration: profiles.is_admin for the hidden /admin area
-- Safe to re-run.
--
-- Apply via Supabase Dashboard → SQL Editor → paste this entire file → Run.
-- Promote an admin only from the SQL editor (or service_role), e.g.:
--   update public.profiles set is_admin = true where id = '<auth-user-uuid>';

-- -----------------------------------------------------------------------------
-- 1. Column
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

comment on column public.profiles.is_admin is
  'When true, the user may access the server-only /admin dashboard. Never set from the browser client.';

create index if not exists profiles_is_admin_idx
  on public.profiles (is_admin)
  where is_admin = true;

-- -----------------------------------------------------------------------------
-- 2. Block client self-promotion
-- Authenticated users can update their own profile (display_name, avatar, …)
-- but cannot flip is_admin. Direct SQL (no JWT) and service_role may change it.
-- -----------------------------------------------------------------------------
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

drop trigger if exists profiles_protect_is_admin on public.profiles;
create trigger profiles_protect_is_admin
  before insert or update on public.profiles
  for each row execute function public.protect_profiles_is_admin();
