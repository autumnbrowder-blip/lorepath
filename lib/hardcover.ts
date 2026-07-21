import {
  cleanAuthors,
  cleanDescription,
  cleanTitle,
  isLowQualityBook,
  keepProviderSubjects,
  parsePublishedYear,
} from "@/lib/book-utils";
import type { BookDetail, BookSummary } from "@/types/book";

const HARDCOVER_API_URL = "https://api.hardcover.app/v1/graphql";
export const HARDCOVER_ID_PREFIX = "hardcover-";
/** Netlify cold starts + search+hydrate can exceed 10s. */
const FETCH_TIMEOUT_MS = 15000;
const MISSING_DESCRIPTION_FALLBACK = "No description available.";

/** Common misnamed env keys — log a hint if the real key is missing. */
const HARDCOVER_TOKEN_ALIASES = [
  "HARDCOVER_TOKEN",
  "HARDCOVER_API_KEY",
  "HARDCOVER_KEY",
  "NEXT_PUBLIC_HARDCOVER_API_TOKEN",
] as const;

export type HardcoverFailureReason =
  | "missing_token"
  | "http_error"
  | "unauthorized"
  | "graphql_error"
  | "search_error"
  | "empty_response"
  | "quality_filtered"
  | "timeout"
  | "network_error";

export type HardcoverSearchDiagnostics = {
  configured: boolean;
  /** Length only — never the secret itself. */
  tokenChars: number;
  httpStatus: number | null;
  idsFound: number;
  hitsFound: number;
  booksReturned: number;
  failureReason: HardcoverFailureReason | null;
  /** Short, safe, user-facing hint (no secrets). */
  hint: string | null;
};

const EMPTY_DIAGNOSTICS: HardcoverSearchDiagnostics = {
  configured: false,
  tokenChars: 0,
  httpStatus: null,
  idsFound: 0,
  hitsFound: 0,
  booksReturned: 0,
  failureReason: null,
  hint: null,
};

/** Bracket access — some host bundlers inline `process.env.NAME` at build time. */
function readProcessEnv(name: string): string | undefined {
  const value = process.env[name];
  return typeof value === "string" ? value : undefined;
}

/**
 * Normalize a dashboard-pasted token: BOM, quotes, Bearer prefix, whitespace.
 * Never log the returned value.
 */
function sanitizeHardcoverToken(raw: string): string | null {
  let token = raw.replace(/^\uFEFF/, "").trim();
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    token = token.slice(1, -1).trim();
  }
  if (/^Bearer\s+/i.test(token)) {
    token = token.replace(/^Bearer\s+/i, "").trim();
  }
  // JWTs are base64url — strip accidental newlines/spaces from copy-paste.
  token = token.replace(/\s+/g, "");
  return token || null;
}

/**
 * Read token from `.env.local` / host env as `HARDCOVER_API_TOKEN` (exact name).
 * Server-only — never use `NEXT_PUBLIC_`.
 */
function getHardcoverToken(): string | null {
  const raw = readProcessEnv("HARDCOVER_API_TOKEN");
  const token = raw ? sanitizeHardcoverToken(raw) : null;
  if (!token) {
    const foundAlias = HARDCOVER_TOKEN_ALIASES.find((key) => {
      const aliasRaw = readProcessEnv(key);
      return Boolean(aliasRaw && sanitizeHardcoverToken(aliasRaw));
    });
    if (foundAlias) {
      console.error(
        `[Hardcover] Found ${foundAlias} but LorePath reads HARDCOVER_API_TOKEN. Rename the env var (no NEXT_PUBLIC_, no spaces) and redeploy.`
      );
    }
    return null;
  }
  return token;
}

/** Whether a usable HARDCOVER_API_TOKEN is present (server-only). */
export function isHardcoverConfigured(): boolean {
  return Boolean(getHardcoverToken());
}

