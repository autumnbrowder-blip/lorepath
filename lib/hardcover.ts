import { finalizeBookTags } from "@/lib/book-tags";
import {
  bookIsbnKey,
  persistHardcoverCache,
  readHardcoverRowCache,
} from "@/lib/book-cache";
import {
  cleanDescription,
  isWeakDescription,
  parsePublishedYear,
} from "@/lib/book-utils";
import type { BookDetail, BookSummary } from "@/types/book";

/**
 * Hardcover.app — cached, detail-only enricher.
 * HARDCOVER_API_TOKEN is server-only (never NEXT_PUBLIC_).
 * Search / Load More / browse must never call this module's live fetch.
 */
export const HARDCOVER_API_TOKEN_ENV = "HARDCOVER_API_TOKEN";
const HARDCOVER_ENDPOINT = "https://api.hardcover.app/v1/graphql";
const FETCH_TIMEOUT_MS = 1800;
const HARDCOVER_ID_PREFIX = "hardcover-";
/** Hard cap is 5000; skip at 4500 so one Netlify instance cannot burn the day. */
const HARDCOVER_DAILY_CAP = 5000;
const HARDCOVER_DAILY_SKIP_AT = 4500;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type HardcoverSearchError = {
  reason:
    | "missing_token"
    | "empty_query"
    | "http_error"
    | "graphql_error"
    | "timeout"
    | "empty_results"
    | "parse_error"
    | "quota";
  status?: number;
  message?: string;
};

export type HardcoverBook = {
  id: string;
  title: string;
  authors: string[];
  description: string | null;
  coverUrl: string | null;
  publishedYear: number | null;
  pageCount: number | null;
  genres: string[];
  isbns: string[];
};

export type HardcoverPageResult = {
  books: BookSummary[];
  hasMore: boolean;
  error: HardcoverSearchError | null;
};

export type HardcoverCacheRecord = {
  title: string | null;
  description: string | null;
  coverUrl: string | null;
  tags: string[];
  year: number | null;
  cachedAt: number;
  empty: boolean;
};

const BOOK_SELECTION = `
  title
  description
  release_year
  cached_image
  cached_tags
  cached_contributors
`;

const ISBN13_QUERY = `query HardcoverByIsbn13($isbn: String!) {
  editions(where: { isbn_13: { _eq: $isbn } }, limit: 1) {
    isbn_13
    isbn_10
    book { ${BOOK_SELECTION} }
  }
}`;

const ISBN10_QUERY = `query HardcoverByIsbn10($isbn: String!) {
  editions(where: { isbn_10: { _eq: $isbn } }, limit: 1) {
    isbn_13
    isbn_10
    book { ${BOOK_SELECTION} }
  }
}`;

const TITLE_QUERY = `query HardcoverByTitle($query: String!) {
  search(query: $query, query_type: "Book", per_page: 3, page: 1) {
    results
  }
}`;

let quotaDay = "";
let quotaCount = 0;

const memoryCache = new Map<string, HardcoverCacheRecord>();
const inFlight = new Map<string, Promise<HardcoverCacheRecord | null>>();

export function isHardcoverConfigured(): boolean {
  return Boolean(hardcoverBearerToken());
}

export function isHardcoverId(id: string): boolean {
  return id.startsWith(HARDCOVER_ID_PREFIX);
}

function hardcoverBearerToken(): string | null {
  const raw = process.env[HARDCOVER_API_TOKEN_ENV]?.trim();
  if (!raw) return null;
  return raw.replace(/^bearer\s+/i, "").trim() || null;
}

function utcDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Before every Hardcover HTTP call: if today's UTC count is already at the
 * buffer, skip. Otherwise increment and allow the request.
 */
