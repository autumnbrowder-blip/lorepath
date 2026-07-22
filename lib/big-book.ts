import {
  cleanAuthors,
  cleanDescription,
  cleanTitle,
  isLowQualityBook,
  keepProviderSubjects,
  parsePublishedYear,
} from "@/lib/book-utils";
import {
  isGenreSearchMode,
  normalizeGenreQuery,
  type SearchBooksOptions,
} from "@/lib/genre-search";
import type { BookDetail, BookSummary } from "@/types/book";

/**
 * Big Book API (https://bigbookapi.com) — semantic book search.
 *
 * Contract (verified against https://bigbookapi.com/docs/):
 *   GET https://api.bigbookapi.com/search-books?query=...&number=...&offset=...
 *   GET https://api.bigbookapi.com/{id}   (full book info incl. description/ISBN)
 * Auth: API key via `x-api-key` header (or `?api-key=`); we use the header so
 * the key never appears in URLs/logs. Free tier: sign up at bigbookapi.com.
 * Errors: 401 unauthorized, 402 daily quota exhausted, 429 rate limited.
 */
const BIG_BOOK_API_BASE = "https://api.bigbookapi.com";
const FETCH_TIMEOUT_MS = 8000;
const PAGE_SIZE = 20;

export const BIG_BOOK_ID_PREFIX = "bigbook-";

export function isBigBookId(id: string): boolean {
  return id.startsWith(BIG_BOOK_ID_PREFIX);
}

export function toBigBookId(id: number | string): string {
  return `${BIG_BOOK_ID_PREFIX}${id}`;
}

function getBigBookApiKey(): string | null {
  const key = process.env.BIG_BOOK_API_KEY?.trim();
  return key || null;
}

/** Whether a usable BIG_BOOK_API_KEY is present (server-only). */
export function isBigBookConfigured(): boolean {
  return Boolean(getBigBookApiKey());
}

type BigBookAuthor = {
  id?: number;
  name?: string | null;
};

type BigBookSearchBook = {
  id?: number | string | null;
  title?: string | null;
  subtitle?: string | null;
  image?: string | null;
  authors?: BigBookAuthor[] | null;
  genres?: string[] | null;
  publish_date?: number | string | null;
  identifiers?: {
    isbn_13?: string | null;
    isbn_10?: string | null;
  } | null;
};

type BigBookSearchResponse = {
  available?: number;
  number?: number;
  offset?: number;
  /** Each entry is a group of editions — the first is the representative one. */
  books?: BigBookSearchBook[][] | null;
};

type BigBookInfoResponse = BigBookSearchBook & {
  description?: string | null;
  number_of_pages?: number | string | null;
};

