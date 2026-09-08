import {
  getLanguageEditionBucket,
  shouldKeepAsSeparateLanguageEditions,
  type LanguageEditionBucket,
} from "@/lib/book-language";
import {
  isPlaceholderDescription,
  isWeakDescription,
  normalizeAuthorForDedupe,
  normalizePublishedYear,
  normalizeTitleForDedupe,
  pickEarliestYear,
} from "@/lib/book-utils";
import type { BookDetail, BookSummary, WorkEditionRef } from "@/types/book";

const MAX_WORK_EDITIONS = 24;

/** Known non-English printings that must never win "latest edition". */
const BANNED_LATEST_EDITION_IDS = new Set(["ol-OL50732450M"]);

/**
 * Stable work identity so reprints / Google volume IDs collapse.
 *
 * Prefer Hardcover or Open Library work ids when the route id carries them.
 * Otherwise: normalized title + first author last name (and first initial
 * when present, so different authors who share a last name stay separate).
 * Never uses a Google volume id as the work identity.
 */
export function bookWorkKey(book: {
  id: string;
  title: string;
  authors?: readonly string[] | string | null;
}): string {
  return workKeysFor(book)[0] ?? `id:${(book.id ?? "").trim() || "unknown"}`;
}

/** Every grouping key this record can join on (Hardcover, OL, then title+author). */
export function workKeysFor(book: {
  id: string;
  title: string;
  authors?: readonly string[] | string | null;
}): string[] {
  const id = (book.id ?? "").trim();
  const keys: string[] = [];

  const hardcover = hardcoverWorkIdFromBookId(id);
  if (hardcover) keys.push(`hc:${hardcover}`);

  const openLibrary = openLibraryWorkIdFromBookId(id);
  if (openLibrary) keys.push(`ol:${openLibrary}`);

  const title = normalizeTitleForDedupe(book.title ?? "");
  const authorKey = firstAuthorWorkToken(authorsList(book.authors));
  if (title && authorKey) keys.push(`ta:${title}|${authorKey}`);

  if (keys.length === 0) {
    keys.push(`id:${id || title || "unknown"}`);
  }
  return keys;
}

export function workEditionsHref(bookId: string): string {
  return `/books/${encodeURIComponent(bookId)}/editions`;
}

export function booksShareWork(
  a: Parameters<typeof workKeysFor>[0],
  b: Parameters<typeof workKeysFor>[0]
): boolean {
  const other = new Set(workKeysFor(b));
  return workKeysFor(a).some((key) => other.has(key));
}

function authorsList(
  authors: readonly string[] | string | null | undefined
): string[] {
  if (Array.isArray(authors)) return [...authors];
  if (typeof authors === "string" && authors.trim()) return [authors.trim()];
  return [];
}

function firstAuthorWorkToken(authors: string[]): string {
  for (const author of authors) {
    const normalized = normalizeAuthorForDedupe(author);
    if (!normalized) continue;
    const parts = normalized.split(" ").filter(Boolean);
    const last = parts[parts.length - 1];
    if (!last) continue;
    // Last name + first initial so "Frank Herbert" and "Brian Herbert"
    // do not collapse, while "Frank Herbert" / "F. Herbert" still do.
    if (parts.length === 1) return last;
    const initial = parts[0][0] ?? "";
    return initial ? `${last}|${initial}` : last;
  }
  return "";
}

function openLibraryWorkIdFromBookId(id: string): string | null {
  const trimmed = id.trim();
  if (
    !trimmed.startsWith("ol-") &&
    !trimmed.startsWith("openlibrary-") &&
    !/^OL\d+W$/i.test(trimmed)
  ) {
    return null;
  }
  const match = trimmed.match(/OL\d+W/i);
  return match ? match[0].toUpperCase() : null;
}

function hardcoverWorkIdFromBookId(id: string): string | null {
  const match = /^hardcover-(.+)$/i.exec(id.trim());
  const raw = match?.[1]?.trim();
  return raw ? raw.toLowerCase() : null;
}

