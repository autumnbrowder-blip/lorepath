/**
 * Fantasy avatar crests — stored in `profiles.avatar_key` as the **filename**
 * (e.g. `"phoenix.jpg"`), not a symbolic slug.
 *
 * Clan picker set (flavor labels, no Male/Female wording):
 *   Mystic Clans   — Dragons, Amphipteres, Phoenix, Griffin
 *   Stoneborn Clan — Castles, Stone Golem, Gorgon, Grave Wardens, Skull Keepers
 *   Wild Clans     — Orcs (Ironfang, Bloodroot), Oni Mask (Emberhorn, Mistveil),
 *                    Wolves, Barbarians (Stonemaul, Redthorn), Druids
 *   Feywild Clan   — Elves (Ash: ashen skin/jet black hair; Mist: pale white
 *                    skin/white hair/silver robes), Moon Elves (Starlit, Nightgold),
 *                    Fairies (Flower Court, Twilight Court), Pixies, Dryads
 *   Human Clans    — Sunward Paladins, Iron Paladins, Swordmasters (Steelwind, Nightblade),
 *                    Archers (Goldspire, Silverveil)
 *
 * Legacy crests (emberblade, jadewarden) remain valid for existing users but are
 * hidden from the picker.
 *
 * Portrait JPGs under `public/avatars/` use full-bleed character art (no baked
 * ornate picture frames). UI gold rims come from AvatarCrest CSS only.
 * UI always prefers the image at `src`; emoji is only an onError fallback.
 */

export const AVATAR_PUBLIC_DIR = "/avatars";

export const AVATAR_CLANS = [
  "Mystic Clans",
  "Stoneborn Clan",
  "Wild Clans",
  "Feywild Clan",
  "Human Clans",
] as const;

export type AvatarClan = (typeof AVATAR_CLANS)[number];

/** Keys offered in the profile AvatarPicker (clan-organized). */
export const PICKER_AVATAR_KEYS = [
  "dragon.jpg",
  "amphiptere.jpg",
  "phoenix.jpg",
  "griffin.jpg",
  "castle.jpg",
  "stone_golem.jpg",
  "gorgon.jpg",
  "grave.jpg",
  "skull.jpg",
  "orc_male.jpg",
  "orc_female.jpg",
  "oni_male.jpg",
  "oni_female.jpg",
  "wolf.jpg",
  "barbarian_male.jpg",
  "barbarian_female.jpg",
  "druid.jpg",
  "elf_male.jpg",
  "elf_female.jpg",
  "moon_elf_male.jpg",
  "moon_elf_female.jpg",
  "fairy_male.jpg",
  "fairy_female.jpg",
  "pixie.jpg",
  "dryad.jpg",
  "sunward_paladin_male.jpg",
  "sunward_paladin_female.jpg",
  "iron_paladin_male.jpg",
  "iron_paladin_female.jpg",
  "swordmaster_male.jpg",
  "swordmaster_female.jpg",
  "archer_male.jpg",
  "archer_female.jpg",
] as const;

/** Legacy keys kept for existing profiles — not shown in the picker. */
export const LEGACY_ONLY_AVATAR_KEYS = [
  "emberblade.jpg",
  "jadewarden.jpg",
] as const;

export const AVATAR_KEYS = [
  ...PICKER_AVATAR_KEYS,
  ...LEGACY_ONLY_AVATAR_KEYS,
] as const;

export type AvatarKey = (typeof AVATAR_KEYS)[number];
export type PickerAvatarKey = (typeof PICKER_AVATAR_KEYS)[number];

export const DEFAULT_AVATAR_KEY: AvatarKey = "dragon.jpg";

type AvatarOption = {
  key: AvatarKey;
  label: string;
  clan: AvatarClan | "Legacy";
  emoji: string;
  /** Filename stored in `profiles.avatar_key` (same as `key`). */
  filename: AvatarKey;
  /** Browser path under `public/avatars/`. */
  src: string;
  /** When true, option is valid but omitted from the profile picker grid. */
  hidden?: boolean;
};

/**
 * Legacy symbolic keys and older singular humanoid filenames → on-disk keys.
 */