function hintForFailure(
  reason: HardcoverFailureReason | null,
  httpStatus: number | null
): string | null {
  switch (reason) {
    case "missing_token":
      return "Set HARDCOVER_API_TOKEN in Netlify (Production + Runtime scopes) or .env.local, then redeploy / restart dev.";
    case "unauthorized":
      return "Hardcover rejected the API token (HTTP 401/403). Paste the raw JWT from hardcover.app/account/api — no Bearer prefix, no quotes — then redeploy.";
    case "http_error":
      return `Hardcover HTTP ${httpStatus ?? "error"}. Check Netlify function logs for [Hardcover].`;
    case "graphql_error":
      return "Hardcover GraphQL rejected the query. Check server logs for [Hardcover] GraphQL errors.";
    case "search_error":
      return "Hardcover search returned an error payload. Check server logs for [Hardcover] search.error.";
    case "empty_response":
      return "Hardcover returned no matches for this query.";
    case "quality_filtered":
      return "Hardcover returned hits, but none had a usable cover or description after parsing.";
    case "timeout":
      return "Hardcover timed out. Try again; cold starts on Netlify can be slow.";
    case "network_error":
      return "Could not reach api.hardcover.app. Check outbound network / server logs.";
    default:
      return null;
  }
}

async function fetchHardcoverGraphql(
  body: unknown,
  token: string
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(HARDCOVER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function hasCover(book: BookSummary): boolean {
  return Boolean(book.coverUrl?.trim());
}

function hasDescription(book: BookSummary): boolean {
  return Boolean(book.description?.trim());
}

/** Keep search hits that can still merge/display — cover and/or description. */
function isUsableHardcoverSearchBook(book: BookSummary): boolean {
  return hasCover(book) || hasDescription(book);
}

function withDescriptionFallback<T extends BookSummary>(book: T): T {
  if (hasDescription(book)) return book;
  return { ...book, description: MISSING_DESCRIPTION_FALLBACK };
}

type HardcoverAuthor = {
  name?: string | null;
};

type HardcoverContribution = {
  author?: HardcoverAuthor | null;
};

type HardcoverImage = {
  url?: string | null;
};

type HardcoverCachedTag = {
  tag?: string | null;
  name?: string | null;
  category?: string | null;
};

type HardcoverCachedTags =
  | HardcoverCachedTag[]
  | Record<string, HardcoverCachedTag[] | undefined>
  | null
  | undefined;

type HardcoverBook = {
  id?: number | string | null;
  title?: string | null;
  release_year?: number | null;
  pages?: number | null;
  description?: string | null;
  image?: HardcoverImage | null;
  contributions?: HardcoverContribution[] | null;
  cached_tags?: HardcoverCachedTags;
};

/** Typesense document inside `search.results.hits[].document`. */
type HardcoverSearchHit = {
  id?: number | string | null;
  title?: string | null;
  description?: string | null;
  release_year?: number | string | null;
  pages?: number | null;
  author_names?: string[] | null;
  contributions?: HardcoverContribution[] | null;
  genres?: string[] | null;
  tags?: string[] | null;
  isbns?: string[] | null;
  image?: HardcoverImage | string | null;
};

type HardcoverSearchResults = {
  hits?: { document?: HardcoverSearchHit }[];
  found?: number;
};

type HardcoverSearchResponse = {
  data?: {
    search?: {
      error?: string | null;
      ids?: Array<number | string> | null;
      /** Typesense payload — object, or occasionally a JSON string. */
      results?: HardcoverSearchResults | string | null;
    } | null;
  } | null;
  errors?: { message?: string }[] | null;
};

type HardcoverBooksResponse = {
  data?: { books?: HardcoverBook[] | null } | null;
  errors?: { message?: string }[] | null;
};

type HardcoverPkResponse = {
  data?: { books_by_pk?: HardcoverBook | null } | null;
  errors?: { message?: string }[] | null;
};

export function isHardcoverId(id: string): boolean {
  return id.startsWith(HARDCOVER_ID_PREFIX);
}

export function toHardcoverId(id: number | string): string {
  return `${HARDCOVER_ID_PREFIX}${id}`;
}

function parseHardcoverAuthors(
  contributions?: HardcoverContribution[] | null,
  authorNames?: string[] | null
): string[] {
  const fromContributions = (contributions ?? [])
    .map((entry) => entry.author?.name?.trim())
    .filter((name): name is string => Boolean(name));

  if (fromContributions.length > 0) {
    return cleanAuthors(fromContributions);
  }

  return cleanAuthors(
    (authorNames ?? []).map((name) => name.trim()).filter(Boolean)
  );
}

function flattenCachedTags(cachedTags: HardcoverCachedTags): string[] {
  if (!cachedTags) return [];

  if (Array.isArray(cachedTags)) {
    return cachedTags
      .map((tag) => tag.tag?.trim() || tag.name?.trim())
      .filter((name): name is string => Boolean(name));
  }

  // Prefer Genre bucket when present
  const genreBucket = cachedTags.Genre ?? cachedTags.genre ?? [];
  const fromGenre = genreBucket
    .map((tag) => tag.tag?.trim() || tag.name?.trim())
    .filter((name): name is string => Boolean(name));

  if (fromGenre.length > 0) return fromGenre;

  return Object.values(cachedTags)
    .flatMap((bucket) => bucket ?? [])
    .map((tag) => tag.tag?.trim() || tag.name?.trim())
    .filter((name): name is string => Boolean(name));
}

function parseHardcoverGenres(input: {
  genres?: string[] | null;
  tags?: string[] | null;
  cached_tags?: HardcoverCachedTags;
}): string[] {
  const fromSearchGenres = (input.genres ?? [])
    .map((name) => name.trim())
    .filter(Boolean);
  const fromCached = flattenCachedTags(input.cached_tags);

  return keepProviderSubjects([...fromSearchGenres, ...fromCached]);
}

function parsePageCount(pages?: number | null): number | null {
  if (typeof pages === "number" && Number.isFinite(pages) && pages > 0) {
    return Math.round(pages);
  }
  return null;
}

function parseCoverUrl(
  image?: HardcoverImage | string | null
): string | null {
  if (typeof image === "string") {
    const raw = image.trim();
    return raw ? raw.replace("http://", "https://") : null;
  }
  const raw = image?.url?.trim();
  return raw ? raw.replace("http://", "https://") : null;
}

function parseIsbn(isbns?: string[] | null): string | null {
  if (!isbns?.length) return null;
  const isbn13 = isbns.find((value) => value.replace(/\D/g, "").length === 13);
  const isbn10 = isbns.find((value) => value.replace(/\D/g, "").length === 10);
  return isbn13 || isbn10 || isbns[0] || null;
}

/** Normalize a Hardcover book row into LorePath BookSummary. */
export function parseHardcoverBook(book: HardcoverBook): BookSummary | null {
  if (book.id == null || !book.title?.trim()) return null;

  const summary: BookSummary = {
    id: toHardcoverId(book.id),
    title: cleanTitle(book.title),
    authors: parseHardcoverAuthors(book.contributions),
    coverUrl: parseCoverUrl(book.image),
    description: cleanDescription(book.description),
    genres: parseHardcoverGenres({ cached_tags: book.cached_tags }),
    publishedYear: parsePublishedYear(book.release_year),
    source: "hardcover",
    isbn: null,
    pageCount: parsePageCount(book.pages),
  };

  // Keep id+title rows so search can hydrate missing description/cover.
  if (isLowQualityBook(summary)) return null;
  return summary;
}

function parseHardcoverSearchHit(hit: HardcoverSearchHit): BookSummary | null {
  if (hit.id == null || !hit.title?.trim()) return null;

  // Only genre labels — ignore mood/style `tags` from Typesense (noisy).
  const summary: BookSummary = {
    id: toHardcoverId(hit.id),
    title: cleanTitle(hit.title),
    authors: parseHardcoverAuthors(hit.contributions, hit.author_names),
    coverUrl: parseCoverUrl(hit.image),
    description: cleanDescription(hit.description),
    genres: parseHardcoverGenres({
      genres: hit.genres,
    }),
    publishedYear: parsePublishedYear(hit.release_year),
    source: "hardcover",
    isbn: parseIsbn(hit.isbns),
    pageCount: parsePageCount(hit.pages),
  };

  // Do not require description+cover here — hydrate fills gaps next.
  if (isLowQualityBook(summary)) return null;
  return summary;
}

export function parseHardcoverBookDetail(
  book: HardcoverBook
): BookDetail | null {
  const summary = parseHardcoverBook(book);
  if (!summary) return null;

  return {
    ...summary,
    publisher: null,
    pageCount: summary.pageCount ?? null,
    language: null,
    isbn: summary.isbn ?? null,
  };
}

/** Unwrap Typesense payload (object, JSON string, or rare multi-search array). */
function unwrapSearchResults(value: unknown): HardcoverSearchResults | null {
  if (!value) return null;

  if (typeof value === "string") {
    try {
      return unwrapSearchResults(JSON.parse(value) as unknown);
    } catch {
      return null;
    }
  }

  if (Array.isArray(value)) {
    const withHits = value.find(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        Array.isArray((entry as HardcoverSearchResults).hits)
    );
    return withHits ? (withHits as HardcoverSearchResults) : null;
  }

  if (typeof value === "object") {
    return value as HardcoverSearchResults;
  }

  return null;
}

function normalizeSearchResults(
  results: HardcoverSearchResults | string | null | undefined
): HardcoverSearchResults | null {
  return unwrapSearchResults(results);
}

function summarizeHitForLog(hit: HardcoverSearchHit | undefined) {
  if (!hit) return null;
  const cover = parseCoverUrl(hit.image);
  return {
    id: hit.id ?? null,
    title: hit.title?.slice(0, 80) ?? null,
    hasDescription: Boolean(hit.description?.trim()),
    hasCover: Boolean(cover),
    imageType: hit.image == null ? "null" : typeof hit.image,
    authorNames: Array.isArray(hit.author_names) ? hit.author_names.length : 0,
  };
}

function extractSearchHits(
  payload: HardcoverSearchResponse
): HardcoverSearchHit[] {
  const results = normalizeSearchResults(payload.data?.search?.results);
  const hits = results?.hits;
  if (!Array.isArray(hits)) return [];
  return hits
    .map((hit) => {
      if (!hit || typeof hit !== "object") return null;
      if (hit.document) return hit.document;
      // Defensive: some payloads put book fields on the hit itself.
      const loose = hit as HardcoverSearchHit & {
        document?: HardcoverSearchHit;
      };
      if (loose.id != null || loose.title != null) return loose;
      return null;
    })
    .filter((doc): doc is HardcoverSearchHit => Boolean(doc));
}

function extractSearchIds(payload: HardcoverSearchResponse): number[] {
  const raw = payload.data?.search?.ids ?? [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0);
}

const BOOK_FIELDS = `
  id
  title
  release_year
  pages
  description
  image { url }
  contributions { author { name } }
  cached_tags
`;

export type HardcoverSearchOutcome = {
  books: BookSummary[];
  diagnostics: HardcoverSearchDiagnostics;
};

/**
 * Search Hardcover.app via the official Typesense `search` query.
 * Uses API defaults for fields/weights (same as hardcover.app book search).
 * Soft quality gate: keep rows with a cover and/or description (stub
 * missing blurbs so merge/finalize can still use cover-only hits).
 *
 * Important: `_ilike` / `_like` filters are disabled by Hardcover and return errors.
 * Auth: `Authorization: Bearer <raw JWT>` to https://api.hardcover.app/v1/graphql
 */
export async function searchHardcover(
  query: string
): Promise<HardcoverSearchOutcome> {
  const trimmed = query.trim();
  const token = getHardcoverToken();

  if (!trimmed) {
    console.warn("[Hardcover] searchHardcover skipped: empty query");
    return { books: [], diagnostics: { ...EMPTY_DIAGNOSTICS } };
  }

  if (!token) {
    console.error(
      "[Hardcover] HARDCOVER_API_TOKEN is missing. Add it to .env.local and Netlify → Site configuration → Environment variables (exact name, raw JWT, no Bearer prefix, no quotes, no NEXT_PUBLIC_). Enable Production (+ Preview if needed) and Runtime/Functions scopes. Redeploy after saving."
    );
    const failureReason: HardcoverFailureReason = "missing_token";
    return {
      books: [],
      diagnostics: {
        ...EMPTY_DIAGNOSTICS,
        failureReason,
        hint: hintForFailure(failureReason, null),
      },
    };
  }

  const jwtParts = token.split(".").length;
  console.info("[Hardcover] searchHardcover start", {
    query: trimmed,
    tokenChars: token.length,
    jwtLike: jwtParts === 3,
    authHeader: "Authorization: Bearer <redacted>",
    endpoint: HARDCOVER_API_URL,
  });

  const baseDiag: HardcoverSearchDiagnostics = {
    configured: true,
    tokenChars: token.length,
    httpStatus: null,
    idsFound: 0,
    hitsFound: 0,
    booksReturned: 0,
    failureReason: null,
    hint: null,
  };

  try {
    // Omit custom fields/weights so Typesense uses Hardcover's book defaults.
    const response = await fetchHardcoverGraphql(
      {
        query: `
          query SearchBooks($query: String!) {
            search(
              query: $query,
              query_type: "Book",
              per_page: 20,
              page: 1
            ) {
              error
              ids
              results
            }
          }
        `,
        variables: { query: trimmed },
      },
      token
    );

    baseDiag.httpStatus = response.status;

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error("[Hardcover] HTTP error:", {
        status: response.status,
        statusText: response.statusText,
        body: body.slice(0, 500),
        tokenChars: token.length,
      });
      const failureReason: HardcoverFailureReason =
        response.status === 401 || response.status === 403
          ? "unauthorized"
          : "http_error";
      return {
        books: [],
        diagnostics: {
          ...baseDiag,
          failureReason,
          hint: hintForFailure(failureReason, response.status),
        },
      };
    }

    const payload = (await response.json()) as HardcoverSearchResponse;

    if (payload.errors?.length) {
      console.error("[Hardcover] GraphQL errors:", payload.errors);
      const failureReason: HardcoverFailureReason = "graphql_error";
      return {
        books: [],
        diagnostics: {
          ...baseDiag,
          failureReason,
          hint: hintForFailure(failureReason, response.status),
        },
      };
    }

    const searchError = payload.data?.search?.error;
    if (searchError) {
      console.error("[Hardcover] search.error:", searchError);
      const failureReason: HardcoverFailureReason = "search_error";
      return {
        books: [],
        diagnostics: {
          ...baseDiag,
          failureReason,
          hint: hintForFailure(failureReason, response.status),
        },
      };
    }

    const ids = extractSearchIds(payload);
    const hits = extractSearchHits(payload);
    baseDiag.idsFound = ids.length;
    baseDiag.hitsFound = hits.length;

    let books = hits
      .map(parseHardcoverSearchHit)
      .filter((book): book is BookSummary => book !== null);

    const incomplete = books.filter(
      (book) => !isUsableHardcoverSearchBook(book)
    );

    // Hydrate when Typesense hits are missing/incomplete, or when hits
    // failed to parse but `ids` is populated (otherwise search returns []).
    const needsHydrate =
      ids.length > 0 &&
      (books.length < ids.length || incomplete.length > 0);

    if (needsHydrate) {
      console.info("[Hardcover] hydrating for missing desc/cover", {
        ids: ids.length,
        hits: hits.length,
        parsedHits: books.length,
        incomplete: incomplete.length,
      });
      const hydrated = await fetchHardcoverBooksByIds(ids.slice(0, 20), token);
      if (hydrated.length > 0) {
        const byId = new Map(books.map((book) => [book.id, book] as const));
        for (const book of hydrated) {
          const existing = byId.get(book.id);
          if (!existing) {
            byId.set(book.id, book);
            continue;
          }
          // Prefer hydrated fields when the Typesense hit was sparse.
          byId.set(book.id, {
            ...existing,
            description:
              existing.description?.trim() || book.description?.trim() || null,
            coverUrl:
              existing.coverUrl?.trim() || book.coverUrl?.trim() || null,
            authors:
              existing.authors.length > 0 ? existing.authors : book.authors,
            genres: existing.genres.length > 0 ? existing.genres : book.genres,
            publishedYear: existing.publishedYear ?? book.publishedYear,
            pageCount: existing.pageCount ?? book.pageCount,
            isbn: existing.isbn ?? book.isbn,
          });
        }
        // Preserve Typesense ranking
        books = ids
          .map((id) => byId.get(toHardcoverId(id)))
          .filter((book): book is BookSummary => Boolean(book));
      }
    }

    const beforeGate = books.length;
    books = books
      .filter(isUsableHardcoverSearchBook)
      .map(withDescriptionFallback);

    let failureReason: HardcoverFailureReason | null = null;
    if (beforeGate > 0 && books.length === 0) {
      failureReason = "quality_filtered";
      console.error("[Hardcover] all hits filtered by quality gate", {
        query: trimmed,
        ids: ids.length,
        hits: hits.length,
        beforeGate,
        sampleHit: summarizeHitForLog(hits[0]),
      });
    } else if (ids.length > 0 && books.length === 0) {
      failureReason = "quality_filtered";
      console.error("[Hardcover] ids present but 0 usable books after hydrate", {
        query: trimmed,
        ids: ids.length,
        hits: hits.length,
        resultsType:
          payload.data?.search?.results == null
            ? "null"
            : Array.isArray(payload.data.search.results)
              ? "array"
              : typeof payload.data.search.results,
        sampleHit: summarizeHitForLog(hits[0]),
        sampleIds: ids.slice(0, 5),
      });
    } else if (ids.length === 0 && hits.length === 0) {
      failureReason = "empty_response";
      console.warn("[Hardcover] empty Typesense response", {
        query: trimmed,
        hasSearchNode: Boolean(payload.data?.search),
        resultsPresent: payload.data?.search?.results != null,
        resultsType:
          payload.data?.search?.results == null
            ? "null"
            : Array.isArray(payload.data.search.results)
              ? "array"
              : typeof payload.data.search.results,
      });
    }

    console.info("[Hardcover] searchHardcover done", {
      query: trimmed,
      ids: ids.length,
      hits: hits.length,
      books: books.length,
      failureReason,
      sample: books.slice(0, 5).map((book) => ({
        title: book.title,
        authors: book.authors,
        year: book.publishedYear,
        genres: book.genres,
      })),
    });

    return {
      books,
      diagnostics: {
        ...baseDiag,
        booksReturned: books.length,
        failureReason,
        hint: hintForFailure(failureReason, response.status),
      },
    };
  } catch (error) {
    const aborted =
      error instanceof Error &&
      (error.name === "AbortError" || /aborted/i.test(error.message));
    console.error(
      aborted
        ? `[Hardcover] search timed out after ${FETCH_TIMEOUT_MS}ms:`
        : "[Hardcover] search failed:",
      error instanceof Error
        ? { name: error.name, message: error.message }
        : error
    );
    const failureReason: HardcoverFailureReason = aborted
      ? "timeout"
      : "network_error";
    return {
      books: [],
      diagnostics: {
        ...baseDiag,
        failureReason,
        hint: hintForFailure(failureReason, null),
      },
    };
  }
}

async function fetchHardcoverBooksByIds(
  ids: number[],
  token: string
): Promise<BookSummary[]> {
  try {
    const response = await fetchHardcoverGraphql(
      {
        query: `
          query BooksByIds($ids: [Int!]!) {
            books(where: { id: { _in: $ids } }, limit: 20) {
              ${BOOK_FIELDS}
            }
          }
        `,
        variables: { ids },
      },
      token
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error("[Hardcover] hydrate HTTP error:", {
        status: response.status,
        statusText: response.statusText,
        body: body.slice(0, 500),
      });
      return [];
    }

    const payload = (await response.json()) as HardcoverBooksResponse;
    if (payload.errors?.length) {
      console.error("[Hardcover] hydrate GraphQL errors:", payload.errors);
      return [];
    }

    const byId = new Map(
      (payload.data?.books ?? [])
        .map(parseHardcoverBook)
        .filter((book): book is BookSummary => book !== null)
        .map((book) => [book.id, book] as const)
    );

    return ids
      .map((id) => byId.get(toHardcoverId(id)))
      .filter((book): book is BookSummary => Boolean(book));
  } catch (error) {
    const aborted =
      error instanceof Error &&
      (error.name === "AbortError" || /aborted/i.test(error.message));
    console.error(
      aborted
        ? `[Hardcover] hydrate timed out after ${FETCH_TIMEOUT_MS}ms:`
        : "[Hardcover] hydrate failed:",
      error instanceof Error ? { name: error.name, message: error.message } : error
    );
    return [];
  }
}

/** Fetch a single Hardcover book by LorePath id (`hardcover-{id}`). */
export async function getHardcoverBookById(
  id: string
): Promise<BookDetail | null> {
  if (!isHardcoverId(id)) return null;

  const token = getHardcoverToken();
  if (!token) {
    console.error("[Hardcover] HARDCOVER_API_TOKEN is missing for getById");
    return null;
  }

  const numericId = Number(id.slice(HARDCOVER_ID_PREFIX.length));
  if (!Number.isFinite(numericId)) return null;

  try {
    const response = await fetchHardcoverGraphql(
      {
        query: `
          query GetBook($id: Int!) {
            books_by_pk(id: $id) {
              ${BOOK_FIELDS}
            }
          }
        `,
        variables: { id: numericId },
      },
      token
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error("[Hardcover] getById HTTP error:", {
        status: response.status,
        statusText: response.statusText,
        body: body.slice(0, 500),
      });
      return null;
    }

    const payload = (await response.json()) as HardcoverPkResponse;
    if (payload.errors?.length) {
      console.error("[Hardcover] getById GraphQL errors:", payload.errors);
    }

    const book = payload.data?.books_by_pk;
    if (!book) return null;
    const detail = parseHardcoverBookDetail(book);
    return detail ? withDescriptionFallback(detail) : null;
  } catch (error) {
    const aborted =
      error instanceof Error &&
      (error.name === "AbortError" || /aborted/i.test(error.message));
    console.error(
      aborted
        ? `[Hardcover] getById timed out after ${FETCH_TIMEOUT_MS}ms:`
        : "[Hardcover] getById failed:",
      error instanceof Error ? { name: error.name, message: error.message } : error
    );
    return null;
  }
}
