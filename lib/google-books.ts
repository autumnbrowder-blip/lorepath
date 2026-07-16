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
  constructor() {
    super("Google Books rate limit reached.");
    this.name = "RateLimitError";
  }
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

  const apiKey = process.env.GOOGLE_BOOKS_API_KEY?.trim();
  if (apiKey) {
    url.searchParams.set("key", apiKey);
  }

  return url.toString();
}

async function fetchGoogleBooks(
  url: string,
  options?: { revalidate?: number; noStore?: boolean }
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    return await fetch(
      url,
      options?.noStore
        ? { cache: "no-store", signal: controller.signal }
        : { next: { revalidate: options?.revalidate ?? 3600 }, signal: controller.signal }
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchGoogleBooksWithRetry(
  url: string,
  options?: { revalidate?: number; noStore?: boolean }
): Promise<Response> {
  let response = await fetchGoogleBooks(url, options);

  // Google occasionally returns transient 503s — retry once
  if (response.status === 503) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    response = await fetchGoogleBooks(url, options);
  }

  return response;
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

const GOOGLE_PAGE_SIZE = 20;

export type GoogleBooksPageResult = {
  books: BookSummary[];
  hasMore: boolean;
};

async function fetchGoogleSearch(
  query: string,
  page = 1,
  options?: SearchBooksOptions & { pageSize?: number }
): Promise<{ books: BookSummary[]; totalItems: number; pageSize: number }> {
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

  const response = await fetchGoogleBooksWithRetry(
    buildGoogleBooksUrl("volumes", params),
    { noStore: true }
  );

  if (response.status === 429) {
    throw new RateLimitError();
  }

  if (!response.ok) {
    throw new Error(`Google Books API error: ${response.status}`);
  }

  const data: GoogleBooksSearchResponse = await response.json();
  const books = parseGoogleBooksResponse(data);
  return {
    books,
    totalItems: data.totalItems ?? books.length,
    pageSize,
  };
}

export async function searchGoogleBooks(
  query: string,
  page = 1,
  options?: SearchBooksOptions
): Promise<GoogleBooksPageResult> {
  try {
    const { books, totalItems, pageSize } = await fetchGoogleSearch(
      query,
      page,
      options
    );

    // Single deterministic query per page — no alternate-query branching
    // (that path caused results to flicker between identical searches).
    const startIndex = (page - 1) * pageSize;
    const hasMore = startIndex + books.length < totalItems;

    if (totalItems > 0 && books.length === 0) {
      console.error(
        "[searchGoogleBooks] API returned items but all were filtered as low quality.",
        {
          query,
          page,
          mode: options?.mode,
          totalItems,
          pageSize,
        }
      );
    } else if (totalItems === 0) {
      console.error("[searchGoogleBooks] API returned 0 totalItems.", {
        query,
        page,
        mode: options?.mode,
        pageSize,
      });
    }

    return { books: dedupeBooks(books), hasMore };
  } catch (error) {
    if (error instanceof RateLimitError) {
      console.error(
        "[searchGoogleBooks] Rate limited (429). Returning empty page.",
        { query, page, mode: options?.mode }
      );
      return { books: [], hasMore: false };
    }

    console.error("[searchGoogleBooks] Request failed:", {
      query,
      page,
      mode: options?.mode,
      error: error instanceof Error ? error.message : error,
    });
    // Soft-fail so Promise.allSettled siblings still surface results
    return { books: [], hasMore: false };
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
    throw new RateLimitError();
  }

  if (response.status === 404) return null;

  if (!response.ok) {
    throw new Error(`Google Books API error: ${response.status}`);
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
    throw new RateLimitError();
  }

  if (!response.ok) {
    throw new Error(`Google Books API error: ${response.status}`);
  }

  const data: GoogleBooksSearchResponse = await response.json();
  const volume = data.items?.[0];
  if (!volume) return null;

  return parseGoogleBookDetail(volume as GoogleBooksVolumeResponse);
}
