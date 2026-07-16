import type { BookSource } from "@/types/book";

function dedupeTags(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.toLowerCase();
    if (!item || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Curated tags — specific sub-genres listed before their broad parents.
 * Prefer specific labels when source data supports them.
 */
export const CANONICAL_TAGS = [
  // Fantasy family (specific → broad)
  "Grimdark",
  "Dark Fantasy",
  "Epic Fantasy",
  "Romantic Fantasy",
  "Urban Fantasy",
  "Fantasy",
  // Science fiction family
  "Space Opera",
  "Cyberpunk",
  "Dystopian",
  "Science Fiction",
  // Thriller family
  "Psychological Thriller",
  "Thriller",
  // Other useful genres
  "Horror",
  "Romance",
  "Mystery",
  "Historical Fiction",
  "Adventure",
  "Young Adult",
  "Nonfiction",
  // Broad Fiction — never used as filler; only with clear literary framing
  "Fiction",
] as const;

export type CanonicalTag = (typeof CANONICAL_TAGS)[number];

const CANONICAL_SET = new Set<string>(CANONICAL_TAGS);

/** When a child is present, drop its broad parent(s). */
const PARENT_OF: Partial<Record<CanonicalTag, CanonicalTag[]>> = {
  Grimdark: ["Fantasy"],
  "Dark Fantasy": ["Fantasy"],
  "Epic Fantasy": ["Fantasy"],
  "Romantic Fantasy": ["Fantasy", "Romance"],
  "Urban Fantasy": ["Fantasy"],
  "Space Opera": ["Science Fiction"],
  Cyberpunk: ["Science Fiction"],
  Dystopian: ["Science Fiction"],
  "Psychological Thriller": ["Thriller"],
};

const LEGACY_TAG_ALIASES: Record<string, CanonicalTag> = {
  Historical: "Historical Fiction",
  // Juvenile / children's subjects are NOT YA — ignore via WEAK_YA_SUBJECT.
  "High Fantasy": "Epic Fantasy",
  "Sword and Sorcery": "Epic Fantasy",
};

/** Soft specificity rank — higher = keep preferentially when capping tags. */
const TAG_SPECIFICITY: Record<CanonicalTag, number> = {
  Grimdark: 10,
  "Dark Fantasy": 9,
  "Epic Fantasy": 9,
  "Romantic Fantasy": 9,
  "Urban Fantasy": 9,
  "Space Opera": 9,
  Cyberpunk: 9,
  Dystopian: 8,
  "Psychological Thriller": 9,
  Thriller: 5,
  Fantasy: 4,
  "Science Fiction": 4,
  Horror: 6,
  Romance: 5,
  Mystery: 5,
  "Historical Fiction": 5,
  Adventure: 4,
  "Young Adult": 3,
  Nonfiction: 3,
  Fiction: 1,
};

/** Default cap — enough room for specific genres without flooding the UI. */
export const DEFAULT_MAX_TAGS = 5;

/** Minimum mapped non-Fiction tags for Hardcover to be considered sufficient alone. */
const HARDCOVER_MIN_GOOD_TAGS = 1;

/** Only Hardcover, Google Books, and ISBNdb may contribute genre votes. */
const TRUSTED_SOURCES = new Set<BookSource>(["hardcover", "google", "isbndb"]);

const STRICT_TAGS = new Set<CanonicalTag>([
  "Young Adult",
  "Historical Fiction",
  "Mystery",
]);

const SPECIFIC_FICTION = new Set<CanonicalTag>(
  CANONICAL_TAGS.filter((tag) => tag !== "Fiction" && tag !== "Nonfiction")
);

const SPECULATIVE_TAGS = new Set<CanonicalTag>([
  "Grimdark",
  "Dark Fantasy",
  "Epic Fantasy",
  "Romantic Fantasy",
  "Urban Fantasy",
  "Fantasy",
  "Space Opera",
  "Cyberpunk",
  "Dystopian",
  "Science Fiction",
  "Horror",
]);

const STRONG_READER_TAGS = new Set<CanonicalTag>(
  CANONICAL_TAGS.filter((tag) => tag !== "Fiction")
);

export const YA_SEXUAL_CONTENT_BLOCK_THRESHOLD = 3;

const STRONG_HISTORICAL_SUBJECT =
  /historical fiction|\bhistori(cal)? fiction\b|fiction,\s*historical|\bhistory\s*\/\s*fiction\b|\bworld war (i{1,3}|one|two)\b|\bcivil war fiction\b/i;

const STRONG_YA_SUBJECT =
  /young[\s-]?adult(\s+fiction)?|\bya fiction\b|\bteen fiction\b|^ya$/i;

const WEAK_YA_SUBJECT =
  /juvenile fiction|juvenile literature|\bchildren'?s fiction\b|\bkids fiction\b/i;

const STRONG_MYSTERY_SUBJECT =
  /\bmystery fiction\b|\bdetective fiction\b|\bwhodunit\b|\bcrime fiction\b/i;

const FANTASY_OR_SPECULATIVE_SUBJECT =
  /\bfantasy\b|\bgrimdark\b|\bdark fantasy\b|\bscience[\s-]?fiction\b|\bsci-?fi\b|\bhorror\b|\bmagic\b|\bmythology\b|\bgods?\b|\bdragon\b|\bwizard\b|\bsorcer/i;

/** Title/description cues that mean YA must not be applied. */
const ADULT_CONTENT_BLOCK =
  /\b(erotica|erotic|smut|adult fiction|explicit sex|sexual content|mature audience|xxx|nsfw|dark romance|spicy romance|steamy|sensual|seduction|explicit content|for mature readers|mature readers|adult romance|new[\s-]?adult|18\+|adult romantasy|explicit romance|graphic sex|graphic sexual)\b/i;

const NOISE_PATTERNS: RegExp[] = [
  /^general$/i,
  /\bgeneral\b/i,
  /american literature/i,
  /english literature/i,
  /british literature/i,
  /european literature/i,
  /^literature$/i,
  /literary collections/i,
  /translations into/i,
  /unprotected/i,
  /^books?\b/i,
  /^reading\b/i,
  /^language$/i,
  /^geography$/i,
  /^social aspects$/i,
  /^aspects$/i,
  /^\d{2,}/,
  /^bisac/i,
  /^lc\b/i,
  /^pr\b/i,
  /^ps\b/i,
  /^nyt /i,
  /bestseller/i,
  /hardcover fiction/i,
  /trade fiction paperback/i,
  /browsing:\s*/i,
  /category:\s*/i,
  /classic literature/i,
  /^\s*classics\s*$/i,
];

/**
 * Mapping rules — more specific patterns first so first-match prefers sub-genres.
 */
const TAG_RULES: { tag: CanonicalTag; pattern: RegExp }[] = [
  { tag: "Grimdark", pattern: /\bgrimdark\b|grim[\s-]?dark/i },
  {
    tag: "Dark Fantasy",
    pattern: /dark fantasy|grim fantasy|horror fantasy|gothic fantasy/i,
  },
  {
    tag: "Epic Fantasy",
    pattern: /epic fantasy|high fantasy|sword and sorcery|^epic$/i,
  },
  {
    tag: "Romantic Fantasy",
    pattern:
      /romantic fantasy|fantasy romance|romantasy|\bromantasy\b|paranormal romance/i,
  },
  { tag: "Urban Fantasy", pattern: /urban fantasy|contemporary fantasy/i },
  { tag: "Space Opera", pattern: /space opera/i },
  { tag: "Cyberpunk", pattern: /\bcyberpunk\b/i },
  {
    tag: "Dystopian",
    pattern: /\bdystopia(n)?\b|post[\s-]?apocalyptic/i,
  },
  {
    tag: "Psychological Thriller",
    pattern: /psychological thriller|psycho[\s-]?thriller/i,
  },
  {
    tag: "Science Fiction",
    pattern: /science[\s-]?fiction|\bsci-?fi\b/i,
  },
  {
    tag: "Fantasy",
    // Broad fantasy / historical fantasy → Fantasy only when no sub-genre matched above.
    pattern:
      /\bfantasy\b|historical fantasy|portal fantasy|mythic fiction|fantasy fiction|speculative fiction/i,
  },
  {
    tag: "Horror",
    pattern: /\bhorror\b|ghost stories|supernatural fiction|gothic fiction/i,
  },
  { tag: "Romance", pattern: /\bromanc(e|tic)\b|love stories/i },
  { tag: "Mystery", pattern: STRONG_MYSTERY_SUBJECT },
  { tag: "Thriller", pattern: /\bthriller\b|suspense|espionage/i },
  { tag: "Historical Fiction", pattern: STRONG_HISTORICAL_SUBJECT },
  { tag: "Adventure", pattern: /\badventure\b|action & adventure/i },
  { tag: "Young Adult", pattern: STRONG_YA_SUBJECT },
  {
    tag: "Nonfiction",
    pattern:
      /non[\s-]?fiction|biograph|memoir|self-?help|philosophy|religion|politics|popular science|^science$|history of/i,
  },
  {
    tag: "Fiction",
    pattern: /^fiction$|general fiction|literary fiction|^fiction\b/i,
  },
];

const INFERENCE_RULES: { tag: CanonicalTag; pattern: RegExp }[] = [
  {
    tag: "Grimdark",
    pattern: /\b(grimdark|morally grey|morally gray|brutal world)\b/i,
  },
  {
    tag: "Dark Fantasy",
    pattern:
      /\b(dark fantasy|blood magic|fallen gods?|dead gods?|godkiller|grim fairy)\b/i,
  },
  {
    tag: "Epic Fantasy",
    pattern: /\b(epic fantasy|high fantasy|chosen one|ancient prophecy)\b/i,
  },
  {
    tag: "Romantic Fantasy",
    pattern: /\b(romantasy|fantasy romance|romantic fantasy)\b/i,
  },
  {
    tag: "Urban Fantasy",
    pattern: /\b(urban fantasy|modern[- ]day (witch|wizard|vampire))\b/i,
  },
  {
    tag: "Psychological Thriller",
    pattern: /\b(psychological thriller|unreliable narrator)\b/i,
  },
  {
    tag: "Space Opera",
    pattern: /\b(space opera|galactic empire)\b/i,
  },
  {
    tag: "Cyberpunk",
    pattern: /\b(cyberpunk|neon[- ]noir)\b/i,
  },
  {
    tag: "Dystopian",
    pattern: /\b(dystopian|post[- ]apocalyptic)\b/i,
  },
  {
    tag: "Fantasy",
    pattern:
      /\b(dragon|wizard|witch|sorcery|enchanted|elf|elves|magic kingdom|gods? of|pantheon|orcs?|fae|faerie|spellcraft|sorceress)\b/i,
  },
  {
    tag: "Science Fiction",
    pattern:
      /\b(spaceship|galaxy|android|alien|interstellar)\b/i,
  },
  {
    tag: "Horror",
    pattern: /\b(haunted|nightmare|terror|ghoul|undead|bloodcurdling)\b/i,
  },
  {
    tag: "Romance",
    pattern: /\b(love story|falling in love|wedding|heartbreak|romance)\b/i,
  },
  {
    tag: "Thriller",
    pattern: /\b(conspiracy|assassin|hostage|manhunt|espionage|thriller)\b/i,
  },
  {
    tag: "Adventure",
    pattern: /\b(quest|voyage|expedition|treasure|journey across)\b/i,
  },
  {
    tag: "Nonfiction",
    pattern: /\b(true story|biography of|memoir|based on fact)\b/i,
  },
];

export type GenreEvidence = {
  source: BookSource | "inference" | "fallback";
  categories: string[];
};

export type FinalizeBookTagsInput = {
  genres?: string[] | null;
  genreEvidence?: GenreEvidence[];
  title?: string | null;
  description?: string | null;
  publishedYear?: number | null;
  source?: string | null;
  sexualContentAverage?: number | null;
  minTags?: number;
  /** Soft cap — prefer 1–3 accurate tags. */
  maxTags?: number;
};

function isNoise(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length < 3) return true;
  if (trimmed.length > 60) return true;
  return NOISE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function splitRawCategories(categories: string[]): string[] {
  return categories.flatMap((category) =>
    category
      .split(/[\/,;|>—–]+/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0 && !isNoise(part))
  );
}

function resolveAlias(value: string): CanonicalTag | null {
  if (CANONICAL_SET.has(value)) return value as CanonicalTag;
  return LEGACY_TAG_ALIASES[value] ?? null;
}

function mapSubjectToTag(subject: string): CanonicalTag | null {
  // Weak children's / juvenile subjects never become YA (check before aliases).
  if (WEAK_YA_SUBJECT.test(subject) && !STRONG_YA_SUBJECT.test(subject)) {
    return null;
  }

  const aliased = resolveAlias(subject);
  if (aliased) return aliased;

  // Historical fantasy → Fantasy family (specific Dark Fantasy only with dark cues).
  if (
    FANTASY_OR_SPECULATIVE_SUBJECT.test(subject) &&
    /\bhistorical\b|\bmedieval\b|\bmiddle ages\b/i.test(subject)
  ) {
    if (/\bgrimdark\b/i.test(subject)) return "Grimdark";
    if (/dark fantasy|grim fantasy/i.test(subject)) return "Dark Fantasy";
    if (/epic|high fantasy/i.test(subject)) return "Epic Fantasy";
    return "Fantasy";
  }

  if (
    /^\s*historical\s*$/i.test(subject) ||
    /^\s*history\s*$/i.test(subject) ||
    /^\s*middle ages\s*$/i.test(subject) ||
    /^\s*medieval\s*$/i.test(subject) ||
    /^\s*mystery\s*$/i.test(subject)
  ) {
    return null;
  }

  for (const { tag, pattern } of TAG_RULES) {
    if (pattern.test(subject)) return tag;
  }
  return null;
}

function orderCanonical(tags: string[]): CanonicalTag[] {
  const set = new Set(
    tags.filter((tag): tag is CanonicalTag => CANONICAL_SET.has(tag))
  );
  return CANONICAL_TAGS.filter((tag) => set.has(tag));
}

function dropRedundantFiction(tags: CanonicalTag[]): CanonicalTag[] {
  if (!tags.some((tag) => SPECIFIC_FICTION.has(tag))) return tags;
  return tags.filter((tag) => tag !== "Fiction");
}

/** Prefer sub-genres: drop Fantasy when Dark Fantasy / Grimdark / etc. is present. */
function preferSpecificOverBroad(tags: CanonicalTag[]): CanonicalTag[] {
  const set = new Set(tags);
  const drop = new Set<CanonicalTag>();

  for (const tag of tags) {
    const parents = PARENT_OF[tag];
    if (!parents) continue;
    for (const parent of parents) {
      if (set.has(parent)) drop.add(parent);
    }
  }

  if (drop.size === 0) return tags;
  return tags.filter((tag) => !drop.has(tag));
}

function hasStrongHistoricalSignal(categories: string[]): boolean {
  return splitRawCategories(categories).some((subject) => {
    if (FANTASY_OR_SPECULATIVE_SUBJECT.test(subject)) return false;
    return STRONG_HISTORICAL_SUBJECT.test(subject);
  });
}

function resolveConflictingTags(
  tags: CanonicalTag[],
  rawCategories: string[]
): CanonicalTag[] {
  let next = preferSpecificOverBroad([...tags]);
  const hasSpeculative = next.some((tag) => SPECULATIVE_TAGS.has(tag));
  const hasFantasyFamily = next.some(
    (tag) =>
      tag === "Fantasy" ||
      tag === "Dark Fantasy" ||
      tag === "Grimdark" ||
      tag === "Epic Fantasy" ||
      tag === "Romantic Fantasy" ||
      tag === "Urban Fantasy"
  );
  const hasSfFamily = next.some(
    (tag) =>
      tag === "Science Fiction" ||
      tag === "Space Opera" ||
      tag === "Cyberpunk" ||
      tag === "Dystopian"
  );

  if (hasSpeculative && next.includes("Historical Fiction")) {
    if (!hasStrongHistoricalSignal(rawCategories)) {
      next = next.filter((tag) => tag !== "Historical Fiction");
    }
  }

  if (hasSpeculative && next.includes("Nonfiction")) {
    next = next.filter((tag) => tag !== "Nonfiction");
  }

  // Fantasy family vs SF family — keep the side with stronger raw hits.
  if (hasFantasyFamily && hasSfFamily) {
    const joined = rawCategories.join(" ");
    const fantasyHits = (
      joined.match(/\bfantasy\b|\bgrimdark\b|\bmagic\b/gi) ?? []
    ).length;
    const sfHits = (
      joined.match(/science[\s-]?fiction|\bsci-?fi\b|cyberpunk|space opera/gi) ??
      []
    ).length;
    if (fantasyHits >= sfHits) {
      next = next.filter(
        (tag) =>
          tag !== "Science Fiction" &&
          tag !== "Space Opera" &&
          tag !== "Cyberpunk" &&
          tag !== "Dystopian"
      );
    } else {
      next = next.filter(
        (tag) =>
          tag !== "Fantasy" &&
          tag !== "Dark Fantasy" &&
          tag !== "Grimdark" &&
          tag !== "Epic Fantasy" &&
          tag !== "Romantic Fantasy" &&
          tag !== "Urban Fantasy"
      );
    }
  }

  if (
    next.includes("Mystery") &&
    (next.includes("Thriller") || next.includes("Psychological Thriller"))
  ) {
    next = next.filter((tag) => tag !== "Mystery");
  }

  return preferSpecificOverBroad(next);
}

function collectAllCategories(input: FinalizeBookTagsInput): string[] {
  if (input.genreEvidence?.length) {
    return selectTagEvidence(input.genreEvidence).flatMap(
      (entry) => entry.categories
    );
  }
  // Single-source path: only trusted APIs contribute raw subjects.
  if (input.source && !TRUSTED_SOURCES.has(input.source as BookSource)) {
    return [];
  }
  return input.genres ?? [];
}

/** Tag providers only — Open Library / Gutendex / NYT never contribute. */
function isTrustedTagSource(
  source: GenreEvidence["source"]
): source is BookSource {
  return (
    source !== "fallback" &&
    source !== "inference" &&
    TRUSTED_SOURCES.has(source as BookSource)
  );
}

const BROAD_FALLBACK_PARENTS = new Set<CanonicalTag>([
  "Fantasy",
  "Science Fiction",
  "Thriller",
  "Romance",
  "Adventure",
  "Fiction",
]);

const SPECIFIC_SUBGENRE_TAGS = new Set<CanonicalTag>(
  CANONICAL_TAGS.filter((tag) => Boolean(PARENT_OF[tag]))
);

/**
 * Prefer Hardcover subjects when they map to clear, useful genres.
 * Otherwise fall back to Google Books + ISBNdb only.
 * Open Library / Gutendex / NYT never contribute.
 * When Hardcover is enough but only broad, still allow specific
 * sub-genre subjects from Google/ISBNdb (never broad/YA fillers).
 */
function selectTagEvidence(evidence: GenreEvidence[]): GenreEvidence[] {
  const trusted = evidence.filter(
    (entry) =>
      isTrustedTagSource(entry.source) &&
      splitRawCategories(entry.categories).length > 0
  );

  const hardcover = trusted.filter((entry) => entry.source === "hardcover");
  if (hardcover.length > 0 && hardcoverHasSufficientTags(hardcover)) {
    const mappedHc = mapEvidenceToTags(hardcover);
    const needsSpecificEnrichment = mappedHc.every(
      (tag) => BROAD_FALLBACK_PARENTS.has(tag) || tag === "Young Adult"
    );

    if (!needsSpecificEnrichment) {
      return hardcover;
    }

    const secondary = trusted.filter(
      (entry) => entry.source === "google" || entry.source === "isbndb"
    );
    const specificOnly = secondary
      .map((entry) => ({
        ...entry,
        categories: splitRawCategories(entry.categories).filter((subject) => {
          const tag = mapSubjectToTag(subject);
          return tag != null && SPECIFIC_SUBGENRE_TAGS.has(tag);
        }),
      }))
      .filter((entry) => entry.categories.length > 0);

    return [...hardcover, ...specificOnly];
  }

  return trusted.filter(
    (entry) => entry.source === "google" || entry.source === "isbndb"
  );
}

function mapEvidenceToTags(evidence: GenreEvidence[]): CanonicalTag[] {
  const mapped = new Set<CanonicalTag>();
  for (const entry of evidence) {
    for (const subject of splitRawCategories(entry.categories)) {
      if (WEAK_YA_SUBJECT.test(subject) && !STRONG_YA_SUBJECT.test(subject)) {
        continue;
      }
      const tag = mapSubjectToTag(subject);
      if (!tag || tag === "Fiction") continue;
      mapped.add(tag);
    }
  }
  return preferSpecificOverBroad(Array.from(mapped));
}

/** Hardcover is usable alone when it yields enough non-Fiction canonical tags. */
function hardcoverHasSufficientTags(evidence: GenreEvidence[]): boolean {
  return mapEvidenceToTags(evidence).length >= HARDCOVER_MIN_GOOD_TAGS;
}

/**
 * Cap tags while keeping the most specific/useful genres first.
 */
function truncatePreferringSpecific(
  tags: CanonicalTag[],
  maxTags: number
): CanonicalTag[] {
  if (tags.length <= maxTags) return tags;

  const ranked = [...tags].sort((a, b) => {
    const specificity =
      (TAG_SPECIFICITY[b] ?? 0) - (TAG_SPECIFICITY[a] ?? 0);
    if (specificity !== 0) return specificity;
    return CANONICAL_TAGS.indexOf(a) - CANONICAL_TAGS.indexOf(b);
  });

  return orderCanonical(ranked.slice(0, maxTags));
}

function textBlocksYoungAdult(
  title: string,
  description: string | null | undefined
): boolean {
  const haystack = `${title}\n${description ?? ""}`;
  if (ADULT_CONTENT_BLOCK.test(haystack)) return true;
  // New Adult is a distinct market — never treat as YA.
  if (/\bnew[\s-]?adult\b/i.test(haystack)) return true;
  return false;
}

function textConfirmsStrictTag(
  tag: CanonicalTag,
  title: string,
  description: string | null | undefined
): boolean {
  const haystack = `${title}\n${description ?? ""}`;
  if (tag === "Young Adult") {
    if (textBlocksYoungAdult(title, description)) return false;
    // Require clear YA market language — not vague "coming of age".
    return /\b(young[\s-]?adult|\bya\b|teen(aged|ager)?s?\b|high[\s-]?school)\b/i.test(
      haystack
    );
  }
  if (tag === "Historical Fiction") {
    if (FANTASY_OR_SPECULATIVE_SUBJECT.test(haystack)) return false;
    return /\b(historical fiction|world war|civil war|victorian|tudor|set in \d{4})\b/i.test(
      haystack
    );
  }
  if (tag === "Mystery") {
    return /\b(mystery|detective|whodunit|murder mystery)\b/i.test(haystack);
  }
  return false;
}

type TagVotes = Map<CanonicalTag, { trusted: Set<string>; weakYa: number }>;

function addVote(votes: TagVotes, tag: CanonicalTag, source: string): void {
  const entry = votes.get(tag) ?? {
    trusted: new Set<string>(),
    weakYa: 0,
  };
  entry.trusted.add(source);
  votes.set(tag, entry);
}

function collectVotes(evidence: GenreEvidence[]): TagVotes {
  const votes: TagVotes = new Map();

  for (const entry of selectTagEvidence(evidence)) {
    const source = entry.source;

    for (const subject of splitRawCategories(entry.categories)) {
      if (WEAK_YA_SUBJECT.test(subject) && !STRONG_YA_SUBJECT.test(subject)) {
        const ya = votes.get("Young Adult") ?? {
          trusted: new Set<string>(),
          weakYa: 0,
        };
        ya.weakYa += 1;
        votes.set("Young Adult", ya);
        continue;
      }

      const tag = mapSubjectToTag(subject);
      if (!tag) continue;
      addVote(votes, tag, String(source));
    }
  }

  return votes;
}

function shouldBlockYoungAdult(input: FinalizeBookTagsInput): boolean {
  if (textBlocksYoungAdult(input.title ?? "", input.description)) {
    return true;
  }
  const sexual = input.sexualContentAverage;
  if (
    typeof sexual === "number" &&
    sexual >= YA_SEXUAL_CONTENT_BLOCK_THRESHOLD
  ) {
    return true;
  }
  return false;
}

/**
 * YA is frequently misapplied to adult romantasy / dark fantasy.
 * Always require clear YA text confirmation; adult cues / high spice always win.
 */
function mayKeepStrictTag(
  tag: CanonicalTag,
  votes: TagVotes,
  input: FinalizeBookTagsInput
): boolean {
  const entry = votes.get(tag);
  if (!entry) return false;

  if (tag === "Young Adult") {
    if (shouldBlockYoungAdult(input)) return false;
    if (entry.trusted.size === 0 && entry.weakYa > 0) return false;
    // Market mislabels are common — never accept YA on source votes alone.
    return textConfirmsStrictTag(
      tag,
      input.title ?? "",
      input.description
    );
  }

  if (entry.trusted.size >= 2) return true;

  if (
    entry.trusted.size === 1 &&
    textConfirmsStrictTag(tag, input.title ?? "", input.description)
  ) {
    return true;
  }

  return false;
}

/** Final safety net — strip YA whenever adult cues or high spice apply. */
function stripBlockedYoungAdult(
  tags: CanonicalTag[],
  input: FinalizeBookTagsInput
): CanonicalTag[] {
  if (!tags.includes("Young Adult")) return tags;
  if (!shouldBlockYoungAdult(input)) return tags;
  return tags.filter((tag) => tag !== "Young Adult");
}

export function normalizeBookTags(categories: string[]): string[] {
  const flattened = splitRawCategories(categories);
  const matched = new Set<CanonicalTag>();

  for (const subject of flattened) {
    const tag = mapSubjectToTag(subject);
    if (tag) matched.add(tag);
  }

  return dropRedundantFiction(
    resolveConflictingTags(orderCanonical(Array.from(matched)), categories)
  );
}

export function cleanRawSubjects(categories: string[]): string[] {
  return dedupeTags(splitRawCategories(categories));
}

export function inferTagsFromText(
  title: string,
  description?: string | null
): string[] {
  const haystack = `${title}\n${description ?? ""}`;
  if (!haystack.trim()) return [];

  const matched = new Set<CanonicalTag>();
  for (const { tag, pattern } of INFERENCE_RULES) {
    if (STRICT_TAGS.has(tag)) continue;
    if (pattern.test(haystack)) matched.add(tag);
  }

  let tags = orderCanonical(Array.from(matched));
  tags = preferSpecificOverBroad(tags);
  if (
    tags.some((tag) => SPECULATIVE_TAGS.has(tag)) &&
    tags.includes("Historical Fiction")
  ) {
    tags = tags.filter((tag) => tag !== "Historical Fiction");
  }
  return tags;
}

function isCanonicalOrLegacyLabel(value: string): boolean {
  return CANONICAL_SET.has(value) || Boolean(LEGACY_TAG_ALIASES[value]);
}

function buildEvidence(input: FinalizeBookTagsInput): GenreEvidence[] {
  if (input.genreEvidence?.length) {
    return selectTagEvidence(input.genreEvidence);
  }
  const genres = input.genres ?? [];
  if (!genres.length) return [];
  const source = (input.source as BookSource | undefined) ?? "google";
  if (!TRUSTED_SOURCES.has(source)) return [];
  return selectTagEvidence([{ source, categories: genres }]);
}

function refineBroadFiction(
  tags: CanonicalTag[],
  rawCategories: string[]
): CanonicalTag[] {
  if (!tags.includes("Fiction")) return tags;

  if (tags.some((tag) => STRONG_READER_TAGS.has(tag))) {
    return tags.filter((tag) => tag !== "Fiction");
  }

  const joined = rawCategories.join(" ");
  const strongLiterary =
    /literary fiction|general fiction|contemporary fiction/i.test(joined);
  if (!strongLiterary) {
    return tags.filter((tag) => tag !== "Fiction");
  }

  return tags;
}

/**
 * Tags from Hardcover (preferred when good), else Google Books / ISBNdb.
 * Never Open Library. Prefer specific sub-genres; max DEFAULT_MAX_TAGS.
 */
export function finalizeBookTags(input: FinalizeBookTagsInput): string[] {
  const maxTags = input.maxTags ?? DEFAULT_MAX_TAGS;
  const evidence = buildEvidence(input);
  const allRaw = collectAllCategories(input);

  if (
    allRaw.length > 0 &&
    allRaw.every((value) => isCanonicalOrLegacyLabel(value))
  ) {
    let tags = dropRedundantFiction(
      resolveConflictingTags(
        orderCanonical(
          allRaw
            .map((value) => resolveAlias(value))
            .filter((tag): tag is CanonicalTag => Boolean(tag))
        ),
        allRaw
      )
    );
    tags = refineBroadFiction(tags, allRaw);

    // Canonical labels still go through YA adult / spice blocking.
    tags = stripBlockedYoungAdult(tags, input);
    if (tags.includes("Young Adult")) {
      // Pre-normalized YA without vote evidence needs text confirmation.
      if (
        !textConfirmsStrictTag(
          "Young Adult",
          input.title ?? "",
          input.description
        )
      ) {
        tags = tags.filter((tag) => tag !== "Young Adult");
      }
    }

    if (tags.length === 0) {
      const inferred = inferTagsFromText(
        input.title ?? "",
        input.description ?? null
      ) as CanonicalTag[];
      tags = resolveConflictingTags(orderCanonical(inferred), allRaw);
    }

    return truncatePreferringSpecific(
      stripBlockedYoungAdult(tags, input),
      maxTags
    );
  }

  const votes = collectVotes(evidence);
  const accepted: CanonicalTag[] = [];

  for (const tag of CANONICAL_TAGS) {
    const entry = votes.get(tag);
    if (!entry || entry.trusted.size === 0) continue;

    if (STRICT_TAGS.has(tag)) {
      if (mayKeepStrictTag(tag, votes, input)) accepted.push(tag);
      continue;
    }

    accepted.push(tag);
  }

  let tags = dropRedundantFiction(
    resolveConflictingTags(orderCanonical(accepted), allRaw)
  );
  tags = refineBroadFiction(tags, allRaw);

  // Light inference only when trusted sources gave nothing useful.
  if (tags.length === 0) {
    const inferred = inferTagsFromText(
      input.title ?? "",
      input.description ?? null
    ) as CanonicalTag[];
    tags = resolveConflictingTags(orderCanonical(inferred), allRaw);
  }

  for (const tag of Array.from(STRICT_TAGS)) {
    if (tags.includes(tag)) continue;
    if (mayKeepStrictTag(tag, votes, input)) tags.push(tag);
  }

  tags = dropRedundantFiction(
    resolveConflictingTags(orderCanonical(tags), allRaw)
  );
  tags = refineBroadFiction(tags, allRaw);
  tags = stripBlockedYoungAdult(tags, input);

  return truncatePreferringSpecific(tags, maxTags);
}

export function withFinalizedTags<
  T extends {
    genres: string[];
    title: string;
    description?: string | null;
    publishedYear?: number | null;
    source?: BookSource;
  },
>(
  book: T,
  options?: {
    minTags?: number;
    maxTags?: number;
    sexualContentAverage?: number | null;
  }
): T {
  return {
    ...book,
    genres: finalizeBookTags({
      genreEvidence: [
        {
          source: book.source ?? "google",
          categories: book.genres,
        },
      ],
      title: book.title,
      description: book.description,
      publishedYear: book.publishedYear,
      source: book.source,
      sexualContentAverage: options?.sexualContentAverage,
      minTags: options?.minTags,
      maxTags: options?.maxTags,
    }),
  };
}
