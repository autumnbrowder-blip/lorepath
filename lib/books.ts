import { enrichBookDetail } from "@/lib/book-enrichment";
import { withFinalizedTags } from "@/lib/book-tags";
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
  getHardcoverBookById,
  isHardcoverConfigured,
  isHardcoverId,
  searchHardcover,
} from "@/lib/hardcover";
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
  "hardcover",
  "google",
  "openlibrary",
  "gutendex",
  "isbndb",
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

/**
 * Queries Hardcover, Google Books, Open Library, Gutendex, and ISBNdb in parallel.
 * Pass `{ mode: "genre" }` for subject/topic searches from genre tags.
 * Provider failures are isolated via Promise.allSettled.
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

  const [
    hardcoverSettled,
    googleSettled,
    openLibrarySettled,
    gutendexSettled,
    isbndbSettled,
  ] = await Promise.allSettled([
    // Hardcover has no pagination here — only query page 1.
    pageNumber === 1
      ? searchHardcover(searchQuery).then((books) => {
          console.info("[searchBooks] Hardcover settled", {
            query: searchQuery,
            count: books.length,
          });
          return { books, hasMore: false };
        })
      : Promise.resolve({ books: [] as BookSummary[], hasMore: false }),
    searchGoogleBooks(searchQuery, pageNumber, searchOptions),
    searchOpenLibrary(searchQuery, pageNumber, searchOptions),
    searchGutendex(searchQuery, pageNumber, searchOptions),
    searchIsbndb(searchQuery, pageNumber, searchOptions),
  ]);

  if (hardcoverSettled.status === "rejected") {
    console.error("[searchBooks] Hardcover failed:", {
      query: searchQuery,
      page: pageNumber,
      mode: options?.mode ?? "text",
      reason: hardcoverSettled.reason,
    });
  }

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

  const hardcoverResult = readSettledPage("Hardcover", hardcoverSettled);
  const googleResult = readSettledPage("Google Books", googleSettled);
  const openLibraryResult = readSettledPage(
    "Open Library",
    openLibrarySettled
  );
  const gutendexResult = readSettledPage("Gutendex", gutendexSettled);
  const isbndbResult = readSettledPage("ISBNdb", isbndbSettled);

  const hardcoverBooks = hardcoverResult.books;
  const googleBooks = googleResult.books;
  const openLibraryBooks = openLibraryResult.books;
  const gutendexBooks = gutendexResult.books;
  const isbndbBooks = isbndbResult.books;

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

  const hardcoverConfigured = isHardcoverConfigured();
  if (!hardcoverConfigured && pageNumber === 1) {
    console.error(
      "[searchBooks] HARDCOVER_API_TOKEN not set — Hardcover will contribute 0 results. Set exact name HARDCOVER_API_TOKEN in .env.local and Netlify (raw JWT, no Bearer, no NEXT_PUBLIC_), then redeploy."
    );
  } else if (
    hardcoverConfigured &&
    pageNumber === 1 &&
    hardcoverSettled.status === "fulfilled" &&
    hardcoverBooks.length === 0
  ) {
    console.error(
      "[searchBooks] Hardcover returned 0 usable books (not silently ignored).",
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

  console.info("[searchBooks] raw provider counts", {
    query: searchQuery,
    page: pageNumber,
    mode: genreMode ? "genre" : "text",
    hardcoverConfigured,
    hardcover: hardcoverBooks.length,
    google: googleBooks.length,
    openlibrary: openLibraryBooks.length,
    gutendex: gutendexBooks.length,
    isbndb: isbndbBooks.length,
  });

  // Hardcover first so merge/dedupe prefer its id + metadata on ties.
  let books = finalizeSearchBooks([
    ...hardcoverBooks,
    ...googleBooks,
    ...openLibraryBooks,
    ...gutendexBooks,
    ...isbndbBooks,
  ]);

  if (genreMode) {
    books = preferMatchingGenreTags(books, searchQuery);
  }

  const sourceCounts: Partial<Record<BookSource, number>> = {
    // Omit Hardcover from counts when unconfigured so the UI does not show a
    // permanent "(0)" as if the provider ran and failed.
    ...(hardcoverConfigured || hardcoverBooks.length > 0
      ? { hardcover: hardcoverBooks.length }
      : {}),
    google: googleBooks.length,
    openlibrary: openLibraryBooks.length,
    gutendex: gutendexBooks.length,
    isbndb: isbndbBooks.length,
  };

  return {
    books,
    sources: SEARCH_SOURCES,
    sourceCounts,
    providerStatus: {
      hardcover: { configured: hardcoverConfigured },
    },
    source: "multi",
    page: pageNumber,
    hasMore:
      hardcoverResult.hasMore ||
      googleResult.hasMore ||
      openLibraryResult.hasMore ||
      gutendexResult.hasMore ||
      isbndbResult.hasMore,
  };
}

export const getBookById = cache(async function getBookById(
  id: string
): Promise<BookDetail | null> {
  let book: BookDetail | null = null;

  if (isHardcoverId(id)) {
    book = await getHardcoverBookById(id);
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