const COMMERCIAL_SOURCES = new Set([
  "google",
  "hardcover",
  "isbndb",
  "nyt",
  "bigbook",
]);

function isPlaceholderCoverUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return true;
  if (trimmed === "/images/parchment.jpg") return true;
  return /openlibrary\.org\/b\/id\/-1|cover_unavailable/i.test(trimmed);
}

export function hasRealCover(
  book: Pick<BookSummary, "coverUrl">
): boolean {
  const url = book.coverUrl?.trim() ?? "";
  if (!url) return false;
  return !isPlaceholderCoverUrl(url);
}

function hasDescription(book: Pick<BookSummary, "description">): boolean {
  const text = book.description?.trim();
  if (!text) return false;
  if (isPlaceholderDescription(text) || isWeakDescription(text)) return false;
  return true;
}

export function isOpenLibraryWorkRecord(
  book: Pick<BookSummary, "id">
): boolean {
  return Boolean(openLibraryWorkIdFromBookId(book.id));
}

function isCommercialEdition(book: Pick<BookSummary, "source">): boolean {
  return COMMERCIAL_SOURCES.has(book.source);
}

/** eng > unknown > non-eng — never let a translation beat an English copy. */
function languageRank(
  book: Pick<BookSummary, "language" | "title">
): number {
  const bucket: LanguageEditionBucket = getLanguageEditionBucket(book);
  if (bucket === "eng") return 2;
  if (bucket === "unknown") return 1;
  return 0;
}

function preferEnglishPool<T extends Pick<BookSummary, "language" | "title">>(
  editions: T[]
): T[] {
  const english = editions.filter(
    (edition) => getLanguageEditionBucket(edition) === "eng"
  );
  if (english.length > 0) return english;
  const unknown = editions.filter(
    (edition) => getLanguageEditionBucket(edition) === "unknown"
  );
  if (unknown.length > 0) return unknown;
  return editions;
}

export function isBannedLatestEditionId(id: string): boolean {
  return BANNED_LATEST_EDITION_IDS.has(id.trim());
}

function isDisallowedLatest(
  book: Pick<BookSummary, "id" | "language" | "title">
): boolean {
  if (isBannedLatestEditionId(book.id)) return true;
  return getLanguageEditionBucket(book) === "non-eng";
}

/**
 * Visible search-card / default tome identity.
 *
 * Prefer English when a copy exists; then a real cover; among those,
 * highest publishedYear. Google / ISBNdb / Hardcover beat an Open Library
 * work id. A commercial English edition with no year still beats a newer
 * non-English OL. Spanish / Ukrainian printings never win (e.g. OL50732450M).
 */
export function pickLatestEdition<T extends BookSummary>(a: T, b: T): T {
  const aBad = isDisallowedLatest(a);
  const bBad = isDisallowedLatest(b);
  if (aBad !== bBad) return aBad ? b : a;

  const aLang = languageRank(a);
  const bLang = languageRank(b);
  if (aLang !== bLang) return bLang > aLang ? b : a;

  const aOL = isOpenLibraryWorkRecord(a);
  const bOL = isOpenLibraryWorkRecord(b);
  const aCom = isCommercialEdition(a);
  const bCom = isCommercialEdition(b);
  // ISBNdb / Google / Hardcover identity wins over an OL work id even when
  // the commercial row has no cover yet — cover/description still merge in.
  if (aOL && bCom) return b;
  if (bOL && aCom) return a;

  const aCover = hasRealCover(a);
  const bCover = hasRealCover(b);
  if (aCover !== bCover) return bCover ? b : a;

  // Ignore an OL work-year when a commercial edition is the other option.
  // Two OL works still compare by publishedYear (newest cover wins).
  const aYear =
    aOL && bCom
      ? -Infinity
      : (normalizePublishedYear(a.publishedYear) ?? -Infinity);
  const bYear =
    bOL && aCom
      ? -Infinity
      : (normalizePublishedYear(b.publishedYear) ?? -Infinity);
  if (aYear !== bYear) return bYear > aYear ? b : a;

  const aDesc = hasDescription(a);
  const bDesc = hasDescription(b);
  if (aDesc !== bDesc) return bDesc ? b : a;

  if (aOL !== bOL) return aOL ? b : a;

  return a.id.localeCompare(b.id) <= 0 ? a : b;
}

