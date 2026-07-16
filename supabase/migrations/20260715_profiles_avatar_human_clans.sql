-- Five-clan crest filenames: Mystic, Stoneborn, Wild, Feywild, Human (+ legacy Realm crests).
-- Removes cockatrice.jpg; remaps existing cockatrice users to gorgon.jpg.
-- Expands Human paladins to Sunward / Iron (male + female each).
-- Safe to re-run: DROP IF EXISTS then ADD constraint.
--
-- Paste into Supabase SQL Editor and Run, then wait a few seconds for schema cache refresh.
--
-- Picker keys (stored in avatar_key):
--   Mystic Clans:   dragon.jpg, amphiptere.jpg, phoenix.jpg, griffin.jpg
--   Stoneborn Clan: castle.jpg, stone_golem.jpg, gorgon.jpg, grave.jpg, skull.jpg
--   Wild Clans:     orc_male.jpg, orc_female.jpg, oni_male.jpg, oni_female.jpg,
--                   wolf.jpg, barbarian_male.jpg, barbarian_female.jpg, druid.jpg
--   Feywild Clan:   elf_male.jpg, elf_female.jpg, moon_elf_male.jpg, moon_elf_female.jpg,
--                   fairy_male.jpg, fairy_female.jpg, pixie.jpg, dryad.jpg
--   Human Clans:    sunward_paladin_male.jpg, sunward_paladin_female.jpg,
--                   iron_paladin_male.jpg, iron_paladin_female.jpg,
--                   swordmaster_male.jpg, swordmaster_female.jpg,
--                   archer_male.jpg, archer_female.jpg
-- Legacy (hidden):  emberblade.jpg, jadewarden.jpg

alter table public.profiles
  alter column avatar_key set default 'dragon.jpg';

-- Retire cockatrice crest (removed from picker)
update public.profiles set avatar_key = 'gorgon.jpg' where avatar_key = 'cockatrice';
update public.profiles set avatar_key = 'gorgon.jpg' where avatar_key = 'cockatrice.jpg';

-- Retire generic paladin keys → Sunward / Iron
update public.profiles set avatar_key = 'sunward_paladin_male.jpg' where avatar_key = 'paladin';
update public.profiles set avatar_key = 'sunward_paladin_male.jpg' where avatar_key = 'paladins';
update public.profiles set avatar_key = 'sunward_paladin_male.jpg' where avatar_key = 'paladin_male.jpg';
update public.profiles set avatar_key = 'iron_paladin_female.jpg' where avatar_key = 'paladin_female.jpg';