async function fetchBigBook(path: string): Promise<Response | null> {
  const apiKey = getBigBookApiKey();
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(`${BIG_BOOK_API_BASE}${path}`, {
      headers: {
        Accept: "application/json",
        "x-api-key": apiKey,
      },
      next: { revalidate: 3600 },
      signal: controller.signal,
    });
  } catch (error) {
    const aborted =
      error instanceof Error &&
      (error.name === "AbortError" || /abort/i.test(error.message));
    console.error(
      aborted
        ? `[bigbook] request timed out after ${FETCH_TIMEOUT_MS}ms`
        : "[bigbook] request failed:",
      aborted ? path.split("?")[0] : error
    );
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function parseAuthors(authors?: BigBookAuthor[] | null): string[] {
  return cleanAuthors(
    (authors ?? [])
      .map((author) => author.name?.trim())
      .filter((name): name is string => Boolean(name))
  );
}

function parseCover(image?: string | null): string | null {
  const raw = image?.trim();
  return raw ? raw.replace("http://", "https://") : null;
}

function parseIsbn(
  identifiers?: BigBookSearchBook["identifiers"]
): string | null {
  const isbn13 = identifiers?.isbn_13?.replace(/\D/g, "");
  if (isbn13 && isbn13.length === 13) return isbn13;
  const isbn10 = identifiers?.isbn_10?.replace(/\D/g, "");
  if (isbn10 && (isbn10.length === 10 || isbn10.length === 13)) return isbn10;
  return null;
}

/** Big Book genres are lowercase snake_case (e.g. "science_fiction"). */
function parseGenres(genres?: string[] | null): string[] {
  const readable = (genres ?? [])
    .map((genre) =>
      genre
        .trim()
        .split(/[_\s]+/)
        .filter(Boolean)
        .map((word) => word[0].toUpperCase() + word.slice(1))
        .join(" ")
    )
    .filter(Boolean);
  return keepProviderSubjects(readable);
}

function parsePageCount(pages?: number | string | null): number | null {
  const parsed = typeof pages === "string" ? Number.parseFloat(pages) : pages;
  if (typeof parsed === "number" && Number.isFinite(parsed) && parsed > 0) {
    return Math.round(parsed);
  }
  return null;
}

/** Normalize a Big Book row into a LorePath BookSummary. */
export function parseBigBookBook(
  book: BigBookSearchBook
): BookSummary | null {
  if (book.id == null || !book.title?.trim()) return null;

  const summary: BookSummary = {
    id: toBigBookId(book.id),
    title: cleanTitle(book.title),
    authors: parseAuthors(book.authors),
    coverUrl: parseCover(book.image),
    description: cleanDescription(
      (book as BigBookInfoResponse).description ?? null
    ),
    genres: parseGenres(book.genres),
    publishedYear: parsePublishedYear(book.publish_date),
    source: "bigbook",
    isbn: parseIsbn(book.identifiers),
    pageCount: null,
  };

  if (isLowQualityBook(summary)) return null;
  return summary;
}

export type BigBookPageResult = {
  books: BookSummary[];
  hasMore: boolean;
};

const EMPTY_PAGE: BigBookPageResult = { books: [], hasMore: false };

/**
 * Search Big Book API (paginated via offset).
 * Returns an empty page when the key is missing or the request fails —
 * never throws, so Promise.allSettled callers stay simple.
 */
export async function searchBigBook(
  query: string,
  page = 1,
  options?: SearchBooksOptions
): Promise<BigBookPageResult> {
  const genreMode = isGenreSearchMode(options?.mode);
  const trimmed = (genreMode ? normalizeGenreQuery(query) : query).trim();
  if (!trimmed || !isBigBookConfigured()) return EMPTY_PAGE;

  const pageNumber = Math.max(1, page);
  const offset = (pageNumber - 1) * PAGE_SIZE;

  const params = new URLSearchParams({
    query: trimmed,
    number: String(PAGE_SIZE),
    offset: String(offset),
  });
  if (genreMode) {
    // Genre queries are natural-language friendly thanks to the semantic index.
    params.set("query", `${trimmed} books`);
  }

  const response = await fetchBigBook(`/search-books?${params.toString()}`);
  if (!response) return EMPTY_PAGE;

  if (!response.ok) {
    const level = response.status === 402 ? "warn" : "error";
    console[level]("[bigbook] search error — not silently ignored.", {
      status: response.status,
      query: trimmed,
      page: pageNumber,
      hint:
        response.status === 401
          ? "BIG_BOOK_API_KEY was rejected — check the key value."
          : response.status === 402
            ? "Daily Big Book API quota exhausted (free plan)."
            : response.status === 429
              ? "Big Book API rate limit hit."
              : null,
    });
    return EMPTY_PAGE;
  }

  try {
    const data = (await response.json()) as BigBookSearchResponse;
    // `books` is an array of edition groups; take each group's first entry.
    const rows = (data.books ?? [])
      .map((group) => (Array.isArray(group) ? group[0] : group))
      .filter((row): row is BigBookSearchBook => Boolean(row));

    const books = rows
      .map(parseBigBookBook)
      .filter((book): book is BookSummary => book !== null);

    const available = typeof data.available === "number" ? data.available : 0;
    const hasMore = offset + PAGE_SIZE < available;

    if (process.env.SEARCH_DEBUG === "1") {
      console.info("[bigbook] search done", {
        query: trimmed,
        page: pageNumber,
        available,
        rows: rows.length,
        books: books.length,
      });
    }

    return { books, hasMore };
  } catch (error) {
    console.error("[bigbook] failed to parse search response:", error);
    return EMPTY_PAGE;
  }
}

/** Fetch full book info by LorePath id (`bigbook-{id}`). */
export async function getBigBookBookById(
  id: string
): Promise<BookDetail | null> {
  if (!isBigBookId(id) || !isBigBookConfigured()) return null;

  const numericId = Number(id.slice(BIG_BOOK_ID_PREFIX.length));
  if (!Number.isFinite(numericId) || numericId <= 0) return null;

  const response = await fetchBigBook(`/${numericId}`);
  if (!response) return null;

  if (!response.ok) {
    if (response.status !== 404) {
      console.error("[bigbook] getById error:", { status: response.status, id });
    }
    return null;
  }

  try {
    const data = (await response.json()) as BigBookInfoResponse;
    const summary = parseBigBookBook(data);
    if (!summary) return null;

    return {
      ...summary,
      publisher: null,
      pageCount: parsePageCount(data.number_of_pages),
      language: null,
      isbn: summary.isbn ?? null,
    };
  } catch (error) {
    console.error("[bigbook] failed to parse book info:", error);
    return null;
  }
}