/** Earliest printing in the group; English + cover win when several share that year. */
export function pickFirstEdition<T extends BookSummary>(group: T[]): T | null {
  if (group.length === 0) return null;
  const year = firstPublishedYear(group);
  const atYear =
    year == null
      ? group
      : group.filter(
          (book) => normalizePublishedYear(book.publishedYear) === year
        );
  const pool = preferEnglishPool(atYear.length > 0 ? atYear : group);
  const covered = pool.filter((book) => hasRealCover(book));
  const candidates = covered.length > 0 ? covered : pool;
  return candidates.reduce((best, book) => {
    const bestOL = isOpenLibraryWorkRecord(best);
    const nextOL = isOpenLibraryWorkRecord(book);
    if (bestOL !== nextOL) return nextOL ? book : best;
    if (hasRealCover(best) !== hasRealCover(book)) {
      return hasRealCover(book) ? book : best;
    }
    return best.id.localeCompare(book.id) <= 0 ? best : book;
  });
}

/** Resolve first-edition id from full records or leftover workEdition refs. */
export function pickFirstEditionId(group: BookSummary[]): string | null {
  const fromRecords = pickFirstEdition(group);
  if (
    fromRecords &&
    group.some(
      (book) =>
        book.id === fromRecords.id &&
        normalizePublishedYear(book.publishedYear) === firstPublishedYear(group)
    )
  ) {
    return fromRecords.id;
  }

  const year = firstPublishedYear(group);
  const refs = collectWorkEditionRefs(...group);
  const atYear =
    year == null
      ? refs
      : refs.filter((ref) => ref.publishedYear === year);
  const pool = preferEnglishPool(atYear.length > 0 ? atYear : refs);
  const covered = pool.filter((ref) => hasRealCover(ref));
  const candidates = covered.length > 0 ? covered : pool;
  if (candidates.length === 0) {
    return group[0]?.firstEditionId ?? group[0]?.id ?? null;
  }
  return candidates.reduce((best, ref) => {
    const bestOL = isOpenLibraryWorkRecord(best);
    const nextOL = isOpenLibraryWorkRecord(ref);
    if (bestOL !== nextOL) return nextOL ? ref : best;
    if (hasRealCover(best) !== hasRealCover(ref)) {
      return hasRealCover(ref) ? ref : best;
    }
    return best.id.localeCompare(ref.id) <= 0 ? best : ref;
  }).id;
}

export function firstPublishedYear(
  books: Pick<BookSummary, "publishedYear" | "firstPublishYear">[]
): number | null {
  let first: number | null = null;
  for (const book of books) {
    for (const raw of [book.firstPublishYear, book.publishedYear]) {
      const year = normalizePublishedYear(raw);
      if (year == null) continue;
      if (first == null || year < first) first = year;
    }
  }
  return first;
}

export function latestPublishedYear(
  books: Pick<BookSummary, "publishedYear" | "latestEditionYear" | "language" | "title">[]
): number | null {
  const pool = preferEnglishPool(books);
  let latest: number | null = null;
  for (const book of pool) {
    for (const raw of [book.latestEditionYear, book.publishedYear]) {
      const year = normalizePublishedYear(raw);
      if (year == null) continue;
      if (latest == null || year > latest) latest = year;
    }
  }
  return latest;
}

export function toWorkEditionRef(book: BookSummary): WorkEditionRef {
  return {
    id: book.id,
    title: book.title,
    publishedYear: normalizePublishedYear(book.publishedYear),
    coverUrl: book.coverUrl,
    source: book.source,
    language: book.language ?? null,
  };
}

