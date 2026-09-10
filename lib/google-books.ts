import {
  cleanAuthors,
  cleanDescription,
  cleanTitle,
  dedupeBooks,
  isLowQualityBook,
  keepProviderSubjects,
  parsePublishedYear,
  repairSearchQuery,
} from "@/lib/book-utils";
import { normalizeGoogleCoverUrl } from "@/lib/cover-resolve";
import { parseUtf8Json } from "@/lib/utf8-json";
import {
  GENRE_PAGE_SIZE,
  isGenreSearchMode,
  toGoogleSubjectQuery,
  type SearchBooksOptions,
} from "@/lib/genre-search";
import type { BookDetail, BookSummary } from "@/types/book";
import type {
  GoogleBooksSearchResponse,
  GoogleBooksVolumeResponse,
} from "@/types/google-books";

export class RateLimitError extends Error {
  status: number;

  constructor(message = "Google Books rate limit reached.", status = 429) {
    super(message);
    this.name = "RateLimitError";
    this.status = status;
  }
}

export type GoogleBooksProviderError = {
  message: string;
  status?: number;
};

const FETCH_TIMEOUT_MS = 3000;
const GOOGLE_PAGE_SIZE = 20;
/** Successful Google search pages — keyed by query + page. */
const GOOGLE_SEARCH_TTL_MS = 15 * 60 * 1000;
/** Successful volume / ISBN lookups. */
const GOOGLE_VOLUME_TTL_MS = 24 * 60 * 60 * 1000;
/** 429/403 must not occupy the 15-min success slot. */
const GOOGLE_NEGATIVE_CACHE_TTL_MS = 60_000;
/**
 * Process-wide skip after 429/403 so concurrent search/detail cannot turn
 * one quota error into thousands of retries.
 */
const GOOGLE_QUOTA_COOLDOWN_MS = 3 * 60 * 1000;
const GOOGLE_SEARCH_CACHE_MAX = 80;
const GOOGLE_VOLUME_CACHE_MAX = 200;

let googleQuotaUntil = 0;

const googleHttpStats = {
  200: 0,
  403: 0,
  429: 0,
  skip: 0,
};

function isGoogleQuotaStatus(status: number | undefined): boolean {
  return status === 429 || status === 403;
}

function isGoogleQuotaCircuitOpen(): boolean {
  return Date.now() < googleQuotaUntil;
}

export function isGoogleBooksBusy(): boolean {
  return isGoogleQuotaCircuitOpen();
}

export function hasGoogleBooksApiKey(): boolean {
  return Boolean(getGoogleBooksApiKey());
}

function openGoogleQuotaCircuit() {
  googleQuotaUntil = Date.now() + GOOGLE_QUOTA_COOLDOWN_MS;
}

function getGoogleBooksApiKey(): string | null {
  const key = process.env.GOOGLE_BOOKS_API_KEY?.trim();
  return key || null;
}

function logGoogleHttpStats() {
  console.info(
    `[google-books] status 200=${googleHttpStats[200]} 403=${googleHttpStats[403]} 429=${googleHttpStats[429]} skip=${googleHttpStats.skip}`
  );
}

function recordGoogleHttpStatus(status: number) {
  if (status === 200) googleHttpStats[200] += 1;
  else if (status === 403) googleHttpStats[403] += 1;
  else if (status === 429) googleHttpStats[429] += 1;
  if (status === 200 || isGoogleQuotaStatus(status)) {
    logGoogleHttpStats();
  }
}

function recordGoogleSkip(reason: string) {
  googleHttpStats.skip += 1;
  console.info(`[google-books] skip reason=${reason}`);
  logGoogleHttpStats();
}

function normalizeCoverUrl(url: string | undefined): string | null {
  if (!url) return null;
  return normalizeGoogleCoverUrl(url);
}

function getIsbn(identifiers?: { type: string; identifier: string }[]): string | null {
  if (!identifiers) return null;
  const isbn13 = identifiers.find((id) => id.type === "ISBN_13");
  if (isbn13) return isbn13.identifier;
  const isbn10 = identifiers.find((id) => id.type === "ISBN_10");
  return isbn10?.identifier ?? null;
}

function buildGoogleBooksUrl(path: string, params?: URLSearchParams): string {
  const url = new URL(`https://www.googleapis.com/books/v1/${path}`);
  if (params) {
    params.forEach((value, key) => url.searchParams.set(key, value));
  }

  const apiKey = getGoogleBooksApiKey();
  if (apiKey) {
    url.searchParams.set("key", apiKey);
  }

  return url.toString();
}

