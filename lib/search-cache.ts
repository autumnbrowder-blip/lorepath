import type { BookSearchResult, BookSummary } from "@/types/book";

/**
 * Short in-memory cache for browse search pages (a few minutes).
 * User-specific Inscribed data is reapplied after a hit — never stored here.
 */
type SearchCacheEntry = {
  expiresAt: number;
  books: BookSummary[];
  sources: BookSearchResult["sources"];
  sourceCounts: BookSearchResult["sourceCounts"];
  source: BookSearchResult["source"];
  page: number;
  hasMore: boolean;
  descriptionSources?: Record<string, string>;
  googleError?: BookSearchResult["googleError"];
  googleRawCount?: number;
};

const TTL_MS = 180_000;
const MAX_ENTRIES = 80;

const cache = new Map<string, SearchCacheEntry>();

export function searchCacheKey(input: {
  query: string;
  page: number;
  mode?: string;
}): string {
  return `${input.mode ?? "text"}:${input.page}:${input.query.trim().toLowerCase()}`;
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
  key: string
): Omit<SearchCacheEntry, "expiresAt"> | null {
  const now = Date.now();
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    cache.delete(key);
    return null;
  }
  return {
    books: entry.books.map((book) => ({ ...book })),
    sources: entry.sources,
    sourceCounts: { ...entry.sourceCounts },
    source: entry.source,
    page: entry.page,
    hasMore: entry.hasMore,
    descriptionSources: entry.descriptionSources
      ? { ...entry.descriptionSources }
      : undefined,
    googleError: entry.googleError ?? null,
    googleRawCount: entry.googleRawCount,
  };
}

export function setCachedSearchPage(
  key: string,
  value: Omit<SearchCacheEntry, "expiresAt">
): void {
  const now = Date.now();
  pruneExpired(now);
  cache.set(key, {
    ...value,
    books: value.books.map((book) => ({ ...book })),
    expiresAt: now + TTL_MS,
  });
}