const LEGACY_AVATAR_KEY_MAP: Record<string, AvatarKey> = {
  // Symbolic slugs
  elves: "elf_male.jpg",
  orcs: "orc_male.jpg",
  oni: "oni_male.jpg",
  wolves: "wolf.jpg",
  dragons: "dragon.jpg",
  fairies: "fairy_male.jpg",
  castles: "castle.jpg",
  graves: "grave.jpg",
  skulls: "skull.jpg",
  phoenix: "phoenix.jpg",
  griffin: "griffin.jpg",
  barbarian: "barbarian_male.jpg",
  barbarians: "barbarian_male.jpg",
  druids: "druid.jpg",
  druid: "druid.jpg",
  pixies: "pixie.jpg",
  pixie: "pixie.jpg",
  dryads: "dryad.jpg",
  dryad: "dryad.jpg",
  amphipteres: "amphiptere.jpg",
  amphiptere: "amphiptere.jpg",
  gorgon: "gorgon.jpg",
  cockatrice: "gorgon.jpg",
  "stone golem": "stone_golem.jpg",
  stone_golem: "stone_golem.jpg",
  paladin: "sunward_paladin_male.jpg",
  paladins: "sunward_paladin_male.jpg",
  sunward_paladin: "sunward_paladin_male.jpg",
  iron_paladin: "iron_paladin_male.jpg",
  swordmaster: "swordmaster_male.jpg",
  swordmasters: "swordmaster_male.jpg",
  archer: "archer_male.jpg",
  archers: "archer_male.jpg",
  moon_elf: "moon_elf_male.jpg",
  moon_elves: "moon_elf_male.jpg",
  "moon elf": "moon_elf_male.jpg",
  // Plural / singular filenames without on-disk crests
  "elves.jpg": "elf_male.jpg",
  "orcs.jpg": "orc_male.jpg",
  "wolves.jpg": "wolf.jpg",
  "fairies.jpg": "fairy_male.jpg",
  "castles.jpg": "castle.jpg",
  "graves.jpg": "grave.jpg",
  "skulls.jpg": "skull.jpg",
  "elf.jpg": "elf_male.jpg",
  "orc.jpg": "orc_male.jpg",
  "oni.jpg": "oni_male.jpg",
  "fairy.jpg": "fairy_male.jpg",
  "barbarian.jpg": "barbarian_male.jpg",
  "barbarians.jpg": "barbarian_male.jpg",
  "druid.jpg": "druid.jpg",
  "pixies.jpg": "pixie.jpg",
  "dryads.jpg": "dryad.jpg",
  "amphipteres.jpg": "amphiptere.jpg",
  "cockatrice.jpg": "gorgon.jpg",
  "paladin_male.jpg": "sunward_paladin_male.jpg",
  "paladin_female.jpg": "iron_paladin_female.jpg",
};

function avatarSrc(filename: AvatarKey): string {
  return `${AVATAR_PUBLIC_DIR}/${filename}`;
}

/**
 * Clan-organized picker options. `src` always points at an existing file
 * under `public/avatars/`.
 */