async function readGoogleErrorBody(
  response: Response
): Promise<string | null> {
  try {
    const body = (await parseUtf8Json(response)) as {
      error?: { message?: string; status?: string };
    };
    return body.error?.message?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * The only Google Books HTTP helper. Never retries 429/403.
 * Callers must skip when the key is missing or the quota circuit is open.
 */
async function fetchGoogleBooks(
  url: string,
  options?: { revalidate?: number; noStore?: boolean }
): Promise<Response> {
  if (!getGoogleBooksApiKey()) {
    recordGoogleSkip("no-key");
    const error = new Error(
      "Google Books skipped: GOOGLE_BOOKS_API_KEY is not set"
    );
    (error as Error & { status?: number }).status = 0;
    throw error;
  }

  if (isGoogleQuotaCircuitOpen()) {
    recordGoogleSkip("quota-circuit");
    throw new RateLimitError();
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    // Await the full response headers before clearing the timeout so a slow
    // but successful request is never aborted mid-flight after resolve.
    const response = await fetch(
      url,
      options?.noStore
        ? { cache: "no-store", signal: controller.signal }
        : {
            cache: "force-cache",
            next: { revalidate: options?.revalidate ?? 86400 },
            signal: controller.signal,
          }
    );
    recordGoogleHttpStatus(response.status);
    if (isGoogleQuotaStatus(response.status)) {
      openGoogleQuotaCircuit();
    }
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

function toProviderError(
  error: unknown,
  fallbackStatus?: number
): GoogleBooksProviderError {
  if (error instanceof RateLimitError) {
    return { message: error.message, status: error.status };
  }

  if (error instanceof Error) {
    const aborted =
      error.name === "AbortError" ||
      /aborted|abort/i.test(error.message);
    return {
      message: aborted
        ? `Google Books request timed out after ${FETCH_TIMEOUT_MS}ms`
        : error.message,
      status: fallbackStatus,
    };
  }

  return { message: String(error), status: fallbackStatus };
}

export function parseGoogleBooksResponse(
  data: GoogleBooksSearchResponse
): BookSummary[] {
  if (!data.items) return [];

  return data.items
    .map((item) => ({
      id: item.id,
      title: cleanTitle(item.volumeInfo.title),
      authors: cleanAuthors(item.volumeInfo.authors ?? []),
      coverUrl: normalizeCoverUrl(
        item.volumeInfo.imageLinks?.thumbnail ??
          item.volumeInfo.imageLinks?.smallThumbnail
      ),
      description: cleanDescription(item.volumeInfo.description),
      genres: keepProviderSubjects(item.volumeInfo.categories ?? []),
      publishedYear: parsePublishedYear(item.volumeInfo.publishedDate),
      source: "google" as const,
      isbn: getIsbn(item.volumeInfo.industryIdentifiers),
      pageCount: item.volumeInfo.pageCount ?? null,
      language: item.volumeInfo.language?.trim() || null,
    }))
    .filter((book) => !isLowQualityBook(book));
}

export function parseGoogleBookDetail(
  data: GoogleBooksVolumeResponse
): BookDetail {
  const { volumeInfo } = data;

  return {
    id: data.id,
    title: cleanTitle(volumeInfo.title),
    authors: cleanAuthors(volumeInfo.authors ?? []),
    description: cleanDescription(volumeInfo.description),
    coverUrl: normalizeCoverUrl(
      volumeInfo.imageLinks?.large ??
        volumeInfo.imageLinks?.medium ??
        volumeInfo.imageLinks?.thumbnail ??
        volumeInfo.imageLinks?.smallThumbnail
    ),
    genres: keepProviderSubjects(volumeInfo.categories ?? []),
    publishedYear: parsePublishedYear(volumeInfo.publishedDate),
    source: "google",
    publisher: volumeInfo.publisher?.trim() || null,
    pageCount: volumeInfo.pageCount ?? null,
    language: volumeInfo.language ?? null,
    isbn: getIsbn(volumeInfo.industryIdentifiers),
  };
}

export type GoogleBooksPageResult = {
  books: BookSummary[];
  hasMore: boolean;
  /** Item count from Google before local quality filtering. */
  rawCount: number;
  error: GoogleBooksProviderError | null;
  /** Google HTTP status for this page: 200, 403, 429, or null when skipped. */
  httpStatus?: number | null;
};

type CachedGoogleSearch = {
  expiresAt: number;
  page: GoogleBooksPageResult;
  kind: "success" | "rate_limit";
};

const googleSearchCache = new Map<string, CachedGoogleSearch>();

function googleSearchCacheKey(
  query: string,
  page: number,
  options?: { mode?: string; pageSize?: number; langRestrict?: string }
): string {
  const q = query.trim().toLowerCase();
  const p = Math.max(1, page);
  const mode = options?.mode ?? "text";
  const pageSize = options?.pageSize ?? "";
  const lang = options?.langRestrict?.trim() ?? "";
  return `v=google-q2|q=${q}|page=${p}|mode=${mode}|ps=${pageSize}|lang=${lang}`;
}

function cloneGooglePage(page: GoogleBooksPageResult): GoogleBooksPageResult {
  return {
    books: page.books.map((book) => ({ ...book })),
    hasMore: page.hasMore,
    rawCount: page.rawCount,
    error: page.error ? { ...page.error } : null,
    httpStatus: page.httpStatus,
  };
}

function pruneGoogleSearchCache(now: number) {
  for (const [key, entry] of Array.from(googleSearchCache.entries())) {
    if (entry.expiresAt <= now) googleSearchCache.delete(key);
  }
  if (googleSearchCache.size <= GOOGLE_SEARCH_CACHE_MAX) return;
  const overflow = googleSearchCache.size - GOOGLE_SEARCH_CACHE_MAX;
  const keys = Array.from(googleSearchCache.keys()).slice(0, overflow);
  for (const key of keys) googleSearchCache.delete(key);
}

function getCachedGoogleSearch(key: string): CachedGoogleSearch | null {
  const now = Date.now();
  const entry = googleSearchCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    googleSearchCache.delete(key);
    return null;
  }
  return { ...entry, page: cloneGooglePage(entry.page) };
}

function setCachedGoogleSearch(
  key: string,
  page: GoogleBooksPageResult,
  kind: CachedGoogleSearch["kind"]
) {
  const now = Date.now();
  pruneGoogleSearchCache(now);
  const ttl =
    kind === "rate_limit" ? GOOGLE_NEGATIVE_CACHE_TTL_MS : GOOGLE_SEARCH_TTL_MS;
  googleSearchCache.set(key, {
    expiresAt: now + ttl,
    page: cloneGooglePage(page),
    kind,
  });
}

type CachedGoogleVolume = {
  expiresAt: number;
  book: BookDetail | null;
  kind: "success" | "miss" | "rate_limit";
};

const googleVolumeCache = new Map<string, CachedGoogleVolume>();

function pruneGoogleVolumeCache(now: number) {
  for (const [key, entry] of Array.from(googleVolumeCache.entries())) {
    if (entry.expiresAt <= now) googleVolumeCache.delete(key);
  }
  if (googleVolumeCache.size <= GOOGLE_VOLUME_CACHE_MAX) return;
  const overflow = googleVolumeCache.size - GOOGLE_VOLUME_CACHE_MAX;
  const keys = Array.from(googleVolumeCache.keys()).slice(0, overflow);
  for (const key of keys) googleVolumeCache.delete(key);
}

function getCachedGoogleVolume(key: string): CachedGoogleVolume | null {
  const now = Date.now();
  const entry = googleVolumeCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    googleVolumeCache.delete(key);
    return null;
  }
  return {
    ...entry,
    book: entry.book ? { ...entry.book } : null,
  };
}

function setCachedGoogleVolume(
  key: string,
  book: BookDetail | null,
  kind: CachedGoogleVolume["kind"]
) {
  const now = Date.now();
  pruneGoogleVolumeCache(now);
  const ttl =
    kind === "rate_limit" ? GOOGLE_NEGATIVE_CACHE_TTL_MS : GOOGLE_VOLUME_TTL_MS;
  googleVolumeCache.set(key, {
    expiresAt: now + ttl,
    book: book ? { ...book } : null,
    kind,
  });
}

function quotaBlockedPage(status: number, message: string): GoogleBooksPageResult {
  return {
    books: [],
    hasMore: false,
    rawCount: 0,
    httpStatus: status,
    error: { message, status },
  };
}

function skippedPage(message: string): GoogleBooksPageResult {
  return {
    books: [],
    hasMore: false,
    rawCount: 0,
    httpStatus: null,
    error: { message },
  };
}

async function throwIfQuotaResponse(
  response: Response,
  context: string
): Promise<void> {
  if (!isGoogleQuotaStatus(response.status)) return;
  const bodyMessage = await readGoogleErrorBody(response);
  const message =
    bodyMessage ??
    (response.status === 403
      ? "Google Books API key rejected."
      : "Google Books rate limit reached.");
  console.warn(`[${context}] ${response.status} — using other archives`, {
    status: response.status,
    message: bodyMessage,
  });
  throw new RateLimitError(message, response.status);
}

async function fetchGoogleSearch(
  query: string,
  page = 1,
  options?: SearchBooksOptions & {
    pageSize?: number;
    /** Google Books langRestrict (e.g. `en`). */
    langRestrict?: string;
  }
): Promise<{
  books: BookSummary[];
  totalItems: number;
  pageSize: number;
  rawCount: number;
  httpStatus: number;
}> {
  const genreMode = isGenreSearchMode(options?.mode);
  const pageSize = Math.min(
    40,
    options?.pageSize ?? (genreMode ? GENRE_PAGE_SIZE : GOOGLE_PAGE_SIZE)
  );

  const searchQuery = repairSearchQuery(
    genreMode ? toGoogleSubjectQuery(query) : query
  );

  const startIndex = Math.max(0, (page - 1) * pageSize);
  const params = new URLSearchParams({
    q: searchQuery,
    maxResults: String(pageSize),
    startIndex: String(startIndex),
    printType: "books",
    orderBy: genreMode ? "newest" : "relevance",
  });
  if (options?.langRestrict?.trim()) {
    params.set("langRestrict", options.langRestrict.trim());
  }

  const url = buildGoogleBooksUrl("volumes", params);
  // Search must never reuse a Data Cache entry from a previous q.
  const response = await fetchGoogleBooks(url, { noStore: true });

  await throwIfQuotaResponse(response, "searchGoogleBooks");

  if (!response.ok) {
    const bodyMessage = await readGoogleErrorBody(response);
    const error = new Error(
      bodyMessage ?? `Google Books API error: ${response.status}`
    );
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  const data: GoogleBooksSearchResponse = await parseUtf8Json(response);
  const rawCount = data.items?.length ?? 0;
  const books = parseGoogleBooksResponse(data);
  return {
    books,
    totalItems: data.totalItems ?? books.length,
    pageSize,
    rawCount,
    httpStatus: response.status,
  };
}

export async function searchGoogleBooks(
  query: string,
  page = 1,
  options?: SearchBooksOptions & {
    langRestrict?: string;
    pageSize?: number;
  }
): Promise<GoogleBooksPageResult> {
  const cacheKey = googleSearchCacheKey(query, page, options);
  const cached = getCachedGoogleSearch(cacheKey);
  if (cached) {
    return cached.page;
  }

  if (!getGoogleBooksApiKey()) {
    recordGoogleSkip("no-key");
    console.warn(
      "[searchGoogleBooks] GOOGLE_BOOKS_API_KEY is not set — skipping Google."
    );
    const skipped = skippedPage("Google Books API key is not set");
    setCachedGoogleSearch(cacheKey, skipped, "rate_limit");
    return skipped;
  }

  if (isGoogleQuotaCircuitOpen()) {
    recordGoogleSkip("quota-circuit");
    const blocked: GoogleBooksPageResult = {
      ...skippedPage("Google Books rate limit reached."),
      error: {
        message: "Google Books rate limit reached.",
        status: 429,
      },
    };
    setCachedGoogleSearch(cacheKey, blocked, "rate_limit");
    return blocked;
  }

  try {
    const { books, totalItems, pageSize, rawCount, httpStatus } =
      await fetchGoogleSearch(query, page, options);

    // Use requested page size so filtered-out items don't keep advertising
    // endless "Load More" pages.
    const startIndex = (page - 1) * pageSize;
    const hasMore = startIndex + pageSize < totalItems;

    if (process.env.SEARCH_DEBUG === "1") {
      if (rawCount > 0 && books.length === 0) {
        console.info(
          "[searchGoogleBooks] API returned items but all were filtered as low quality.",
          { query, page, mode: options?.mode, totalItems, pageSize, rawCount }
        );
      } else if (totalItems === 0) {
        console.info("[searchGoogleBooks] API returned 0 totalItems.", {
          query,
          page,
          mode: options?.mode,
          pageSize,
        });
      }
    }

    const success: GoogleBooksPageResult = {
      books: dedupeBooks(books),
      hasMore,
      rawCount,
      error: null,
      httpStatus,
    };
    setCachedGoogleSearch(cacheKey, success, "success");
    return success;
  } catch (error) {
    const providerError = toProviderError(
      error,
      error instanceof Error
        ? (error as Error & { status?: number }).status
        : undefined
    );

    if (error instanceof RateLimitError || isGoogleQuotaStatus(providerError.status)) {
      const status = providerError.status === 403 ? 403 : 429;
      console.warn(
        `[searchGoogleBooks] ${status} — using other archives`
      );
      const blocked = quotaBlockedPage(
        status,
        providerError.message || "Google Books rate limit reached."
      );
      setCachedGoogleSearch(cacheKey, blocked, "rate_limit");
      return blocked;
    }

    console.error("[searchGoogleBooks] Request failed:", {
      query,
      page,
      mode: options?.mode,
      ...providerError,
    });

    // Soft-fail so Promise.allSettled siblings still surface results.
    // Do not cache other errors as a 15-min Google success.
    return {
      books: [],
      hasMore: false,
      rawCount: 0,
      error: providerError,
      httpStatus: providerError.status ?? null,
    };
  }
}

export async function getGoogleBookById(
  volumeId: string
): Promise<BookDetail | null> {
  const trimmed = volumeId.trim();
  if (!trimmed) return null;

  const cacheKey = `id:${trimmed.toLowerCase()}`;
  const cached = getCachedGoogleVolume(cacheKey);
  if (cached) {
    if (cached.kind === "rate_limit") {
      throw new RateLimitError(
        "Google Books rate limit reached.",
        429
      );
    }
    return cached.book;
  }

  if (!getGoogleBooksApiKey()) {
    recordGoogleSkip("no-key");
    return null;
  }

  if (isGoogleQuotaCircuitOpen()) {
    recordGoogleSkip("quota-circuit");
    throw new RateLimitError();
  }

  try {
    // Encode so hyphenated Google volume ids (e.g. E-OLEAAAQBAJ) stay intact.
    const response = await fetchGoogleBooks(
      buildGoogleBooksUrl(`volumes/${encodeURIComponent(trimmed)}`),
      { noStore: true }
    );

    await throwIfQuotaResponse(response, "getGoogleBookById");

    if (response.status === 404) {
      console.warn("[getGoogleBookById] volume not found:", { volumeId: trimmed });
      setCachedGoogleVolume(cacheKey, null, "miss");
      return null;
    }

    if (!response.ok) {
      const bodyMessage = await readGoogleErrorBody(response);
      console.error("[getGoogleBookById] API error:", {
        volumeId: trimmed,
        status: response.status,
        message: bodyMessage,
      });
      throw new Error(
        bodyMessage ?? `Google Books API error: ${response.status}`
      );
    }

    const data: GoogleBooksVolumeResponse = await parseUtf8Json(response);
    const book = parseGoogleBookDetail(data);
    setCachedGoogleVolume(cacheKey, book, "success");
    return book;
  } catch (error) {
    if (error instanceof RateLimitError) {
      setCachedGoogleVolume(cacheKey, null, "rate_limit");
    }
    throw error;
  }
}

/** Look up a Google Books volume by ISBN. Search/NYT/cards must not call this. */
export async function getGoogleBookByIsbn(
  isbn: string
): Promise<BookDetail | null> {
  const digits = isbn.replace(/\D/g, "");
  if (!digits) return null;

  const cacheKey = `isbn:${digits}`;
  const cached = getCachedGoogleVolume(cacheKey);
  if (cached) {
    if (cached.kind === "rate_limit") {
      throw new RateLimitError(
        "Google Books rate limit reached.",
        429
      );
    }
    return cached.book;
  }

  if (!getGoogleBooksApiKey()) {
    recordGoogleSkip("no-key");
    return null;
  }

  if (isGoogleQuotaCircuitOpen()) {
    recordGoogleSkip("quota-circuit");
    throw new RateLimitError();
  }

  const params = new URLSearchParams({
    q: `isbn:${digits}`,
    maxResults: "1",
    printType: "books",
  });

  try {
    const response = await fetchGoogleBooks(
      buildGoogleBooksUrl("volumes", params),
      { noStore: true }
    );

    await throwIfQuotaResponse(response, "getGoogleBookByIsbn");

    if (!response.ok) {
      const bodyMessage = await readGoogleErrorBody(response);
      throw new Error(
        bodyMessage ?? `Google Books API error: ${response.status}`
      );
    }

    const data: GoogleBooksSearchResponse = await parseUtf8Json(response);
    const volume = data.items?.[0];
    if (!volume) {
      setCachedGoogleVolume(cacheKey, null, "miss");
      return null;
    }

    const book = parseGoogleBookDetail(volume as GoogleBooksVolumeResponse);
    setCachedGoogleVolume(cacheKey, book, "success");
    return book;
  } catch (error) {
    if (error instanceof RateLimitError) {
      setCachedGoogleVolume(cacheKey, null, "rate_limit");
    }
    throw error;
  }
}