export function takeHardcoverQuotaSlot(): boolean {
  const day = utcDateKey();
  if (quotaDay !== day) {
    quotaDay = day;
    quotaCount = 0;
  }

  if (quotaCount >= HARDCOVER_DAILY_SKIP_AT) {
    console.info("hardcover_skipped_quota", {
      day,
      count: quotaCount,
      skipAt: HARDCOVER_DAILY_SKIP_AT,
      cap: HARDCOVER_DAILY_CAP,
    });
    return false;
  }

  quotaCount += 1;
  console.info("[hardcover] sent", {
    day,
    count: quotaCount,
    skipAt: HARDCOVER_DAILY_SKIP_AT,
    cap: HARDCOVER_DAILY_CAP,
  });
  return true;
}

function hardcoverCacheKey(isbn?: string | null, slug?: string | null): string | null {
  const isbnKey = bookIsbnKey(isbn);
  if (isbnKey) return `isbn:${isbnKey}`;
  const id = slug?.trim();
  if (id) return `slug:${id}`;
  return null;
}

function cacheFresh(entry: HardcoverCacheRecord | null | undefined): boolean {
  if (!entry) return false;
  return Date.now() - entry.cachedAt < CACHE_TTL_MS;
}

/** Cover + description + ≥2 tags already present — do not spend a Hardcover call. */
function alreadyCompleteFromGoogle(book: BookDetail): boolean {
  const hasCover = Boolean(book.coverUrl?.trim());
  const hasDescription =
    Boolean(book.description?.trim()) && !isWeakDescription(book.description);
  const tagCount = book.genres.filter((tag) => Boolean(tag?.trim())).length;
  return hasCover && hasDescription && tagCount >= 2;
}

export function peekHardcoverMemoryCache(
  isbn?: string | null,
  slug?: string | null
): HardcoverCacheRecord | null {
  try {
    const key = hardcoverCacheKey(isbn, slug);
    if (!key) return null;
    const entry = memoryCache.get(key);
    return cacheFresh(entry) ? entry ?? null : null;
  } catch (error) {
    console.error(
      "[book-detail]",
      slug ?? isbn ?? "hardcover-cache",
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}

/** Sync memory overlay only — never network, never throws. */
export function overlayHardcoverMemoryCache(book: BookDetail): BookDetail {
  try {
    const record = peekHardcoverMemoryCache(book.isbn, book.id);
    if (!record) return book;
    return applyHardcoverCache(book, record);
  } catch (error) {
    console.error(
      "[book-detail]",
      book.id,
      error instanceof Error ? error.message : String(error)
    );
    return book;
  }
}

function graphqlErrorMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const record = payload as {
    error?: unknown;
    message?: unknown;
    errors?: { message?: unknown }[];
  };
  const fromList = record.errors?.[0]?.message;
  if (typeof fromList === "string" && fromList.trim()) return fromList.trim();
  if (typeof record.error === "string" && record.error.trim()) {
    return record.error.trim();
  }
  if (typeof record.message === "string" && record.message.trim()) {
    return record.message.trim();
  }
  return undefined;
}

function textList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === "string") return entry.trim();
      if (entry && typeof entry === "object") {
        const record = entry as { name?: unknown; tag?: unknown; author?: { name?: unknown } };
        if (typeof record.tag === "string") return record.tag.trim();
        if (typeof record.name === "string") return record.name.trim();
        if (typeof record.author?.name === "string") return record.author.name.trim();
      }
      return "";
    })
    .filter(Boolean);
}

function coverFromCachedImage(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string" && /^https?:\/\//i.test(value.trim())) {
    return value.trim();
  }
  if (typeof value === "object") {
    const record = value as { url?: unknown; image?: { url?: unknown } };
    if (typeof record.url === "string" && record.url.trim()) return record.url.trim();
    if (typeof record.image?.url === "string" && record.image.url.trim()) {
      return record.image.url.trim();
    }
  }
  return null;
}

function tagsFromCachedTags(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const genre = record.Genre ?? record.genre ?? record.genres;
  if (Array.isArray(genre)) return textList(genre);
  const combined: string[] = [];
  for (const entry of Object.values(record)) {
    if (Array.isArray(entry)) combined.push(...textList(entry));
  }
  return combined;
}