export function collectWorkEditionRefs(
  ...books: BookSummary[]
): WorkEditionRef[] {
  const seen = new Set<string>();
  const refs: WorkEditionRef[] = [];
  for (const book of books) {
    const candidates = [toWorkEditionRef(book), ...(book.workEditions ?? [])];
    for (const ref of candidates) {
      if (!ref.id || seen.has(ref.id)) continue;
      seen.add(ref.id);
      refs.push(ref);
    }
  }
  refs.sort((a, b) => (b.publishedYear ?? 0) - (a.publishedYear ?? 0));
  return refs.slice(0, MAX_WORK_EDITIONS);
}

function collapseWorkGroup(group: BookSummary[]): BookSummary {
  const latest = group.reduce((best, book) => pickLatestEdition(best, book));
  const first = firstPublishedYear(group);
  const latestYear = latestPublishedYear(group);
  const workEditions = collectWorkEditionRefs(...group);

  const latestEditionYear =
    latestYear != null && first != null && latestYear > first
      ? latestYear
      : latest.latestEditionYear ?? null;
  const firstEditionId = pickFirstEditionId(group) ?? latest.id;
  const latestEditionId =
    latest.id !== firstEditionId && !isDisallowedLatest(latest)
      ? latest.id
      : null;

  return {
    ...latest,
    id: latest.id,
    source: latest.source,
    title: latest.title,
    authors: latest.authors,
    coverUrl: latest.coverUrl,
    description: latest.description,
    publishedYear: latest.publishedYear,
    firstPublishYear: first ?? latest.firstPublishYear ?? null,
    latestEditionYear,
    firstEditionId,
    latestEditionId,
    workKey: bookWorkKey(latest),
    workEditions,
  };
}

/**
 * One visible search card per work. Google volume IDs that share a workKey
 * collapse; the survivor is the latest edition.
 */
export function collapseBooksByWorkKey(books: BookSummary[]): BookSummary[] {
  if (books.length <= 1) {
    return books.map((book) => collapseWorkGroup([book]));
  }

  const parent = books.map((_, index) => index);
  const find = (index: number): number => {
    if (parent[index] !== index) parent[index] = find(parent[index]!);
    return parent[index]!;
  };
  const union = (a: number, b: number) => {
    const pa = find(a);
    const pb = find(b);
    if (pa !== pb) parent[pa] = pb;
  };

  const keyToIndices = new Map<string, number[]>();
  books.forEach((book, index) => {
    for (const key of workKeysFor(book)) {
      const existing = keyToIndices.get(key) ?? [];
      let joined = false;
      for (const other of existing) {
        if (shouldKeepAsSeparateLanguageEditions(book, books[other]!)) {
          continue;
        }
        union(index, other);
        joined = true;
        break;
      }
      if (!joined) existing.push(index);
      keyToIndices.set(key, existing);
    }
  });

  const groups = new Map<number, BookSummary[]>();
  const order: number[] = [];
  books.forEach((book, index) => {
    const root = find(index);
    const group = groups.get(root);
    if (group) {
      group.push(book);
    } else {
      groups.set(root, [book]);
      order.push(root);
    }
  });

  return order.map((root) => collapseWorkGroup(groups.get(root) ?? []));
}

export type GroupedRatedWork<T> = {
  workKey: string;
  book: T;
  extraEditionCount: number;
};

export type WorkGroupableRatedBook = {
  slug: string;
  title: string;
  author: string | null;
  coverImageUrl: string | null;
  publishedYear?: number | null;
  createdAt: string;
};

function pickRatedDisplay<T extends WorkGroupableRatedBook>(group: T[]): T {
  return group.reduce((best, book) => {
    const aYear = normalizePublishedYear(best.publishedYear) ?? -Infinity;
    const bYear = normalizePublishedYear(book.publishedYear) ?? -Infinity;
    if (aYear !== bYear) return bYear > aYear ? book : best;
    const aCover = Boolean(best.coverImageUrl?.trim());
    const bCover = Boolean(book.coverImageUrl?.trim());
    if (aCover !== bCover) return bCover ? book : best;
    return Date.parse(book.createdAt) > Date.parse(best.createdAt) ? book : best;
  });
}

