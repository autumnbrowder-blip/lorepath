import {
  cleanAuthors,
  cleanDescription,
  cleanTitle,
  dedupeBooks,
  formatAuthorSearchQuery,
  isAuthorQuery,
  isLowQualityBook,
  keepProviderSubjects,
  parsePublishedYear,
} from "@/lib/book-utils";
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
  status = 429;

  constructor(message = "Google Books rate limit reached.") {
    super(message);
    this.name = "RateLimitError";
  }
}

export type GoogleBooksProviderError = {
  message: string;
  status?: number;
};

const FETCH_TIMEOUT_MS = 10000;
const GOOGLE_PAGE_SIZE = 20;
const MAX_503_ATTEMPTS = 3;

function getGoogleBooksApiKey(): string | null {
  const key = process.env.GOOGLE_BOOKS_API_KEY?.trim();
  return key || null;
}

function normalizeCoverUrl(url: string | undefined): string | null {
  if (!url) return null;
  return url.replace("http://", "https://");
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
    const body = (await response.json()) as {
      error?: { message?: string; status?: string };
    };
    return body.error?.message?.trim() || null;
  } catch {
    return null;
  }
}

async function fetchGoogleBooks(
  url: string,
  options?: { revalidate?: number; noStore?: boolean }
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    // Await the full response headers before clearing the timeout so a slow
    // but successful request is never aborted mid-flight after resolve.
    const response = await fetch(
      url,
      options?.noStore
        ? { cache: "no-store", signal: controller.signal }
        : { next: { revalidate: options?.revalidate ?? 3600 }, signal: controller.signal }
    );
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchGoogleBooksWithRetry(
  url: string,
  options?: { revalidate?: number; noStore?: boolean }
): Promise<Response> {
  let response = await fetchGoogleBooks(url, options);

  // Google occasionally returns transient 503s — retry with short backoff.
  for (
    let attempt = 1;
    response.status === 503 && attempt < MAX_503_ATTEMPTS;
    attempt++
  ) {
    await new Promise((resolve) => setTimeout(resolve, 350 * attempt));
    response = await fetchGoogleBooks(url, options);
  }

  return response;
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
};

async function fetchGoogleSearch(
  query: string,
  page = 1,
  options?: SearchBooksOptions & { pageSize?: number }
): Promise<{
  books: BookSummary[];
  totalItems: number;
  pageSize: number;
  rawCount: number;
}> {
  const genreMode = isGenreSearchMode(options?.mode);
  const pageSize = Math.min(
    40,
    options?.pageSize ?? (genreMode ? GENRE_PAGE_SIZE : GOOGLE_PAGE_SIZE)
  );

  const searchQuery = genreMode
    ? toGoogleSubjectQuery(query)
    : isAuthorQuery(query)
      ? formatAuthorSearchQuery(query)
      : query;

  const startIndex = Math.max(0, (page - 1) * pageSize);
  const params = new URLSearchParams({
    q: searchQuery,
    maxResults: String(pageSize),
    startIndex: String(startIndex),
    printType: "books",
    orderBy: genreMode ? "newest" : "relevance",
  });

  const url = buildGoogleBooksUrl("volumes", params);
  // Short Data Cache window — avoids burning daily quota on identical searches
  // while still staying fresh enough for browse. Do not use no-store here.
  const response = await fetchGoogleBooksWithRetry(url, { revalidate: 300 });

  if (response.status === 429) {
    const bodyMessage = await readGoogleErrorBody(response);
    throw new RateLimitError(
      bodyMessage ?? "Google Books rate limit reached."
    );
  }

  if (!response.ok) {
    const bodyMessage = await readGoogleErrorBody(response);
    const error = new Error(
      bodyMessage ?? `Google Books API error: ${response.status}`
    );
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  const data: GoogleBooksSearchResponse = await response.json();
  const rawCount = data.items?.length ?? 0;
  const books = parseGoogleBooksResponse(data);
  return {
    books,
    totalItems: data.totalItems ?? books.length,
    pageSize,
    rawCount,
  };
}

export async function searchGoogleBooks(
  query: string,
  page = 1,
  options?: SearchBooksOptions
): Promise<GoogleBooksPageResult> {
  if (!getGoogleBooksApiKey()) {
    // Anonymous Books API quota is effectively 0 from many hosts; a key is required.
    console.warn(
      "[searchGoogleBooks] GOOGLE_BOOKS_API_KEY is not set — requests often fail with HTTP 429 (quota exceeded)."
    );
  }

  try {
    const { books, totalItems, pageSize, rawCount } = await fetchGoogleSearch(
      query,
      page,
      options
    );

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

    return {
      books: dedupeBooks(books),
      hasMore,
      rawCount,
      error: null,
    };
  } catch (error) {
    const providerError = toProviderError(
      error,
      error instanceof Error
        ? (error as Error & { status?: number }).status
        : undefined
    );

    if (error instanceof RateLimitError) {
      console.error(
        "[searchGoogleBooks] Rate limited (429). Returning empty page.",
        { query, page, mode: options?.mode, ...providerError }
      );
    } else {
      console.error("[searchGoogleBooks] Request failed:", {
        query,
        page,
        mode: options?.mode,
        ...providerError,
      });
    }

    // Soft-fail so Promise.allSettled siblings still surface results
    return { books: [], hasMore: false, rawCount: 0, error: providerError };
  }
}

export async function getGoogleBookById(
  volumeId: string
): Promise<BookDetail | null> {
  const response = await fetchGoogleBooks(
    buildGoogleBooksUrl(`volumes/${volumeId}`),
    { revalidate: 3600 }
  );

  if (response.status === 429) {
    const bodyMessage = await readGoogleErrorBody(response);
    throw new RateLimitError(
      bodyMessage ?? "Google Books rate limit reached."
    );
  }

  if (response.status === 404) return null;

  if (!response.ok) {
    const bodyMessage = await readGoogleErrorBody(response);
    throw new Error(
      bodyMessage ?? `Google Books API error: ${response.status}`
    );
  }

  const data: GoogleBooksVolumeResponse = await response.json();
  return parseGoogleBookDetail(data);
}

/** Look up a Google Books volume by ISBN (for NYT and other ISBN-based ids). */
export async function getGoogleBookByIsbn(
  isbn: string
): Promise<BookDetail | null> {
  const digits = isbn.replace(/\D/g, "");
  if (!digits) return null;

  const params = new URLSearchParams({
    q: `isbn:${digits}`,
    maxResults: "1",
    printType: "books",
  });

  const response = await fetchGoogleBooks(buildGoogleBooksUrl("volumes", params), {
    revalidate: 3600,
  });

  if (response.status === 429) {
    const bodyMessage = await readGoogleErrorBody(response);
    throw new RateLimitError(
      bodyMessage ?? "Google Books rate limit reached."
    );
  }

  if (!response.ok) {
    const bodyMessage = await readGoogleErrorBody(response);
    throw new Error(
      bodyMessage ?? `Google Books API error: ${response.status}`
    );
  }

  const data: GoogleBooksSearchResponse = await response.json();
  const volume = data.items?.[0];
  if (!volume) return null;

  return parseGoogleBookDetail(volume as GoogleBooksVolumeResponse);
}
