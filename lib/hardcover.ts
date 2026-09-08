import { cleanDescription, parsePublishedYear } from "@/lib/book-utils";
import type { BookSummary } from "@/types/book";

/**
 * Optional Hardcover.app browse search + enrichment (GraphQL, token-gated).
 * Soft-fails when HARDCOVER_API_TOKEN is unset — other providers still return.
 * Env name matches Netlify: HARDCOVER_API_TOKEN (not HARDCOVER_API_KEY).
 */
export const HARDCOVER_API_TOKEN_ENV = "HARDCOVER_API_TOKEN";
const HARDCOVER_ENDPOINT = "https://api.hardcover.app/v1/graphql";
/** Stay under the search-flood per-provider cap (2500ms) so we log here first. */
const FETCH_TIMEOUT_MS = 2200;
const HARDCOVER_ID_PREFIX = "hardcover-";

export type HardcoverSearchError = {
  reason:
    | "missing_token"
    | "empty_query"
    | "http_error"
    | "graphql_error"
    | "timeout"
    | "empty_results"
    | "parse_error"
    | "circuit_open";
  status?: number;
  message?: string;
};

const CIRCUIT_MS = 15 * 60 * 1000;
const SEARCH_CACHE_MS = 10 * 60 * 1000;
const SEARCH_CACHE_MAX = 40;

let circuitOpenUntil = 0;
let circuitReason: string | null = null;

type CachedSearch = {
  expiresAt: number;
  outcome: HardcoverSearchOutcome;
};

const searchCache = new Map<string, CachedSearch>();

function searchCacheKey(query: string, page: number): string {
  return `${query.trim().toLowerCase()}|${Math.max(1, page)}`;
}

function readSearchCache(key: string): HardcoverSearchOutcome | null {
  const entry = searchCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    searchCache.delete(key);
    return null;
  }
  return {
    books: entry.outcome.books.map((book) => ({ ...book, isbns: [...book.isbns] })),
    error: entry.outcome.error,
  };
}

function writeSearchCache(key: string, outcome: HardcoverSearchOutcome) {
  if (searchCache.size >= SEARCH_CACHE_MAX) {
    const first = searchCache.keys().next().value;
    if (first) searchCache.delete(first);
  }
  searchCache.set(key, {
    expiresAt: Date.now() + SEARCH_CACHE_MS,
    outcome: {
      books: outcome.books.map((book) => ({ ...book, isbns: [...book.isbns] })),
      error: outcome.error,
    },
  });
}

function isCircuitOpen(): boolean {
  return Date.now() < circuitOpenUntil;
}

export function isHardcoverCircuitOpen(): boolean {
  return isCircuitOpen();
}

function openCircuit(reason: string) {
  const alreadyOpen = isCircuitOpen() && circuitReason === reason;
  circuitOpenUntil = Date.now() + CIRCUIT_MS;
  circuitReason = reason;
  if (!alreadyOpen) {
    console.error("[hardcover] circuit open for 15m — skipping further calls:", {
      env: HARDCOVER_API_TOKEN_ENV,
      reason,
    });
  }
}

function shouldTripCircuit(error: HardcoverSearchError): boolean {
  if (error.reason === "missing_token") return true;
  if (error.status === 401 || error.status === 429) return true;
  return /invalid_token/i.test(error.message ?? "");
}

function logHardcoverFailure(
  error: HardcoverSearchError,
  extra?: Record<string, unknown>
) {
  console.error("[hardcover] search failed:", {
    env: HARDCOVER_API_TOKEN_ENV,
    reason: error.reason,
    status: error.status ?? null,
    message: error.message ?? null,
    ...extra,
  });
}

const SEARCH_QUERY = `query LorePathSearch($query: String!, $page: Int!) {
  search(query: $query, query_type: "Book", per_page: 8, page: $page) {
    results
  }
}`;

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

export function isHardcoverConfigured(): boolean {
  return Boolean(process.env[HARDCOVER_API_TOKEN_ENV]?.trim());
}

function hardcoverBearerToken(): string | null {
  const raw = process.env[HARDCOVER_API_TOKEN_ENV]?.trim();
  if (!raw) return null;
  return raw.replace(/^bearer\s+/i, "").trim() || null;
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
        const name = (entry as { name?: unknown }).name;
        if (typeof name === "string") return name.trim();
      }
      return "";
    })
    .filter(Boolean);
}

