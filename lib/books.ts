import {
  getBigBookBookById,
  isBigBookConfigured,
  isBigBookId,
  searchBigBook,
} from "@/lib/big-book";
import { enrichBookDetail } from "@/lib/book-enrichment";
import { withFinalizedTags } from "@/lib/book-tags";
import { enrichBooksWithCovers } from "@/lib/bookcover";
import {
  isGenreSearchMode,
  normalizeGenreQuery,
  preferMatchingGenreTags,
  type SearchBooksOptions,
} from "@/lib/genre-search";
import { searchGutendex, getGutendexBookById, isGutendexId } from "@/lib/gutendex";
import {
  getGoogleBookById,
  getGoogleBookByIsbn,
  RateLimitError,
  searchGoogleBooks,
  type GoogleBooksPageResult,
} from "@/lib/google-books";
import {
  enrichBookDetailWithIsbndb,
  fetchIsbndbByIsbn,
  isIsbndbId,
  isbnFromIsbndbId,
  searchIsbndb,
} from "@/lib/isbndb";
import {
  getNytBookById,
  isbnFromNytId,
  isNytId,
} from "@/lib/nyt-books";
import {
  getOpenLibraryBookById,
  isOpenLibraryId,
  searchOpenLibrary,
} from "@/lib/open-library";
import { finalizeSearchBooks } from "@/lib/search-finalize";
import { createAuthenticatedClient } from "@/lib/supabase/server";
import { rankSearchResults } from "@/lib/book-utils";
import type {
  BookDetail,
  BookSearchResult,
  BookSource,
  BookSummary,
} from "@/types/book";
import { cache } from "react";

export { finalizeSearchBooks } from "@/lib/search-finalize";

const EMPTY_PAGE = { books: [] as BookSummary[], hasMore: false };
const EMPTY_GOOGLE_PAGE: GoogleBooksPageResult = {
  books: [],
  hasMore: false,
  rawCount: 0,
  error: null,
};
const SEARCH_DEBUG = process.env.SEARCH_DEBUG === "1";

const SEARCH_SOURCES: BookSource[] = [
  "google",
  "openlibrary",
  "gutendex",
  "isbndb",
  "bigbook",
];

function readSettledPage(
  label: string,
  result: PromiseSettledResult<{ books: BookSummary[]; hasMore: boolean }>
): { books: BookSummary[]; hasMore: boolean } {
  if (result.status === "fulfilled") {
    return result.value;
  }

  console.error(`[searchBooks] ${label} rejected:`, result.reason);
  return EMPTY_PAGE;
}

function readSettledGoogle(
  result: PromiseSettledResult<GoogleBooksPageResult>
): GoogleBooksPageResult {
  if (result.status === "fulfilled") {
    return result.value;
  }

  const reason = result.reason;
  const message =
    reason instanceof Error ? reason.message : String(reason ?? "unknown error");
  const status =
    reason instanceof Error
      ? (reason as Error & { status?: number }).status
      : undefined;

  console.error(`[searchBooks] Google Books rejected:`, {
    message,
    status,
    reason,
  });

  return {
    ...EMPTY_GOOGLE_PAGE,
    error: { message, status },
  };
}

async function resolveSearchUserId(): Promise<string | null> {
  try {
    const auth = await createAuthenticatedClient();
    if ("error" in auth) return null;
    return auth.user.id;
  } catch {
    return null;
  }
}

/**
 * Queries Google Books, Open Library, Gutendex, ISBNdb, and Big Book in parallel.
 * Pass `{ mode: "genre" }` for subject/topic searches from genre tags.
 * Provider failures are isolated via Promise.allSettled.
 * Missing covers are backfilled via the BookCover API (bounded, best-effort).
 * Rated books from Supabase that match the query are always included.
 */
