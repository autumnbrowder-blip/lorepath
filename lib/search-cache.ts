import type { BookSearchResult, BookSummary } from "@/types/book";
import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import os from "os";
import path from "path";

/**
 * Short in-memory + JSON-file cache for browse search pages (10 minutes).
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
  warning?: string | null;
};

export type CachedSearchPage = Omit<SearchCacheEntry, "expiresAt">;

/** Ten minutes — GET /api/books/search is keyed on q + page. */
const TTL_MS = 10 * 60 * 1000;
/** Brief merged-page TTL when Google 429/403 so we still serve OL, then retry. */
export const SEARCH_PAGE_429_TTL_MS = 60_000;
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
  const q = input.query.trim().toLowerCase();
  const page = Math.max(1, input.page);
  const mode = input.mode ?? "text";
  return `v=browse-q12|q=${q}|page=${page}|mode=${mode}`;
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
  value: CachedSearchPage,
  ttlMs: number = TTL_MS
): void {
  if (value.books.length === 0) return;
  const query = value.query.trim();
  if (!query) return;
  const keyQuery = key.match(/\|q=([^|]+)\|/)?.[1] ?? "";
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