-- Symbolic → on-disk picker filenames
update public.profiles set avatar_key = 'elf_male.jpg'       where avatar_key = 'elves';
update public.profiles set avatar_key = 'orc_male.jpg'       where avatar_key = 'orcs';
update public.profiles set avatar_key = 'oni_male.jpg'       where avatar_key = 'oni';
update public.profiles set avatar_key = 'wolf.jpg'           where avatar_key = 'wolves';
update public.profiles set avatar_key = 'dragon.jpg'         where avatar_key = 'dragons';
update public.profiles set avatar_key = 'fairy_male.jpg'     where avatar_key = 'fairies';
update public.profiles set avatar_key = 'castle.jpg'         where avatar_key = 'castles';
update public.profiles set avatar_key = 'grave.jpg'          where avatar_key = 'graves';
update public.profiles set avatar_key = 'skull.jpg'          where avatar_key = 'skulls';
update public.profiles set avatar_key = 'phoenix.jpg'        where avatar_key = 'phoenix';
update public.profiles set avatar_key = 'griffin.jpg'        where avatar_key = 'griffin';
update public.profiles set avatar_key = 'barbarian_male.jpg' where avatar_key = 'barbarian';
update public.profiles set avatar_key = 'barbarian_male.jpg' where avatar_key = 'barbarians';
update public.profiles set avatar_key = 'druid.jpg'          where avatar_key = 'druid';
update public.profiles set avatar_key = 'druid.jpg'          where avatar_key = 'druids';
update public.profiles set avatar_key = 'pixie.jpg'          where avatar_key = 'pixie';
update public.profiles set avatar_key = 'pixie.jpg'          where avatar_key = 'pixies';
update public.profiles set avatar_key = 'dryad.jpg'          where avatar_key = 'dryad';
update public.profiles set avatar_key = 'dryad.jpg'          where avatar_key = 'dryads';
update public.profiles set avatar_key = 'amphiptere.jpg'     where avatar_key = 'amphiptere';
update public.profiles set avatar_key = 'amphiptere.jpg'     where avatar_key = 'amphipteres';
update public.profiles set avatar_key = 'gorgon.jpg'         where avatar_key = 'gorgon';
update public.profiles set avatar_key = 'stone_golem.jpg'    where avatar_key = 'stone_golem';
update public.profiles set avatar_key = 'swordmaster_male.jpg' where avatar_key = 'swordmaster';
update public.profiles set avatar_key = 'swordmaster_male.jpg' where avatar_key = 'swordmasters';
update public.profiles set avatar_key = 'archer_male.jpg'     where avatar_key = 'archer';
update public.profiles set avatar_key = 'archer_male.jpg'    where avatar_key = 'archers';
update public.profiles set avatar_key = 'moon_elf_male.jpg'  where avatar_key = 'moon_elf';
update public.profiles set avatar_key = 'moon_elf_male.jpg'  where avatar_key = 'moon_elves';
update public.profiles set avatar_key = 'moon_elf_male.jpg'  where avatar_key = 'moon elf';
update public.profiles set avatar_key = 'sunward_paladin_male.jpg' where avatar_key = 'sunward_paladin';
update public.profiles set avatar_key = 'iron_paladin_male.jpg'    where avatar_key = 'iron_paladin';

-- Plural filenames → singular crests / gendered defaults
update public.profiles set avatar_key = 'elf_male.jpg'       where avatar_key = 'elves.jpg';
update public.profiles set avatar_key = 'orc_male.jpg'       where avatar_key = 'orcs.jpg';
update public.profiles set avatar_key = 'wolf.jpg'           where avatar_key = 'wolves.jpg';
update public.profiles set avatar_key = 'fairy_male.jpg'     where avatar_key = 'fairies.jpg';
update public.profiles set avatar_key = 'castle.jpg'         where avatar_key = 'castles.jpg';
update public.profiles set avatar_key = 'grave.jpg'          where avatar_key = 'graves.jpg';
update public.profiles set avatar_key = 'skull.jpg'          where avatar_key = 'skulls.jpg';
update public.profiles set avatar_key = 'amphiptere.jpg'     where avatar_key = 'amphipteres.jpg';

-- Older singular humanoid keys (never on disk) → gendered crests
update public.profiles set avatar_key = 'elf_male.jpg'       where avatar_key = 'elf.jpg';
update public.profiles set avatar_key = 'orc_male.jpg'       where avatar_key = 'orc.jpg';
update public.profiles set avatar_key = 'oni_male.jpg'       where avatar_key = 'oni.jpg';
update public.profiles set avatar_key = 'fairy_male.jpg'     where avatar_key = 'fairy.jpg';
update public.profiles set avatar_key = 'barbarian_male.jpg' where avatar_key = 'barbarian.jpg';
update public.profiles set avatar_key = 'barbarian_male.jpg' where avatar_key = 'barbarians.jpg';

update public.profiles
set avatar_key = 'dragon.jpg'
where avatar_key is null;

alter table public.profiles
  drop constraint if exists profiles_avatar_key_check;

alter table public.profiles
  add constraint profiles_avatar_key_check
  check (
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
  );

comment on column public.profiles.avatar_key is
  'Fantasy clan crest filename (e.g. sunward_paladin_male.jpg, moon_elf_female.jpg).';