/** Search results arrive as Typesense hits, sometimes JSON-encoded. */
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

function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function hardcoverRecordId(
  hit: Record<string, unknown>,
  title: string,
  isbnDigits: string
): string {
  const raw = hit.id ?? hit.book_id ?? hit.work_id;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return String(raw);
  }
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim().replace(/\s+/g, "-").slice(0, 64);
  }
  return isbnDigits || slugifyTitle(title) || "work";
}

function toHardcoverBook(hit: Record<string, unknown>): HardcoverBook | null {
  const title = typeof hit.title === "string" ? hit.title.trim() : "";
  if (!title) return null;

  const image = hit.image as { url?: unknown } | undefined;
  const coverUrl =
    typeof image?.url === "string" && image.url.trim() ? image.url.trim() : null;
  const isbns = textList(hit.isbns);
  const isbnDigits =
    isbns.find((value) => value.replace(/\D/g, "").length >= 10)?.replace(
      /\D/g,
      ""
    ) ?? "";

  return {
    id: `${HARDCOVER_ID_PREFIX}${hardcoverRecordId(hit, title, isbnDigits)}`,
    title,
    authors: textList(hit.author_names ?? hit.contributions),
    description: cleanDescription(
      typeof hit.description === "string" ? hit.description : null
    ),
    coverUrl,
    publishedYear: parsePublishedYear(
      (hit.release_year as number | undefined) ??
        (typeof hit.release_date === "string" ? hit.release_date : null)
    ),
    pageCount: typeof hit.pages === "number" ? hit.pages : null,
    genres: textList(hit.genres),
    isbns,
  };
}

type HardcoverSearchOutcome = {
  books: HardcoverBook[];
  error: HardcoverSearchError | null;
};

/**
 * Live Hardcover search for this query only. Never reuses another q's payload.
 */