export async function searchBooks(
  query: string,
  page = 1,
  options?: SearchBooksOptions
): Promise<BookSearchResult> {
  const pageNumber = Math.max(1, page);
  const genreMode = isGenreSearchMode(options?.mode);
  const searchQuery = genreMode ? normalizeGenreQuery(query) : query.trim();
  const searchOptions: SearchBooksOptions | undefined = genreMode
    ? { mode: "genre" }
    : undefined;

  const userIdPromise = resolveSearchUserId();

  const [
    googleSettled,
    openLibrarySettled,
    gutendexSettled,
    isbndbSettled,
    bigBookSettled,
  ] = await Promise.allSettled([
    searchGoogleBooks(searchQuery, pageNumber, searchOptions),
    searchOpenLibrary(searchQuery, pageNumber, searchOptions),
    // Gutenberg keyword search adds noise for modern titles; keep for genre
    // discovery and page-1 text (ranked down), skip on later pages.
    genreMode || pageNumber === 1
      ? searchGutendex(searchQuery, pageNumber, searchOptions)
      : Promise.resolve(EMPTY_PAGE),
    searchIsbndb(searchQuery, pageNumber, searchOptions),
    searchBigBook(searchQuery, pageNumber, searchOptions),
  ]);

  if (SEARCH_DEBUG && isbndbSettled.status === "rejected") {
    console.error("[searchBooks] ISBNdb failed:", {
      query: searchQuery,
      page: pageNumber,
      mode: options?.mode ?? "text",
      reason: isbndbSettled.reason,
    });
  }

  if (SEARCH_DEBUG && bigBookSettled.status === "rejected") {
    console.error("[searchBooks] Big Book failed:", {
      query: searchQuery,
      page: pageNumber,
      mode: options?.mode ?? "text",
      reason: bigBookSettled.reason,
    });
  }

  const googleResult = readSettledGoogle(googleSettled);
  const openLibraryResult = readSettledPage(
    "Open Library",
    openLibrarySettled
  );
  const gutendexResult = readSettledPage("Gutendex", gutendexSettled);
  const isbndbResult = readSettledPage("ISBNdb", isbndbSettled);
  const bigBookResult = readSettledPage("Big Book", bigBookSettled);

  const googleBooks = googleResult.books;
  const openLibraryBooks = openLibraryResult.books;
  const gutendexBooks = gutendexResult.books;
  const isbndbBooks = isbndbResult.books;
  const bigBookBooks = bigBookResult.books;

  if (googleResult.error) {
    console.error("[searchBooks] Google Books provider error:", {
      query: searchQuery,
      page: pageNumber,
      mode: options?.mode ?? "text",
      googleError: googleResult.error,
      googleRawCount: googleResult.rawCount,
    });
  }

  const isbndbConfigured = Boolean(process.env.ISBNDB_API_KEY?.trim());
  const bigBookConfigured = isBigBookConfigured();
  if (!bigBookConfigured && pageNumber === 1 && SEARCH_DEBUG) {
    console.warn(
      "[searchBooks] BIG_BOOK_API_KEY not set — Big Book will contribute 0 results."
    );
  }

  const providerRawCount =
    googleBooks.length +
    openLibraryBooks.length +
    gutendexBooks.length +
    isbndbBooks.length +
    bigBookBooks.length;

  if (SEARCH_DEBUG) {
    console.info("[searchBooks] raw provider counts", {
      query: searchQuery,
      page: pageNumber,
      mode: genreMode ? "genre" : "text",
      google: googleBooks.length,
      googleRawCount: googleResult.rawCount,
      googleError: googleResult.error,
      openlibrary: openLibraryBooks.length,
      gutendex: gutendexBooks.length,
      isbndb: isbndbBooks.length,
      bigbook: bigBookBooks.length,
      totalRaw: providerRawCount,
      bigBookConfigured,
      isbndbConfigured,
      googleBooksApiKeyConfigured: Boolean(
        process.env.GOOGLE_BOOKS_API_KEY?.trim()
      ),
    });
  }

  // Rated books that match this query — always surface them on page 1,
  // prefer DB identity so ratings stay attached after dedupe.
  let ratedBooks: BookSummary[] = [];
  let ratedSlugs: string[] = [];
  if (pageNumber === 1) {
    try {
      const userId = await userIdPromise;
      const { findRatedBooksMatchingQuery } = await import("@/lib/ratings");
      const rated = await findRatedBooksMatchingQuery(searchQuery, {
        mode: genreMode ? "genre" : "text",
        userId,
      });
      ratedBooks = rated.books;
      ratedSlugs = rated.ratedSlugs;
    } catch (error) {
      console.error("[searchBooks] rated-book lookup failed:", error);
    }
  }

  if (SEARCH_DEBUG) {
    console.info("[searchBooks] rated books matching query", {
      query: searchQuery,
      page: pageNumber,
      ratedMatches: ratedBooks.length,
      ratedSlugs: ratedSlugs.slice(0, 20),
    });
  }

  const rawCombined = [
    ...googleBooks,
    ...openLibraryBooks,
    ...gutendexBooks,
    ...isbndbBooks,
    ...bigBookBooks,
    ...ratedBooks,
  ];

  let books = finalizeSearchBooks(rawCombined, {
    ratedIds: new Set(ratedSlugs),
    protectedBooks: ratedBooks,
    debug: SEARCH_DEBUG,
  });

  // Relevance ranking for text search (genre mode keeps year-forward order
  // from finalize, then preferMatchingGenreTags).
  if (!genreMode) {
    books = rankSearchResults(books, searchQuery);
  }

  if (SEARCH_DEBUG) {
    console.info("[searchBooks] after finalize", {
      query: searchQuery,
      page: pageNumber,
      rawCombined: rawCombined.length,
      afterFinalize: books.length,
      removedByDedupeApprox: Math.max(0, rawCombined.length - books.length),
      ratedProtected: ratedBooks.length,
    });
  }

  // Best-effort cover fallback for the survivors that still lack one.
  books = await enrichBooksWithCovers(books);

  if (genreMode) {
    books = preferMatchingGenreTags(books, searchQuery);
  }

  const sourceCounts: Partial<Record<BookSource, number>> = {
    google: googleBooks.length,
    openlibrary: openLibraryBooks.length,
    gutendex: gutendexBooks.length,
    isbndb: isbndbBooks.length,
    // Omit Big Book from counts when unconfigured so the UI does not show a
    // permanent "(0)" as if the provider ran and failed.
    ...(bigBookConfigured || bigBookBooks.length > 0
      ? { bigbook: bigBookBooks.length }
      : {}),
  };

  return {
    books,
    sources: SEARCH_SOURCES,
    sourceCounts,
    source: "multi",
    page: pageNumber,
    hasMore:
      googleResult.hasMore ||
      openLibraryResult.hasMore ||
      gutendexResult.hasMore ||
      isbndbResult.hasMore ||
      bigBookResult.hasMore,
    // Temporary debug fields — remove once Google search stability is confirmed.
    googleError: googleResult.error,
    googleRawCount: googleResult.rawCount,
  };
}

