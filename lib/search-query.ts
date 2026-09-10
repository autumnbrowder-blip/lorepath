import { isAuthorQuery, normalizeTitleForDedupe, repairSearchQuery } from "@/lib/book-utils";

/**
 * Conservative public-domain classic detector for Gutendex.
 * "brain damage" and "moriarty" must not match.
 */
const PUBLIC_DOMAIN_CLASSIC_RE =
  /\b(austen|dickens|shakespeare|melville|twain|tolstoy|dostoevsky|dostoyevsky)\b|pride and prejudice|sense and sensibility|moby[\s-]*dick|great expectations|tale of two cities|\bhamlet\b|\bmacbeth\b|romeo and juliet|\bfrankenstein\b|jane eyre|wuthering heights|\bdracula\b|little women|tom sawyer|huckleberry finn|war and peace|crime and punishment|\bodyssey\b|\biliad\b/i;

/** True only for well-known public-domain classics — Gutendex stay skipped otherwise. */
export function isPublicDomainClassicQuery(query: string): boolean {
  const q = query.trim();
  if (!q) return false;
  return PUBLIC_DOMAIN_CLASSIC_RE.test(q);
}

export type SearchQueryKind =
  | "isbn"
  | "author"
  | "title"
  | "title_author"
  | "raw";

export type NormalizedSearchQuery = {
  raw: string;
  kind: SearchQueryKind;
  /** Digits-only ISBN when detected. */
  isbn: string | null;
  title: string | null;
  author: string | null;
  /**
   * Provider query strings to run (deduped, ordered by preference).
   * Always includes a title-safe variant when a title was detected so adding
   * an author can never erase a title-only hit.
   */
  variants: string[];
};

const ISBN_RE = /^(?:978|979)?[\dXx][\dXx\- ]{8,16}$/;

function cleanSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function looksLikePersonName(words: string[]): boolean {
  if (words.length < 1 || words.length > 3) return false;
  return words.every((word) =>
    /^[A-Z][a-z]+(?:['-][A-Za-z]+)?$/.test(word) ||
    /^[A-Z]\.$/.test(word)
  );
}

/**
 * Detect trailing author names: "Divine Rivals Rebecca Ross" →
 * title "Divine Rivals", author "Rebecca Ross".
 */
function splitTitleAndAuthor(raw: string): {
  title: string | null;
  author: string | null;
} {
  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length < 3) return { title: null, author: null };

  // Try last 2–3 words as author. Skip 1-word authors — too many false splits
  // ("Mary Robinette Kowal" → title "Mary Robinette" + author "Kowal").
  for (const authorLen of [2, 3]) {
    if (words.length <= authorLen) continue;
    const authorWords = words.slice(-authorLen);
    const titleWords = words.slice(0, -authorLen);
    if (titleWords.length === 0) continue;
    if (!looksLikePersonName(authorWords)) continue;

    // Avoid eating a lone given name as the "title" (e.g. "John Smith").
    // Multi-word titles like "Divine Rivals" are allowed even when Cap Case.
    if (titleWords.length === 1 && looksLikePersonName(titleWords)) continue;

    return {
      title: titleWords.join(" "),
      author: authorWords.join(" "),
    };
  }

  return { title: null, author: null };
}

function extractIsbn(raw: string): string | null {
  const compact = raw.replace(/[\s-]/g, "");
  if (!/^\d{9}[\dXx]$|^\d{13}$/.test(compact)) return null;
  if (!ISBN_RE.test(raw.trim()) && !/^\d{10}$|^\d{13}$/.test(compact)) {
    // Allow bare digit ISBNs without hyphens.
    if (!/^\d{9}[\dXx]$|^\d{13}$/.test(compact)) return null;
  }
  return compact.toUpperCase();
}

/**
 * Stage 1 — normalize a browse query into safe provider variants.
 * Title+author never replaces title-only; both are issued when detected.
 */
export function normalizeSearchQuery(input: string): NormalizedSearchQuery {
  const raw = cleanSpaces(repairSearchQuery(input));
  if (!raw) {
    return {
      raw: "",
      kind: "raw",
      isbn: null,
      title: null,
      author: null,
      variants: [],
    };
  }

  const isbn = extractIsbn(raw);
  if (isbn) {
    return {
      raw,
      kind: "isbn",
      isbn,
      title: null,
      author: null,
      variants: [isbn, `isbn:${isbn}`],
    };
  }

  // Pure author names first (e.g. "Mary Robinette Kowal") so we don't
  // mis-split them into title+author.
  if (isAuthorQuery(raw)) {
    return {
      raw,
      kind: "author",
      isbn: null,
      title: null,
      author: raw,
      variants: [raw],
    };
  }

  const split = splitTitleAndAuthor(raw);
  if (split.title && split.author) {
    const title = split.title;
    const author = split.author;
    const variants = dedupeVariants([
      raw,
      title,
      `${title} ${author}`,
      `intitle:"${title}" inauthor:"${author}"`,
    ]);
    return {
      raw,
      kind: "title_author",
      isbn: null,
      title,
      author,
      variants,
    };
  }

  return {
    raw,
    kind: "title",
    isbn: null,
    title: raw,
    author: null,
    variants: [raw],
  };
}

function dedupeVariants(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const cleaned = cleanSpaces(value);
    if (!cleaned) continue;
    const key = normalizeTitleForDedupe(cleaned) || cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

/** Primary flood string — prefer structured title+author when available. */
export function primarySearchString(normalized: NormalizedSearchQuery): string {
  if (normalized.kind === "isbn" && normalized.isbn) {
    return normalized.isbn;
  }
  if (normalized.kind === "title_author" && normalized.title && normalized.author) {
    return `${normalized.title} ${normalized.author}`;
  }
  return normalized.raw;
}

/** Extra variants beyond the primary (title-only recovery, ISBN forms, …). */
export function secondarySearchVariants(
  normalized: NormalizedSearchQuery
): string[] {
  const primary = primarySearchString(normalized);
  return normalized.variants.filter(
    (variant) => variant.toLowerCase() !== primary.toLowerCase()
  );
}

/**
 * Extra Google Books query so multi-word titles (including 2025–2026
 * releases) are requested as `intitle:"{query}"`. 2+ words or a quoted phrase.
 * Returns `intitle:"…"` or null (no extra request).
 */
export function googleTitlePriorityQuery(input: string): string | null {
  const raw = cleanSpaces(repairSearchQuery(input));
  if (!raw) return null;
  if (/intitle:/i.test(raw)) return null;

  const quoted =
    raw.match(/["“]([^"”]+)["”]/)?.[1]?.trim() ||
    raw.match(/'([^']+)'/)?.[1]?.trim() ||
    null;

  const title = quoted ?? raw;
  const cleaned = title.replace(/["“”']/g, "").trim();
  if (!cleaned) return null;
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;
  return `intitle:"${cleaned}"`;
}

/**
 * Extra Google Books author query. Two words with no digits look like a
 * person name (`liane moriarty`); also first + initial + last
 * (`sarah a. parker`). Returns `inauthor:"…"` or null.
 * Title-shaped two-word queries ("Fourth Wing") are not person names.
 */
export function googleAuthorPriorityQuery(input: string): string | null {
  const raw = cleanSpaces(repairSearchQuery(input));
  if (!raw) return null;
  if (/\d/.test(raw)) return null;
  if (/inauthor:/i.test(raw)) return null;

  const words = raw.split(/\s+/).filter(Boolean);
  const twoWord = words.length === 2;
  const initialName =
    words.length === 3 && /^[a-z]\.?$/i.test(words[1] ?? "");
  if (!twoWord && !initialName) return null;
  if (!isAuthorQuery(raw)) return null;
  return `inauthor:"${raw}"`;
}

/**
 * The single Google Books `q` for one search page. Never issue A/B/C extras.
 * Person name → inauthor; 2+ word titles → intitle; otherwise raw q.
 */
export function googleSearchQuery(input: string): string {
  const raw = cleanSpaces(repairSearchQuery(input));
  if (!raw) return raw;
  return (
    googleAuthorPriorityQuery(raw) ?? googleTitlePriorityQuery(raw) ?? raw
  );
}