function authorsFromContributors(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return "";
      const record = entry as {
        name?: unknown;
        author?: { name?: unknown };
        contributor?: { name?: unknown };
      };
      if (typeof record.author?.name === "string") return record.author.name.trim();
      if (typeof record.contributor?.name === "string") {
        return record.contributor.name.trim();
      }
      if (typeof record.name === "string") return record.name.trim();
      return "";
    })
    .filter(Boolean);
}

function readHits(results: unknown): Record<string, unknown>[] {
  let parsed = results;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }
  if (!parsed || typeof parsed !== "object") return [];
  const hits = (parsed as { hits?: unknown }).hits;
  if (!Array.isArray(hits)) return [];

  return hits
    .map((hit) => {
      if (!hit || typeof hit !== "object") return null;
      const document = (hit as { document?: unknown }).document;
      const record = (document ?? hit) as Record<string, unknown>;
      return typeof record === "object" ? record : null;
    })
    .filter((hit): hit is Record<string, unknown> => hit !== null);
}

function bookFromGraphqlRecord(
  record: Record<string, unknown>,
  isbns: string[] = []
): HardcoverBook | null {
  const title = typeof record.title === "string" ? record.title.trim() : "";
  if (!title) return null;

  const image = coverFromCachedImage(record.cached_image ?? record.image);
  const hitIsbns = textList(record.isbns);
  const mergedIsbns = [...isbns, ...hitIsbns].filter(Boolean);

  return {
    id: `${HARDCOVER_ID_PREFIX}enrich`,
    title,
    authors: authorsFromContributors(
      record.cached_contributors ?? record.author_names ?? record.contributions
    ),
    description: cleanDescription(
      typeof record.description === "string" ? record.description : null
    ),
    coverUrl: image,
    publishedYear: parsePublishedYear(
      (record.release_year as number | undefined) ??
        (typeof record.release_date === "string" ? record.release_date : null)
    ),
    pageCount: typeof record.pages === "number" ? record.pages : null,
    genres: tagsFromCachedTags(record.cached_tags) || textList(record.genres),
    isbns: mergedIsbns,
  };
}

function recordToCache(book: HardcoverBook | null): HardcoverCacheRecord {
  const now = Date.now();
  if (!book) {
    return {
      title: null,
      description: null,
      coverUrl: null,
      tags: [],
      year: null,
      cachedAt: now,
      empty: true,
    };
  }
  return {
    title: book.title,
    description: book.description,
    coverUrl: book.coverUrl,
    tags: book.genres,
    year: book.publishedYear,
    cachedAt: now,
    empty: false,
  };
}

type GraphqlResult =
  | { kind: "ok"; payload: unknown; status: number }
  | { kind: "quota" }
  | { kind: "miss" };

/**
 * The only live HTTP to api.hardcover.app. Never used by searchHardcover.
 * Increments the UTC daily counter before fetch; at 4500 returns quota without HTTP.
 */
async function fetchHardcoverGraphql(
  query: string,
  variables: Record<string, unknown>,
  slug: string
): Promise<GraphqlResult> {
  const trimmedSlug = slug.trim();
  if (!trimmedSlug) return { kind: "miss" };
  const token = hardcoverBearerToken();
  if (!token) return { kind: "miss" };
  if (!takeHardcoverQuotaSlot()) return { kind: "quota" };

  console.info(`[hardcover] slug=${trimmedSlug} reason=cache_miss`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(HARDCOVER_ENDPOINT, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query, variables }),
    });

    const status = response.status;
    if (status === 401 || status === 403 || status >= 500) {
      console.error("[hardcover] enrich skipped:", { status });
      return { kind: "miss" };
    }

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      console.error("[hardcover] enrich skipped:", {
        status,
        message: graphqlErrorMessage(payload) ?? response.statusText,
      });
      return { kind: "miss" };
    }

    const graphqlMessage = graphqlErrorMessage(payload);
    if (graphqlMessage) {
      console.error("[hardcover] enrich skipped:", {
        status,
        message: graphqlMessage,
      });
      return { kind: "miss" };
    }

    return { kind: "ok", payload, status };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const timedOut =
      (error instanceof Error && error.name === "AbortError") ||
      /abort|timeout/i.test(message);
    console.error("[hardcover] enrich skipped:", {
      reason: timedOut ? "timeout" : "network",
      message,
    });
    return { kind: "miss" };
  } finally {
    clearTimeout(timeout);
  }
}

