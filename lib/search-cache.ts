import type { BookSearchResult, BookSummary } from "@/types/book";

/**
 * Short in-memory cache for browse search pages (a few minutes).
 * User-specific Inscribed data is reapplied after a hit — never stored here.
 * Every entry is keyed by exact query + page + mode. Callers always receive
 * cloned book arrays so overlapping requests cannot mutate a shared page.
 */
type SearchCacheEntry = {
  expiresAt: number;
  /** Exact search string that produced this page (trimmed). */
  query: string;
  books: BookSummary[];
  sources: BookSearchResult["sources"];
  sourceCounts: BookSearchResult["sourceCounts"];
  source: BookSearchResult["source"];
  page: number;
  hasMore: boolean;
  descriptionSources?: Record<string, string>;
  googleError?: BookSearchResult["googleError"];
  googleRawCount?: number;
  allSourcesTimedOut?: boolean;
};

export type CachedSearchPage = Omit<SearchCacheEntry, "expiresAt">;

/** Five minutes — GET /api/books/search is keyed on q + page. */
const TTL_MS = 300_000;
const MAX_ENTRIES = 80;

const cache = new Map<string, SearchCacheEntry>();
/** In-flight pages keyed by searchCacheKey — never shared across different q. */
const inFlight = new Map<string, Promise<CachedSearchPage>>();

export function searchCacheKey(input: {
  query: string;
  page: number;
  mode?: string;
}): string {
  const q = input.query.trim().toLowerCase();
  const page = Math.max(1, input.page);
  const mode = input.mode ?? "text";
  return `v=browse-q8|q=${q}|page=${page}|mode=${mode}`;
}

function cloneBooks(books: BookSummary[]): BookSummary[] {
  return books.map((book) => ({ ...book }));
}

function clonePage(value: CachedSearchPage): CachedSearchPage {
  return {
    query: value.query,
    books: cloneBooks(value.books),
    sources: value.sources ? [...value.sources] : value.sources,
    sourceCounts: { ...value.sourceCounts },
    source: value.source,
    page: value.page,
    hasMore: value.hasMore,
    descriptionSources: value.descriptionSources
      ? { ...value.descriptionSources }
      : undefined,
    googleError: value.googleError ?? null,
    googleRawCount: value.googleRawCount,
    allSourcesTimedOut: value.allSourcesTimedOut,
  };
}

function pruneExpired(now: number) {
  for (const [key, entry] of Array.from(cache.entries())) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
  // Bound memory if traffic is bursty.
  if (cache.size <= MAX_ENTRIES) return;
  const overflow = cache.size - MAX_ENTRIES;
  const keys = Array.from(cache.keys()).slice(0, overflow);
  for (const key of keys) cache.delete(key);
}

export function getCachedSearchPage(
  key: string,
  expectedQuery?: string
): CachedSearchPage | null {
  const now = Date.now();
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    cache.delete(key);
    return null;
  }
  if (entry.books.length === 0) {
    cache.delete(key);
    return null;
  }
  if (expectedQuery != null) {
    const wanted = expectedQuery.trim().toLowerCase();
    const stored = entry.query.trim().toLowerCase();
    if (!wanted || stored !== wanted) {
      cache.delete(key);
      return null;
    }
  }
  return clonePage(entry);
}

export function setCachedSearchPage(
  key: string,
  value: CachedSearchPage
): void {
  if (value.books.length === 0) return;
  const query = value.query.trim();
  if (!query) return;
  const keyQuery = key.match(/\|q=([^|]+)\|/)?.[1] ?? "";
  if (keyQuery && keyQuery !== query.toLowerCase()) return;

  const now = Date.now();
  pruneExpired(now);
  cache.set(key, {
    ...clonePage({ ...value, query }),
    expiresAt: now + TTL_MS,
  });
}

/**
 * Share one in-flight fetch for the same q+page. Different queries never
 * reuse this promise. The stored page is cloned for every waiter.
 */
export function getInFlightSearch(
  key: string
): Promise<CachedSearchPage> | undefined {
  return inFlight.get(key);
}

export function setInFlightSearch(
  key: string,
  pending: Promise<CachedSearchPage>
): void {
  inFlight.set(key, pending);
}

export function clearInFlightSearch(key: string): void {
  inFlight.delete(key);
}

export function cloneCachedSearchPage(page: CachedSearchPage): CachedSearchPage {
  return clonePage(page);
}