/** One stats/rated row per work. Does not delete or merge rating rows in the DB. */
export function groupRatedBooksByWork<T extends WorkGroupableRatedBook>(
  books: T[]
): GroupedRatedWork<T>[] {
  if (books.length === 0) return [];

  const parent = books.map((_, index) => index);
  const find = (index: number): number => {
    if (parent[index] !== index) parent[index] = find(parent[index]!);
    return parent[index]!;
  };
  const union = (a: number, b: number) => {
    const pa = find(a);
    const pb = find(b);
    if (pa !== pb) parent[pa] = pb;
  };

  const keyToIndex = new Map<string, number>();
  books.forEach((book, index) => {
    const identity = {
      id: book.slug,
      title: book.title,
      authors: book.author,
    };
    for (const key of workKeysFor(identity)) {
      const existing = keyToIndex.get(key);
      if (existing != null) union(existing, index);
      else keyToIndex.set(key, index);
    }
  });

  const groups = new Map<number, T[]>();
  const order: number[] = [];
  books.forEach((book, index) => {
    const root = find(index);
    const group = groups.get(root);
    if (group) {
      group.push(book);
    } else {
      groups.set(root, [book]);
      order.push(root);
    }
  });

  return order.map((root) => {
    const group = groups.get(root) ?? [];
    const display = pickRatedDisplay(group);
    return {
      workKey: bookWorkKey({
        id: display.slug,
        title: display.title,
        authors: display.author,
      }),
      book: display,
      extraEditionCount: Math.max(0, group.length - 1),
    };
  });
}

/** Apply a first-published year carried from a search card (`?fy=`). */
export function applyFirstPublishYearHint<T extends BookDetail>(
  book: T,
  raw?: string | null
): T {
  const hinted = Number(raw);
  const hintedYear =
    Number.isFinite(hinted) && hinted >= 1000 && hinted <= 2100
      ? Math.round(hinted)
      : null;
  // Work first-publish year always wins over a later reprint or fy= reprint.
  const first = pickEarliestYear(book.firstPublishYear, hintedYear);
  if (first == null || first === normalizePublishedYear(book.firstPublishYear)) {
    return book;
  }
  return { ...book, firstPublishYear: first };
}

/** Filter a search page down to editions of the same work as `seed`. */
export function editionsOfWork(
  seed: Parameters<typeof workKeysFor>[0] &
    Pick<BookSummary, "language" | "title" | "id" | "source" | "coverUrl" | "publishedYear">,
  books: BookSummary[]
): WorkEditionRef[] {
  const matched = books.filter((book) => {
    if (!booksShareWork(seed, book)) return false;
    return !shouldKeepAsSeparateLanguageEditions(seed, book);
  });
  return collectWorkEditionRefs(seed as BookSummary, ...matched);
}

function pickPreferredEdition(editions: WorkEditionRef[]): WorkEditionRef | null {
  const withId = editions.filter(
    (edition) => Boolean(edition.id) && !isDisallowedLatest(edition)
  );
  const covered = withId.filter((edition) => hasRealCover(edition));
  const base = covered.length > 0 ? covered : withId;
  const pool = preferEnglishPool(base);
  if (pool.length === 0) return null;

  return pool.reduce((best, edition) => {
    const bestCom = COMMERCIAL_SOURCES.has(best.source) ? 1 : 0;
    const nextCom = COMMERCIAL_SOURCES.has(edition.source) ? 1 : 0;
    if (bestCom !== nextCom) return nextCom > bestCom ? edition : best;
    const bestYear = normalizePublishedYear(best.publishedYear) ?? -Infinity;
    const nextYear = normalizePublishedYear(edition.publishedYear) ?? -Infinity;
    if (bestYear !== nextYear) return nextYear > bestYear ? edition : best;
    return best;
  });
}

function refAsSummary(
  ref: WorkEditionRef,
  fallback: BookSummary
): BookSummary {
  return {
    ...fallback,
    id: ref.id,
    title: ref.title,
    publishedYear: ref.publishedYear,
    coverUrl: ref.coverUrl,
    source: ref.source,
    language: ref.language ?? null,
  };
}

