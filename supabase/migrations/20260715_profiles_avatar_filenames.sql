-- Standalone DROP/ADD if an older avatar_key check blocks new filename saves.
-- Prefer 20260715_profiles_avatar_clans.sql for remaps + full picker constraint.
-- Safe to run even if you already re-ran 20260715_profiles_avatar_key.sql.
--
-- Paste into Supabase SQL Editor and Run, then wait for schema cache refresh.

alter table public.profiles
  alter column avatar_key set default 'dragon.jpg';

alter table public.profiles
  drop constraint if exists profiles_avatar_key_check;

alter table public.profiles
  add constraint profiles_avatar_key_check
  check (
    avatar_key is null
    or avatar_key in (
      'oni_male.jpg',
      'oni_female.jpg',
      'skull.jpg',
      'grave.jpg',
      'wolf.jpg',
      'orc_male.jpg',
      'orc_female.jpg',
      'elf_male.jpg',
      'elf_female.jpg',
      'fairy_male.jpg',
      'fairy_female.jpg',
      'dragon.jpg',
      'phoenix.jpg',
      'griffin.jpg',
      'castle.jpg',
      'barbarian_male.jpg',
      'barbarian_female.jpg',
      'emberblade.jpg',
      'jadewarden.jpg'
    )
  );

comment on column public.profiles.avatar_key is
  'Fantasy clan crest filename under public/avatars/ (e.g. phoenix.jpg).';