export const AVATAR_OPTIONS: ReadonlyArray<AvatarOption> = [
  // Mystic Clans
  {
    key: "dragon.jpg",
    label: "Dragons",
    clan: "Mystic Clans",
    emoji: "🐉",
    filename: "dragon.jpg",
    src: avatarSrc("dragon.jpg"),
  },
  {
    key: "amphiptere.jpg",
    label: "Amphipteres",
    clan: "Mystic Clans",
    emoji: "🐍",
    filename: "amphiptere.jpg",
    src: avatarSrc("amphiptere.jpg"),
  },
  {
    key: "phoenix.jpg",
    label: "Phoenix",
    clan: "Mystic Clans",
    emoji: "🔥",
    filename: "phoenix.jpg",
    src: avatarSrc("phoenix.jpg"),
  },
  {
    key: "griffin.jpg",
    label: "Griffin",
    clan: "Mystic Clans",
    emoji: "🦅",
    filename: "griffin.jpg",
    src: avatarSrc("griffin.jpg"),
  },
  // Stoneborn Clan
  {
    key: "castle.jpg",
    label: "Castles",
    clan: "Stoneborn Clan",
    emoji: "🏰",
    filename: "castle.jpg",
    src: avatarSrc("castle.jpg"),
  },
  {
    key: "stone_golem.jpg",
    label: "Stone Golem",
    clan: "Stoneborn Clan",
    emoji: "🗿",
    filename: "stone_golem.jpg",
    src: avatarSrc("stone_golem.jpg"),
  },
  {
    key: "gorgon.jpg",
    label: "Gorgon",
    clan: "Stoneborn Clan",
    emoji: "🐍",
    filename: "gorgon.jpg",
    src: avatarSrc("gorgon.jpg"),
  },
  {
    key: "grave.jpg",
    label: "Grave Wardens",
    clan: "Stoneborn Clan",
    emoji: "🪦",
    filename: "grave.jpg",
    src: avatarSrc("grave.jpg"),
  },
  {
    key: "skull.jpg",
    label: "Skull Keepers",
    clan: "Stoneborn Clan",
    emoji: "💀",
    filename: "skull.jpg",
    src: avatarSrc("skull.jpg"),
  },
  // Wild Clans
  {
    key: "orc_male.jpg",
    label: "Ironfang",
    clan: "Wild Clans",
    emoji: "👹",
    filename: "orc_male.jpg",
    src: avatarSrc("orc_male.jpg"),
  },
  {
    key: "orc_female.jpg",
    label: "Bloodroot",
    clan: "Wild Clans",
    emoji: "👹",
    filename: "orc_female.jpg",
    src: avatarSrc("orc_female.jpg"),
  },
  {
    key: "oni_male.jpg",
    label: "Emberhorn",
    clan: "Wild Clans",
    emoji: "👺",
    filename: "oni_male.jpg",
    src: avatarSrc("oni_male.jpg"),
  },
  {
    key: "oni_female.jpg",
    label: "Mistveil",
    clan: "Wild Clans",
    emoji: "👺",
    filename: "oni_female.jpg",
    src: avatarSrc("oni_female.jpg"),
  },
  {
    key: "wolf.jpg",
    label: "Wolves",
    clan: "Wild Clans",
    emoji: "🐺",
    filename: "wolf.jpg",
    src: avatarSrc("wolf.jpg"),
  },
  {
    key: "barbarian_male.jpg",
    label: "Stonemaul",
    clan: "Wild Clans",
    emoji: "🪓",
    filename: "barbarian_male.jpg",
    src: avatarSrc("barbarian_male.jpg"),
  },
  {
    key: "barbarian_female.jpg",
    label: "Redthorn",
    clan: "Wild Clans",
    emoji: "🪓",
    filename: "barbarian_female.jpg",
    src: avatarSrc("barbarian_female.jpg"),
  },
  {
    key: "druid.jpg",
    label: "Druids",
    clan: "Wild Clans",
    emoji: "🌿",
    filename: "druid.jpg",
    src: avatarSrc("druid.jpg"),
  },
  // Feywild Clan
  // Ash Elves: ashen skin, jet black hair
  {
    key: "elf_male.jpg",
    label: "Ash Elves",
    clan: "Feywild Clan",
    emoji: "🧝",
    filename: "elf_male.jpg",
    src: avatarSrc("elf_male.jpg"),
  },
  // Mist Elves: pale white skin, white hair, silver robes
  {
    key: "elf_female.jpg",
    label: "Mist Elves",
    clan: "Feywild Clan",
    emoji: "🧝‍♀️",
    filename: "elf_female.jpg",
    src: avatarSrc("elf_female.jpg"),
  },
  {
    key: "moon_elf_male.jpg",
    label: "Starlit Moon Elf",
    clan: "Feywild Clan",
    emoji: "✨",
    filename: "moon_elf_male.jpg",
    src: avatarSrc("moon_elf_male.jpg"),
  },
  {
    key: "moon_elf_female.jpg",
    label: "Nightgold Moon Elf",
    clan: "Feywild Clan",
    emoji: "✨",
    filename: "moon_elf_female.jpg",
    src: avatarSrc("moon_elf_female.jpg"),
  },
  {
    key: "fairy_male.jpg",
    label: "Flower Court",
    clan: "Feywild Clan",
    emoji: "🧚",
    filename: "fairy_male.jpg",
    src: avatarSrc("fairy_male.jpg"),
  },
  {
    key: "fairy_female.jpg",
    label: "Twilight Court",
    clan: "Feywild Clan",
    emoji: "🧚‍♀️",
    filename: "fairy_female.jpg",
    src: avatarSrc("fairy_female.jpg"),
  },
  {
    key: "pixie.jpg",
    label: "Pixies",
    clan: "Feywild Clan",
    emoji: "✨",
    filename: "pixie.jpg",
    src: avatarSrc("pixie.jpg"),
  },
  {
    key: "dryad.jpg",
    label: "Dryads",
    clan: "Feywild Clan",
    emoji: "🌳",
    filename: "dryad.jpg",
    src: avatarSrc("dryad.jpg"),
  },
  // Human Clans
  {
    key: "sunward_paladin_male.jpg",
    label: "Sunward Paladin",
    clan: "Human Clans",
    emoji: "☀️",
    filename: "sunward_paladin_male.jpg",
    src: avatarSrc("sunward_paladin_male.jpg"),
  },
  {
    key: "sunward_paladin_female.jpg",
    label: "Sunward Paladin",
    clan: "Human Clans",
    emoji: "☀️",
    filename: "sunward_paladin_female.jpg",
    src: avatarSrc("sunward_paladin_female.jpg"),
  },
  {
    key: "iron_paladin_male.jpg",
    label: "Iron Paladin",
    clan: "Human Clans",
    emoji: "🛡️",
    filename: "iron_paladin_male.jpg",
    src: avatarSrc("iron_paladin_male.jpg"),
  },
  {
    key: "iron_paladin_female.jpg",
    label: "Iron Paladin",
    clan: "Human Clans",
    emoji: "🛡️",
    filename: "iron_paladin_female.jpg",
    src: avatarSrc("iron_paladin_female.jpg"),
  },
  {
    key: "swordmaster_male.jpg",
    label: "Steelwind Swordmaster",
    clan: "Human Clans",
    emoji: "⚔️",
    filename: "swordmaster_male.jpg",
    src: avatarSrc("swordmaster_male.jpg"),
  },
  {
    key: "swordmaster_female.jpg",
    label: "Nightblade Swordmaster",
    clan: "Human Clans",
    emoji: "⚔️",
    filename: "swordmaster_female.jpg",
    src: avatarSrc("swordmaster_female.jpg"),
  },
  {
    key: "archer_male.jpg",
    label: "Goldspire Archer",
    clan: "Human Clans",
    emoji: "🏹",
    filename: "archer_male.jpg",
    src: avatarSrc("archer_male.jpg"),
  },
  {
    key: "archer_female.jpg",
    label: "Silverveil Archer",
    clan: "Human Clans",
    emoji: "🏹",
    filename: "archer_female.jpg",
    src: avatarSrc("archer_female.jpg"),
  },
];