function isbn13And10(isbn: string): { isbn13: string | null; isbn10: string | null } {
  const digits = isbn.replace(/\D/g, "");
  if (digits.length === 13) return { isbn13: digits, isbn10: null };
  if (digits.length === 10) return { isbn13: null, isbn10: digits };
  return { isbn13: digits || null, isbn10: digits || null };
}

function bookFromEditionPayload(payload: unknown): HardcoverBook | null {
  const data = (payload as {
    data?: {
      editions?: { isbn_13?: string; isbn_10?: string; book?: Record<string, unknown> }[];
    };
  })?.data;
  const edition = data?.editions?.[0];
  if (!edition?.book) return null;
  const isbns = [edition.isbn_13, edition.isbn_10].filter(
    (value): value is string => Boolean(value)
  );
  return bookFromGraphqlRecord(edition.book, isbns);
}

function normalizeForCompare(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bookFromTitlePayload(
  payload: unknown,
  title: string,
  authors: string[]
): HardcoverBook | null {
  const results = (payload as { data?: { search?: { results?: unknown } } })?.data
    ?.search?.results;
  const hits = readHits(results)
    .map((hit) => bookFromGraphqlRecord(hit))
    .filter((book): book is HardcoverBook => book !== null);
  if (hits.length === 0) return null;

  const wantedTitle = normalizeForCompare(title);
  const wantedAuthor = authors.find(
    (name) => name && name.toLowerCase() !== "unknown author"
  );
  const wantedAuthorKey = wantedAuthor ? normalizeForCompare(wantedAuthor) : null;

  const exact = hits.find((book) => {
    if (normalizeForCompare(book.title) !== wantedTitle) return false;
    if (!wantedAuthorKey) return true;
    return book.authors.some((name) =>
      normalizeForCompare(name).includes(wantedAuthorKey)
    );
  });

  return (
    exact ??
    hits.find((book) => normalizeForCompare(book.title) === wantedTitle) ??
    hits[0] ??
    null
  );
}

type HardcoverLookup =
  | { status: "ok"; book: HardcoverBook | null }
  | { status: "quota" };

function lookupFromGraphql(
  result: GraphqlResult,
  book: HardcoverBook | null
): HardcoverLookup {
  if (result.kind === "quota") return { status: "quota" };
  if (result.kind === "miss") return { status: "ok", book: null };
  return { status: "ok", book };
}

/**
 * Live single-book lookup: ISBN XOR title+author. Never both.
 * If ISBN is the one query, title+author is not fired even on a miss.
 * Requires a book slug — no slug means no HTTP.
 * Never throws — 401/403/5xx/timeout/quota → empty / quota.
 */
async function fetchHardcoverBook(
  title: string,
  authors: string[] = [],
  isbn?: string | null,
  slug?: string | null
): Promise<HardcoverLookup> {
  try {
    const bookSlug = slug?.trim() ?? "";
    if (!bookSlug) return { status: "ok", book: null };
    if (!isHardcoverConfigured()) return { status: "ok", book: null };

    const isbnDigits = bookIsbnKey(isbn);
    if (isbnDigits) {
      const { isbn13, isbn10 } = isbn13And10(isbnDigits);
      const isbnValue = isbn13 ?? isbn10;
      if (!isbnValue) return { status: "ok", book: null };
      const result = await fetchHardcoverGraphql(
        isbn13 ? ISBN13_QUERY : ISBN10_QUERY,
        { isbn: isbnValue },
        bookSlug
      );
      const book =
        result.kind === "ok" ? bookFromEditionPayload(result.payload) : null;
      return lookupFromGraphql(result, book);
    }

    const author = authors.find(
      (name) => name && name.toLowerCase() !== "unknown author"
    );
    const query = (author ? `${title} ${author}` : title).replace(/\s+/g, " ").trim();
    if (!query) return { status: "ok", book: null };

    const result = await fetchHardcoverGraphql(
      TITLE_QUERY,
      { query: query.slice(0, 150) },
      bookSlug
    );
    const book =
      result.kind === "ok"
        ? bookFromTitlePayload(result.payload, title, authors)
        : null;
    return lookupFromGraphql(result, book);
  } catch (error) {
    console.error("[hardcover] enrich skipped:", {
      message: error instanceof Error ? error.message : String(error),
    });
    return { status: "ok", book: null };
  }
}

async function readMemoryOrRowCache(
  key: string,
  slug: string,
  isbn: string | null
): Promise<HardcoverCacheRecord | null> {
  const memory = memoryCache.get(key);
  if (cacheFresh(memory)) return memory ?? null;

  try {
    const row = await readHardcoverRowCache(slug, isbn);
    if (row && cacheFresh(row)) {
      memoryCache.set(key, row);
      return row;
    }
  } catch (error) {
    console.error("[hardcover] cache read skipped:", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
  return null;
}

function applyHardcoverCache(
  book: BookDetail,
  record: HardcoverCacheRecord
): BookDetail {
  if (record.empty) return book;

  const tags = finalizeBookTags({
    genreEvidence: [{ source: "hardcover", categories: record.tags }],
    title: record.title || book.title,
    description: record.description || book.description,
    publishedYear: record.year ?? book.publishedYear,
    source: "hardcover",
    maxTags: 5,
  });

  const coverEmpty = !book.coverUrl?.trim();
  const descriptionEmpty =
    !book.description?.trim() || isWeakDescription(book.description);

  return {
    ...book,
    genres: tags.length > 0 ? tags.slice(0, 5) : book.genres,
    coverUrl: coverEmpty ? record.coverUrl?.trim() || book.coverUrl : book.coverUrl,
    description: descriptionEmpty
      ? record.description?.trim() || book.description
      : book.description,
  };
}

async function lookupAndCache(
  book: BookDetail,
  key: string
): Promise<HardcoverCacheRecord | null> {
  const fetched = await fetchHardcoverBook(
    book.title,
    book.authors,
    book.isbn,
    book.id
  );
  if (fetched.status === "quota") return null;

  const record = recordToCache(fetched.book);
  memoryCache.set(key, record);

  if (!record.empty) {
    try {
      await persistHardcoverCache(book.id, bookIsbnKey(book.isbn), record);
    } catch (error) {
      console.error("[hardcover] cache write skipped:", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return record;
}

/**
 * Detail-page enricher. Cache / quota / 401 / timeout → original book.
 * Hardcover wins tags (max 5) and fills empty cover/description only.
 */
export async function enrichFromHardcover(book: BookDetail): Promise<BookDetail> {
  try {
    if (!book.title?.trim()) return book;
    if (!book.id?.trim()) return book;
    if (!isHardcoverConfigured()) return book;

    const key = hardcoverCacheKey(book.isbn, book.id);
    if (!key) return book;

    const cached = await readMemoryOrRowCache(key, book.id, bookIsbnKey(book.isbn));
    if (cached) return applyHardcoverCache(book, cached);

    if (alreadyCompleteFromGoogle(book)) return book;

    const pending = inFlight.get(key);
    if (pending) {
      const shared = await pending;
      return shared ? applyHardcoverCache(book, shared) : book;
    }

    const lookup = lookupAndCache(book, key);
    inFlight.set(key, lookup);
    try {
      const record = await lookup;
      return record ? applyHardcoverCache(book, record) : book;
    } finally {
      inFlight.delete(key);
    }
  } catch (error) {
    console.error("[hardcover] enrich skipped:", {
      id: book.id,
      message: error instanceof Error ? error.message : String(error),
    });
    console.error(
      "[book-detail]",
      book.id,
      error instanceof Error ? error.message : String(error)
    );
    return book;
  }
}

/**
 * Search must never hit Hardcover. No token read, no network.
 */
export async function searchHardcover(
  _query?: string,
  _page = 1
): Promise<HardcoverPageResult> {
  return { books: [], hasMore: false, error: null };
}
