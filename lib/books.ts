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
import { searchGutendex } from "@/lib/gutendex";
import {
  getGoogleBookById,
  getGoogleBookByIsbn,
  RateLimitError,
  searchGoogleBooks,
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
import type {
  BookDetail,
  BookSearchResult,
  BookSource,
  BookSummary,
} from "@/types/book";
import { cache } from "react";

export { finalizeSearchBooks } from "@/lib/search-finalize";

const EMPTY_PAGE = { books: [] as BookSummary[], hasMore: false };

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
    searchGutendex(searchQuery, pageNumber, searchOptions),
    searchIsbndb(searchQuery, pageNumber, searchOptions),
    searchBigBook(searchQuery, pageNumber, searchOptions),
  ]);

  if (googleSettled.status === "rejected") {
    console.error("[searchBooks] Google Books failed:", {
      query: searchQuery,
      page: pageNumber,
      mode: options?.mode ?? "text",
      reason: googleSettled.reason,
    });
  }

  if (isbndbSettled.status === "rejected") {
    console.error("[searchBooks] ISBNdb failed:", {
      query: searchQuery,
      page: pageNumber,
      mode: options?.mode ?? "text",
      reason: isbndbSettled.reason,
    });
  }

  if (bigBookSettled.status === "rejected") {
    console.error("[searchBooks] Big Book failed:", {
      query: searchQuery,
      page: pageNumber,
      mode: options?.mode ?? "text",
      reason: bigBookSettled.reason,
    });
  }

  const googleResult = readSettledPage("Google Books", googleSettled);
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

  if (googleSettled.status === "fulfilled" && googleBooks.length === 0) {
    console.error(
      "[searchBooks] Google Books returned 0 usable books (not silently ignored).",
      {
        query: searchQuery,
        page: pageNumber,
        mode: options?.mode ?? "text",
      }
    );
  }

  const isbndbConfigured = Boolean(process.env.ISBNDB_API_KEY?.trim());
  if (
    isbndbConfigured &&
    isbndbSettled.status === "fulfilled" &&
    isbndbBooks.length === 0
  ) {
    console.error(
      "[searchBooks] ISBNdb returned 0 usable books (not silently ignored).",
      {
        query: searchQuery,
        page: pageNumber,
        mode: options?.mode ?? "text",
      }
    );
  }

  const bigBookConfigured = isBigBookConfigured();
  if (!bigBookConfigured && pageNumber === 1) {
    console.warn(
      "[searchBooks] BIG_BOOK_API_KEY not set — Big Book will contribute 0 results. Get a free key at https://bigbookapi.com and set BIG_BOOK_API_KEY in .env.local (and your host env), then restart / redeploy."
    );
  }

  const providerRawCount =
    googleBooks.length +
    openLibraryBooks.length +
    gutendexBooks.length +
    isbndbBooks.length +
    bigBookBooks.length;

  console.info("[searchBooks] raw provider counts", {
    query: searchQuery,
    page: pageNumber,
    mode: genreMode ? "genre" : "text",
    google: googleBooks.length,
    openlibrary: openLibraryBooks.length,
    gutendex: gutendexBooks.length,
    isbndb: isbndbBooks.length,
    bigbook: bigBookBooks.length,
    totalRaw: providerRawCount,
    bigBookConfigured,
  });

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

  console.info("[searchBooks] rated books matching query", {
    query: searchQuery,
    page: pageNumber,
    ratedMatches: ratedBooks.length,
    ratedSlugs: ratedSlugs.slice(0, 20),
  });

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
    debug: true,
  });

  console.info("[searchBooks] after finalize", {
    query: searchQuery,
    page: pageNumber,
    rawCombined: rawCombined.length,
    afterFinalize: books.length,
    removedByDedupeApprox: Math.max(0, rawCombined.length - books.length),
    ratedProtected: ratedBooks.length,
  });

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
  };
}

export const getBookById = cache(async function getBookById(
  id: string
): Promise<BookDetail | null> {
  let book: BookDetail | null = null;

  if (isBigBookId(id)) {
    book = await getBigBookBookById(id);
  } else if (isOpenLibraryId(id)) {
    book = await getOpenLibraryBookById(id);
  } else if (isIsbndbId(id)) {
    const isbn = isbnFromIsbndbId(id);
    if (isbn) {
      try {
        book = await getGoogleBookByIsbn(isbn);
      } catch {
        // Fall through to ISBNdb metadata
      }
      if (!book) {
        book = await fetchIsbndbByIsbn(isbn);
        if (book) book = { ...book, id };
      }
    }
  } else if (isNytId(id)) {
    const isbn = isbnFromNytId(id);
    if (isbn) {
      try {
        book = await getGoogleBookByIsbn(isbn);
      } catch {
        // Fall through to NYT list metadata
      }
    }
    if (!book) {
      book = await getNytBookById(id);
    }
  } else {
    try {
      book = await getGoogleBookById(id);
    } catch (error) {
      if (!(error instanceof RateLimitError)) {
        throw error;
      }
    }
  }

  if (!book) return null;

  // Keep the route/external id stable. NYT and ISBNdb lookups may resolve via
  // Google Books and temporarily swap `book.id`; ratings are keyed by slug, so
  // the URL id and save/load id must match or marks vanish on refresh.
  book = { ...book, id };

  const enriched = await enrichBookDetail(book);
  const withIsbndb = await enrichBookDetailWithIsbndb(enriched);
  const canonical = { ...withIsbndb, id };

  let sexualContentAverage: number | null = null;
  try {
    const { getCommunityRatings } = await import("@/lib/ratings");
    const community = await getCommunityRatings(id);
    sexualContentAverage = community.averages?.sexual_content ?? null;
  } catch {
    // Ratings are optional for tagging.
  }

  return withFinalizedTags(canonical, { sexualContentAverage });
});
