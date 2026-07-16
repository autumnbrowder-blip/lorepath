-- Four-clan crest filenames: Mystic, Stoneborn, Wild, Feywild (+ legacy Realm crests).

-- Safe to re-run: DROP IF EXISTS then ADD constraint.

--

-- Paste into Supabase SQL Editor and Run, then wait a few seconds for schema cache refresh.

--

-- Picker keys (stored in avatar_key):

--   Mystic Clans:   dragon.jpg, amphiptere.jpg, phoenix.jpg, griffin.jpg

--   Stoneborn Clan: castle.jpg, stone_golem.jpg, gorgon.jpg, cockatrice.jpg,

--                   grave.jpg, skull.jpg

--   Wild Clans:     orc_male.jpg, orc_female.jpg, oni_male.jpg, oni_female.jpg,

--                   wolf.jpg, barbarian_male.jpg, barbarian_female.jpg, druid.jpg

--   Feywild Clan:   elf_male.jpg, elf_female.jpg, fairy_male.jpg, fairy_female.jpg,

--                   pixie.jpg, dryad.jpg

-- Legacy (hidden):  emberblade.jpg, jadewarden.jpg



alter table public.profiles

  alter column avatar_key set default 'dragon.jpg';



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

update public.profiles set avatar_key = 'griffin.jpg'       where avatar_key = 'griffin';

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

update public.profiles set avatar_key = 'cockatrice.jpg'     where avatar_key = 'cockatrice';

update public.profiles set avatar_key = 'stone_golem.jpg'    where avatar_key = 'stone_golem';



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

      'cockatrice.jpg',

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

      'fairy_male.jpg',

      'fairy_female.jpg',

      'pixie.jpg',

      'dryad.jpg',

      -- Legacy Realm crests

      'emberblade.jpg',

      'jadewarden.jpg'

    )

  );



comment on column public.profiles.avatar_key is

  'Fantasy clan crest filename (e.g. amphiptere.jpg, elf_female.jpg).';