async function runHardcoverSearch(
  query: string,
  page = 1
): Promise<HardcoverSearchOutcome> {
  const trimmed = query.trim();
  const pageNumber = Math.max(1, page);
  const cacheKey = searchCacheKey(trimmed, pageNumber);

  if (!trimmed) {
    const error: HardcoverSearchError = { reason: "empty_query" };
    logHardcoverFailure(error, { page: pageNumber });
    return { books: [], error };
  }

  const token = hardcoverBearerToken();
  if (!token) {
    const error: HardcoverSearchError = { reason: "missing_token" };
    openCircuit("missing_token");
    logHardcoverFailure(error, { query: trimmed, page: pageNumber });
    return { books: [], error };
  }

  if (isCircuitOpen()) {
    return {
      books: [],
      error: {
        reason: "circuit_open",
        message: circuitReason ?? "circuit_open",
      },
    };
  }

  const cached = readSearchCache(cacheKey);
  if (cached) return cached;

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
      body: JSON.stringify({
        query: SEARCH_QUERY,
        variables: {
          query: trimmed.slice(0, 150),
          page: pageNumber,
        },
      }),
    });

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    const graphqlMessage = graphqlErrorMessage(payload);

    if (!response.ok) {
      const error: HardcoverSearchError = {
        reason: "http_error",
        status: response.status,
        message: graphqlMessage ?? response.statusText ?? `HTTP ${response.status}`,
      };
      if (shouldTripCircuit(error)) {
        openCircuit(error.message ?? `http_${response.status}`);
      }
      logHardcoverFailure(error, { query: trimmed, page: pageNumber });
      return { books: [], error };
    }

    if (graphqlMessage) {
      const error: HardcoverSearchError = {
        reason: "graphql_error",
        status: response.status,
        message: graphqlMessage,
      };
      if (shouldTripCircuit(error)) {
        openCircuit(error.message ?? "graphql_error");
      }
      logHardcoverFailure(error, { query: trimmed, page: pageNumber });
      return { books: [], error };
    }

    const results = (payload as { data?: { search?: { results?: unknown } } })
      ?.data?.search?.results;
    if (results == null) {
      const error: HardcoverSearchError = {
        reason: "parse_error",
        status: response.status,
        message: "GraphQL data.search.results missing",
      };
      logHardcoverFailure(error, { query: trimmed, page: pageNumber });
      return { books: [], error };
    }

    const hits = readHits(results)
      .map((hit) => toHardcoverBook(hit))
      .filter((book): book is HardcoverBook => book !== null);

    if (hits.length === 0) {
      const rawHits = (results as { hits?: unknown })?.hits;
      const error: HardcoverSearchError = {
        reason: "empty_results",
        status: response.status,
        message: Array.isArray(rawHits)
          ? `Typesense returned ${rawHits.length} hits; none mapped to books`
          : "Typesense results had no hits array",
      };
      logHardcoverFailure(error, { query: trimmed, page: pageNumber });
      writeSearchCache(cacheKey, { books: [], error });
      return { books: [], error };
    }

    const success = { books: hits, error: null };
    writeSearchCache(cacheKey, success);
    return success;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const timedOut =
      (error instanceof Error && error.name === "AbortError") ||
      /abort|timeout/i.test(message);
    const mapped: HardcoverSearchError = {
      reason: timedOut ? "timeout" : "http_error",
      message,
    };
    logHardcoverFailure(mapped, { query: trimmed, page: pageNumber });
    return { books: [], error: mapped };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeForCompare(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Best Hardcover match for a known title (+ author when available). */
export async function fetchHardcoverBook(
  title: string,
  authors: string[] = []
): Promise<HardcoverBook | null> {
  const author = authors.find(
    (name) => name && name.toLowerCase() !== "unknown author"
  );
  const { books: results } = await runHardcoverSearch(
    author ? `${title} ${author}` : title,
    1
  );
  if (results.length === 0) return null;

  const wantedTitle = normalizeForCompare(title);
  const wantedAuthor = author ? normalizeForCompare(author) : null;

  const exact = results.find((book) => {
    if (normalizeForCompare(book.title) !== wantedTitle) return false;
    if (!wantedAuthor) return true;
    return book.authors.some((name) =>
      normalizeForCompare(name).includes(wantedAuthor)
    );
  });

  return (
    exact ??
    results.find((book) => normalizeForCompare(book.title) === wantedTitle) ??
    null
  );
}

function toBookSummary(book: HardcoverBook): BookSummary {
  const isbn =
    book.isbns.find((value) => value.replace(/\D/g, "").length >= 10) ?? null;
  const isbnDigits = isbn?.replace(/\D/g, "") ?? "";

  return {
    id: book.id,
    title: book.title,
    authors: book.authors.length > 0 ? book.authors : ["Unknown author"],
    coverUrl: book.coverUrl,
    description: book.description,
    genres: book.genres,
    publishedYear: book.publishedYear,
    source: "hardcover",
    isbn: isbnDigits || isbn,
    pageCount: book.pageCount,
    language: "en",
  };
}

export type HardcoverPageResult = {
  books: BookSummary[];
  hasMore: boolean;
  error: HardcoverSearchError | null;
};

/**
 * Browse flood search via Hardcover Typesense.
 * Always called from the search flood. Missing HARDCOVER_API_TOKEN → empty
 * page + server log so Google/OL/Gutendex still return.
 */
export async function searchHardcover(
  query: string,
  page = 1
): Promise<HardcoverPageResult> {
  if (!query.trim()) {
    const error: HardcoverSearchError = { reason: "empty_query" };
    logHardcoverFailure(error);
    return { books: [], hasMore: false, error };
  }

  // Skip Google-structured operators — Hardcover wants natural language.
  const cleaned = query
    .replace(/\bintitle:|"|inauthor:/gi, " ")
    .replace(/\bisbn:\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) {
    const error: HardcoverSearchError = { reason: "empty_query" };
    logHardcoverFailure(error, { query: query.trim() });
    return { books: [], hasMore: false, error };
  }

  const { books: hits, error } = await runHardcoverSearch(cleaned, page);
  const books = hits
    .map((hit) => toBookSummary(hit))
    .filter((book) => Boolean(book.title?.trim()))
    .map((book) => ({ ...book, genres: [...book.genres] }));

  return { books, hasMore: false, error };
}

export function isHardcoverId(id: string): boolean {
  return id.startsWith(HARDCOVER_ID_PREFIX);
}
