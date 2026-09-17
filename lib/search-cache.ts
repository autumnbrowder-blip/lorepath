import type { BookSearchResult, BookSummary } from "@/types/book";
import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import os from "os";
import path from "path";

/**
 * Short in-memory + JSON-file cache for browse search pages (15 minutes).
 * Key is always `search:${normalizedQuery}:p${page}` (plus `:genre` in genre
 * mode). Never a single "search"/"last" slot. Callers always get a cloned
 * books array so one query cannot mutate another.
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
  warning?: string | null;
};

export type CachedSearchPage = Omit<SearchCacheEntry, "expiresAt">;

/** Fifteen minutes per query+page key — including Google 429 / DISABLE_BOOKS_REST. */
const TTL_MS = 15 * 60 * 1000;
/** @deprecated Same as the 15-minute per-key TTL. */
export const SEARCH_PAGE_429_TTL_MS = TTL_MS;
const MAX_ENTRIES = 80;

const cache = new Map<string, SearchCacheEntry>();
/** In-flight pages keyed by searchCacheKey — never shared across different q. */
const inFlight = new Map<string, Promise<CachedSearchPage>>();
const SEARCH_CACHE_DIR = path.join(os.tmpdir(), "lorepath-search");

function searchCacheFile(key: string): string {
  const hash = createHash("sha1").update(key).digest("hex");
  return path.join(SEARCH_CACHE_DIR, `${hash}.json`);
}

function readSearchFile(key: string): SearchCacheEntry | null {
  try {
    const raw = readFileSync(searchCacheFile(key), "utf8");
    const parsed = JSON.parse(raw) as SearchCacheEntry;
    if (!parsed || typeof parsed.expiresAt !== "number") return null;
    if (!Array.isArray(parsed.books) || parsed.books.length === 0) return null;
    if (typeof parsed.query !== "string" || !parsed.query.trim()) return null;
    const keyQuery = queryFromSearchCacheKey(key);
    if (keyQuery && parsed.query.trim().toLowerCase() !== keyQuery) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSearchFile(key: string, entry: SearchCacheEntry): void {
  try {
    if (!existsSync(SEARCH_CACHE_DIR)) {
      mkdirSync(SEARCH_CACHE_DIR, { recursive: true });
    }
    writeFileSync(searchCacheFile(key), JSON.stringify(entry), "utf8");
  } catch {
    /* /tmp may be missing or read-only — memory cache still applies. */
  }
}

export function searchCacheKey(input: {
  query: string;
  page: number;
  mode?: string;
}): string {
  const normalizedQuery = input.query.trim().toLowerCase();
  const page = Math.max(1, input.page);
  const key = `search:${normalizedQuery}:p${page}`;
  return input.mode === "genre" ? `${key}:genre` : key;
}

function queryFromSearchCacheKey(key: string): string {
  const match = key.match(/^search:(.+):p\d+(?::genre)?$/);
  return match?.[1]?.toLowerCase() ?? "";
}

function cloneBooks(books: BookSummary[]): BookSummary[] {
  return books.map((book) => ({
    ...book,
    authors: Array.isArray(book.authors) ? [...book.authors] : book.authors,
    genres: Array.isArray(book.genres) ? [...book.genres] : book.genres,
  }));
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
    warning: value.warning ?? null,
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
  let entry = cache.get(key) ?? null;
  if (!entry) {
    const fromFile = readSearchFile(key);
    if (fromFile) {
      cache.set(key, fromFile);
      entry = fromFile;
    }
  }
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    cache.delete(key);
    return null;
  }
  if (entry.books.length === 0) {
    cache.delete(key);
    return null;
  }
  const stored = entry.query.trim().toLowerCase();
  const keyQuery = queryFromSearchCacheKey(key);
  if (keyQuery && stored !== keyQuery) {
    cache.delete(key);
    return null;
  }
  if (expectedQuery != null) {
    const wanted = expectedQuery.trim().toLowerCase();
    if (!wanted || stored !== wanted) {
      cache.delete(key);
      return null;
    }
  }
  return clonePage(entry);
}

export function setCachedSearchPage(
  key: string,
  value: CachedSearchPage,
  ttlMs: number = TTL_MS
): void {
  if (value.books.length === 0) return;
  const query = value.query.trim();
  if (!query) return;
  const keyQuery = queryFromSearchCacheKey(key);
  if (keyQuery && keyQuery !== query.toLowerCase()) return;

  const now = Date.now();
  pruneExpired(now);
  const entry: SearchCacheEntry = {
    ...clonePage({ ...value, query }),
    expiresAt: now + ttlMs,
  };
  cache.set(key, entry);
  writeSearchFile(key, entry);
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