export type GetBookByIdOptions = {
  /**
   * Browse `?q=` hint. When a direct Google volume fetch fails (rate limit /
   * transient error), we search providers with this query and pick the best match.
   */
  searchHint?: string;
};

export const getBookById = cache(async function getBookById(
  id: string,
  options?: GetBookByIdOptions
): Promise<BookDetail | null> {
  const bookId = decodeBookRouteId(id);
  if (!bookId) return null;

  const searchHint = options?.searchHint?.trim() || undefined;
  let book: BookDetail | null = null;

  if (isBigBookId(bookId)) {
    book = await getBigBookBookById(bookId);
  } else if (isOpenLibraryId(bookId)) {
    book = await getOpenLibraryBookById(bookId);
  } else if (isGutendexId(bookId)) {
    book = await getGutendexBookById(bookId);
  } else if (isIsbndbId(bookId)) {
    book = await resolveIsbndbBook(bookId);
  } else if (isNytId(bookId)) {
    book = await resolveNytBook(bookId);
  } else {
    // Bare ids are Google volume ids (may include hyphens, e.g. E-OLEAAAQBAJ).
    book = await resolveGoogleVolume(bookId, searchHint);
  }

  if (!book) return null;

  // Keep the route/external id stable. NYT and ISBNdb lookups may resolve via
  // Google Books and temporarily swap `book.id`; ratings are keyed by slug, so
  // the URL id and save/load id must match or marks vanish on refresh.
  book = { ...book, id: bookId };

  const enriched = await enrichBookDetail(book);
  const withIsbndb = await enrichBookDetailWithIsbndb(enriched);
  const canonical = { ...withIsbndb, id: bookId };

  let sexualContentAverage: number | null = null;
  try {
    const { getCommunityRatings } = await import("@/lib/ratings");
    const community = await getCommunityRatings(bookId);
    sexualContentAverage = community.averages?.sexual_content ?? null;
  } catch {
    // Ratings are optional for tagging.
  }

  return withFinalizedTags(canonical, { sexualContentAverage });
});