/** Valid crests for existing users — omitted from the picker grid. */
export const LEGACY_AVATAR_OPTIONS: ReadonlyArray<AvatarOption> = [
  {
    key: "emberblade.jpg",
    label: "Emberblade",
    clan: "Legacy",
    emoji: "🗡️",
    filename: "emberblade.jpg",
    src: avatarSrc("emberblade.jpg"),
    hidden: true,
  },
  {
    key: "jadewarden.jpg",
    label: "Jadewarden",
    clan: "Legacy",
    emoji: "🏯",
    filename: "jadewarden.jpg",
    src: avatarSrc("jadewarden.jpg"),
    hidden: true,
  },
];

const ALL_AVATAR_OPTIONS: ReadonlyArray<AvatarOption> = [
  ...AVATAR_OPTIONS,
  ...LEGACY_AVATAR_OPTIONS,
];

const AVATAR_BY_KEY: Record<string, AvatarOption> = Object.fromEntries(
  ALL_AVATAR_OPTIONS.map((option) => [option.key, option])
);

/** All keys the DB constraint should accept (picker + legacy). */
export const AVATAR_KEYS_ALLOWED = [...AVATAR_KEYS] as const;

export function isAvatarKey(value: unknown): value is AvatarKey {
  return (
    typeof value === "string" &&
    (AVATAR_KEYS as readonly string[]).includes(value)
  );
}

export function isPickerAvatarKey(value: unknown): value is PickerAvatarKey {
  return (
    typeof value === "string" &&
    (PICKER_AVATAR_KEYS as readonly string[]).includes(value)
  );
}

export function resolveAvatarKey(
  value: string | null | undefined
): AvatarKey {
  if (isAvatarKey(value)) return value;

  if (typeof value === "string" && value in LEGACY_AVATAR_KEY_MAP) {
    return LEGACY_AVATAR_KEY_MAP[value];
  }

  return DEFAULT_AVATAR_KEY;
}

export function getAvatarOption(key: string | null | undefined) {
  if (typeof key === "string" && key in AVATAR_BY_KEY) {
    return AVATAR_BY_KEY[key];
  }

  return AVATAR_BY_KEY[resolveAvatarKey(key)];
}

export function getAvatarSrc(key: string | null | undefined): string {
  return getAvatarOption(key).src;
}

/** Picker options grouped by clan (stable clan order). */
export function getAvatarsGroupedByClan(): ReadonlyArray<{
  clan: AvatarClan;
  options: ReadonlyArray<AvatarOption>;
}> {
  return AVATAR_CLANS.map((clan) => ({
    clan,
    options: AVATAR_OPTIONS.filter((option) => option.clan === clan),
  }));
}

export function resolveDisplayName(
  profileName: string | null | undefined,
  metadata: Record<string, unknown> | undefined,
  email?: string | null
): string {
  if (profileName?.trim()) return profileName.trim();

  const fromMeta =
    (typeof metadata?.display_name === "string" && metadata.display_name) ||
    (typeof metadata?.full_name === "string" && metadata.full_name) ||
    (typeof metadata?.name === "string" && metadata.name) ||
    null;

  if (fromMeta?.trim()) return fromMeta.trim();
  if (email?.trim()) return email.trim();
  return "Traveler";
}

/** Fired after a profile field (display name / avatar) is saved so AuthNav can refresh. */
export const PROFILE_UPDATED_EVENT = "lorepath:profile-updated";
