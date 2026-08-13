import { isAuthorQuery, normalizeTitleForDedupe } from "@/lib/book-utils";

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
  const raw = cleanSpaces(input);
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