/** Decode a `/books/[id]` segment safely (handles encodeURIComponent links). */
function decodeBookRouteId(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

function summaryToDetail(summary: BookSummary, id: string): BookDetail {
  return {
    ...summary,
    id,
    publisher: null,
    pageCount: summary.pageCount ?? null,
    language: null,
    isbn: summary.isbn ?? null,
  };
}

async function resolveIsbndbBook(bookId: string): Promise<BookDetail | null> {
  const isbn = isbnFromIsbndbId(bookId);
  if (isbn) {
    try {
      const viaGoogle = await getGoogleBookByIsbn(isbn);
      if (viaGoogle) return viaGoogle;
    } catch (error) {
      console.error("[getBookById] ISBNdb→Google ISBN failed:", {
        bookId,
        isbn,
        message: error instanceof Error ? error.message : String(error),
      });
      if (!(error instanceof RateLimitError)) {
        throw error;
      }
    }
    const viaIsbndb = await fetchIsbndbByIsbn(isbn);
    if (viaIsbndb) return { ...viaIsbndb, id: bookId };
    return null;
  }

  const slugQuery = bookId
    .replace(/^isbndb-/i, "")
    .replace(/-/g, " ")
    .trim();
  if (!slugQuery) return null;

  const page = await searchIsbndb(slugQuery, 1);
  const match =
    page.books.find((row) => row.id === bookId) ??
    rankSearchResults(page.books, slugQuery)[0];
  return match ? summaryToDetail(match, bookId) : null;
}

async function resolveNytBook(bookId: string): Promise<BookDetail | null> {
  const isbn = isbnFromNytId(bookId);
  if (isbn) {
    try {
      const viaGoogle = await getGoogleBookByIsbn(isbn);
      if (viaGoogle) return viaGoogle;
    } catch (error) {
      console.error("[getBookById] NYT→Google ISBN failed:", {
        bookId,
        isbn,
        message: error instanceof Error ? error.message : String(error),
      });
      if (!(error instanceof RateLimitError)) {
        throw error;
      }
    }
  }
  return getNytBookById(bookId);
}

/**
 * Resolve a Google Books volume id with retries + search-hint fallback.
 * Never swallows RateLimitError into a silent null.
 */
async function resolveGoogleVolume(
  bookId: string,
  searchHint?: string
): Promise<BookDetail | null> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const book = await getGoogleBookById(bookId);
      if (book) return book;
      break;
    } catch (error) {
      lastError = error;
      console.error(
        `[getBookById] Google volume fetch failed (attempt ${attempt}):`,
        {
          bookId,
          message: error instanceof Error ? error.message : String(error),
          status:
            error instanceof RateLimitError
              ? error.status
              : (error as Error & { status?: number })?.status,
        }
      );
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 350 * attempt));
      }
    }
  }

  if (searchHint) {
    const fromHint = await resolveViaSearchHint(bookId, searchHint);
    if (fromHint) return fromHint;
  }

  if (lastError) {
    throw lastError;
  }
  return null;
}

/**
 * When direct Google volume fetch fails, use the browse query to recover
 * the same volume (exact id) or the best title/author match.
 */
async function resolveViaSearchHint(
  bookId: string,
  searchHint: string
): Promise<BookDetail | null> {
  const hint = searchHint.trim();
  if (!hint) return null;

  try {
    const googlePage = await searchGoogleBooks(hint, 1);
    const exactGoogle = googlePage.books.find((row) => row.id === bookId);
    if (exactGoogle) {
      try {
        const detail = await getGoogleBookById(exactGoogle.id);
        if (detail) return detail;
      } catch (error) {
        console.error("[getBookById] hint exact-id detail failed:", {
          bookId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return summaryToDetail(exactGoogle, bookId);
    }

    if (googlePage.books.length > 0) {
      const best = rankSearchResults(googlePage.books, hint)[0];
      if (best?.isbn) {
        try {
          const byIsbn = await getGoogleBookByIsbn(best.isbn);
          if (byIsbn) return { ...byIsbn, id: bookId };
        } catch (error) {
          console.error("[getBookById] hint ISBN fallback failed:", {
            bookId,
            isbn: best.isbn,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
      if (best) return summaryToDetail(best, bookId);
    }
  } catch (error) {
    console.error("[getBookById] Google searchHint failed:", {
      bookId,
      hint,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const [olPage, isbndbPage] = await Promise.all([
      searchOpenLibrary(hint, 1),
      searchIsbndb(hint, 1),
    ]);
    const pooled = rankSearchResults(
      [...olPage.books, ...isbndbPage.books],
      hint
    );
    const best = pooled[0];
    if (!best) return null;

    if (isOpenLibraryId(best.id)) {
      const detail = await getOpenLibraryBookById(best.id);
      if (detail) return { ...detail, id: bookId };
    }
    if (isIsbndbId(best.id)) {
      const isbn = isbnFromIsbndbId(best.id) ?? best.isbn ?? null;
      if (isbn) {
        const detail = await fetchIsbndbByIsbn(isbn);
        if (detail) return { ...detail, id: bookId };
      }
    }
    return summaryToDetail(best, bookId);
  } catch (error) {
    console.error("[getBookById] alternate searchHint failed:", {
      bookId,
      hint,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