/**
 * Newest English covered printing in the same work as `current`.
 * Prefers Google / ISBNdb / Hardcover over an Open Library work id.
 * Never returns a non-English printing (e.g. Spanish Dune OL50732450M).
 */
export function resolveLatestEditionTarget(
  current: BookSummary,
  siblings: BookSummary[] = []
): { id: string; year: number | null } {
  const matched = siblings.filter((book) => {
    if (isDisallowedLatest(book)) return false;
    if (!booksShareWork(current, book)) return false;
    return !shouldKeepAsSeparateLanguageEditions(current, book);
  });
  const summaries = [current, ...matched].filter(
    (book) => !isDisallowedLatest(book) || book.id === current.id
  );
  const pool = summaries.filter((book) => !isDisallowedLatest(book));
  const fromSummaries = (pool.length > 0 ? pool : summaries).reduce(
    (best, book) => pickLatestEdition(best, book)
  );
  const preferredRef = pickPreferredEdition(
    collectWorkEditionRefs(...(pool.length > 0 ? pool : summaries)).filter(
      (ref) => !isDisallowedLatest(ref)
    )
  );
  const preferred = preferredRef
    ? pickLatestEdition(fromSummaries, refAsSummary(preferredRef, current))
    : fromSummaries;

  const id = preferred.id || current.id;
  if (isBannedLatestEditionId(id)) {
    return { id: current.id, year: normalizePublishedYear(current.publishedYear) };
  }

  return {
    id,
    year:
      normalizePublishedYear(preferred.publishedYear) ??
      latestPublishedYear(pool.length > 0 ? pool : summaries) ??
      normalizePublishedYear(current.latestEditionYear) ??
      normalizePublishedYear(current.publishedYear),
  };
}

/** Newest covered printing in the same work as `current`, from a search page. */
export function latestCoveredEditionId(
  current: BookSummary,
  siblings: BookSummary[]
): string {
  return resolveLatestEditionTarget(current, siblings).id;
}

/** First published YEAR → earliest edition, carrying `q` and `fy`. */
export function firstPublishedHref(
  firstEditionId: string,
  query: string,
  firstYear: number
): string {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  params.set("fy", String(firstYear));
  return `/books/${encodeURIComponent(firstEditionId)}?${params.toString()}`;
}

/** Latest edition YEAR → newest English covered id. Never includes `fy`. */
export function latestEditionHref(latestEditionId: string, query: string): string {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  const qs = params.toString();
  return `/books/${encodeURIComponent(latestEditionId)}${qs ? `?${qs}` : ""}`;
}

/**
 * Latest edition link target when it is a different book than first published
 * (and, on the detail page, different from the tome already open).
 */
export function distinctLatestEdition(input: {
  latestId: string | null | undefined;
  latestYear: number | null | undefined;
  firstEditionId: string | null | undefined;
  currentBookId?: string | null;
}): { id: string; year: number } | null {
  const latestId = input.latestId?.trim() ?? "";
  const firstId = input.firstEditionId?.trim() ?? "";
  const year = normalizePublishedYear(input.latestYear);
  if (!latestId || year == null) return null;
  if (isBannedLatestEditionId(latestId)) return null;
  if (firstId && latestId === firstId) return null;
  const current = input.currentBookId?.trim();
  if (current && latestId === current) return null;
  return { id: latestId, year };
}

/** Prefer a resolved latest id, then a catalog latest, never the first/work id. */
export function preferDistinctLatestId(
  resolvedId: string | null | undefined,
  knownLatestId: string | null | undefined,
  firstEditionId: string
): string | null {
  const first = firstEditionId.trim();
  for (const candidate of [resolvedId, knownLatestId]) {
    const id = candidate?.trim() ?? "";
    if (!id) continue;
    if (first && id === first) continue;
    if (isBannedLatestEditionId(id)) continue;
    return id;
  }
  return null;
}
