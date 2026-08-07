import {
  getBigBookBookById,
  isBigBookConfigured,
  isBigBookId,
  searchBigBook,
} from "@/lib/big-book";
import { enrichBookDetail } from "@/lib/book-enrichment";
import { normalizeBookDetailForDisplay } from "@/lib/book-normalize";
import { withFinalizedTags } from "@/lib/book-tags";
import { enrichBooksWithCovers } from "@/lib/bookcover";
import { fillMissingCoverUrl } from "@/lib/cover-resolve";
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
  needsIsbndbEnrichment,
  searchIsbndb,
} from "@/lib/isbndb";
import {
  getNytBookById,
  isbnFromNytId,
  isNytId,
} from "@/lib/nyt-books";
import {
  getOpenLibraryBookById,
  getOpenLibraryBookByIsbn,
  getOpenLibraryBookByTitle,
  isOpenLibraryId,
  searchOpenLibrary,
} from "@/lib/open-library";
import { cacheBookDetail, getCachedBookBySlug } from "@/lib/book-cache";
import {
  softStep,
  summarizeFailures,
  withProviderRetry,
  type ProviderFailure,
} from "@/lib/provider-resilience";
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

/** Providers queried on every browse search (ISBNdb is enrichment-only). */
const SEARCH_SOURCES: BookSource[] = [
  "google",
  "openlibrary",
  "gutendex",
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

async function resolveSearchUserId(
  accessToken?: string | null
): Promise<string | null> {
  try {
    const auth = await createAuthenticatedClient({
      accessToken: accessToken ?? null,
    });
    if ("error" in auth) return null;
    return auth.user.id;
  } catch {
    return null;
  }
}

/**
 * Queries Google Books, Open Library, Gutendex, and Big Book in parallel.
 * ISBNdb is NOT queried here — reserved for detail enrichment / fallbacks
 * to stay within the 5k/day · 1 req/s plan.
 * Pass `{ mode: "genre" }` for subject/topic searches from genre tags.
 * Provider failures are isolated via Promise.allSettled.
 * Missing covers are backfilled via Open Library ISBN/OLID URLs (sync, best-effort).
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

  const userIdPromise = resolveSearchUserId(options?.accessToken);

  const [
    googleSettled,
    openLibrarySettled,
    gutendexSettled,
    bigBookSettled,
  ] = await Promise.allSettled([
    searchGoogleBooks(searchQuery, pageNumber, searchOptions),
    searchOpenLibrary(searchQuery, pageNumber, searchOptions),
    // Gutenberg keyword search adds noise for modern titles; keep for genre
    // discovery and page-1 text (ranked down), skip on later pages.
    genreMode || pageNumber === 1
      ? searchGutendex(searchQuery, pageNumber, searchOptions)
      : Promise.resolve(EMPTY_PAGE),
    searchBigBook(searchQuery, pageNumber, searchOptions),
  ]);

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
  const bigBookResult = readSettledPage("Big Book", bigBookSettled);

  const googleBooks = googleResult.books;
  const openLibraryBooks = openLibraryResult.books;
  const gutendexBooks = gutendexResult.books;
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
      bigbook: bigBookBooks.length,
      totalRaw: providerRawCount,
      bigBookConfigured,
      googleBooksApiKeyConfigured: Boolean(
        process.env.GOOGLE_BOOKS_API_KEY?.trim()
      ),
      isbndbInSearchFlood: false,
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
    ...openLibraryBooks,
    ...googleBooks,
    ...gutendexBooks,
    ...bigBookBooks,
    ...ratedBooks,
  ];

  // First pass merges and dedupes but keeps everything: a book must not be
  // dropped for a missing description before enrichment has had a chance.
  let books = finalizeSearchBooks(rawCombined, {
    ratedIds: new Set(ratedSlugs),
    protectedBooks: ratedBooks,
    debug: SEARCH_DEBUG,
    query: genreMode ? undefined : searchQuery,
    deferQualityFilter: true,
  });

  // Known-title / exact-phrase fallback when the flood missed an exact title
  // (e.g. provider outage, or a prior author-misclassification miss).
  if (!genreMode && pageNumber === 1) {
    try {
      const { fetchTitleSearchFallbacks } = await import(
        "@/lib/search-title-fallback"
      );
      const fallbackHits = await fetchTitleSearchFallbacks(searchQuery, books);
      if (fallbackHits.length > 0) {
        books = finalizeSearchBooks([...books, ...fallbackHits], {
          ratedIds: new Set(ratedSlugs),
          protectedBooks: ratedBooks,
          debug: SEARCH_DEBUG,
          query: searchQuery,
          deferQualityFilter: true,
        });
        if (SEARCH_DEBUG) {
          console.info("[searchBooks] title fallback merged", {
            query: searchQuery,
            fallbackHits: fallbackHits.length,
            afterMerge: books.length,
          });
        }
      }
    } catch (error) {
      console.error("[searchBooks] title fallback failed:", error);
    }
  }

  // Relevance ranking for text search (genre mode keeps year-forward order
  // from finalize, then preferMatchingGenreTags).
  if (!genreMode) {
    books = rankSearchResults(books, searchQuery);
  }

  // Thin flood (provider outage or a title the free sources barely index) —
  // spend a metered ISBNdb query rather than return an empty shelf.
  if (!genreMode && pageNumber === 1) {
    try {
      const { fetchBackupSearchResults } = await import(
        "@/lib/search-enrichment"
      );
      const backup = await fetchBackupSearchResults(searchQuery, books);
      if (backup.length > 0) {
        books = rankSearchResults(
          finalizeSearchBooks([...books, ...backup], {
            ratedIds: new Set(ratedSlugs),
            protectedBooks: ratedBooks,
            debug: SEARCH_DEBUG,
            query: searchQuery,
            deferQualityFilter: true,
          }),
          searchQuery
        );
      }
    } catch (error) {
      console.error("[searchBooks] backup provider search failed:", error);
    }
  }

  // Fill missing synopses from the other sources (OL work, Google, ISBNdb,
  // Hardcover) while the ranking still holds every candidate.
  const descriptionSources: Record<string, string> = {};
  try {
    const { enrichSearchDescriptions } = await import(
      "@/lib/search-enrichment"
    );
    const enriched = await enrichSearchDescriptions(books, {
      debug: SEARCH_DEBUG,
    });
    books = enriched.books;
    enriched.filled.forEach((source, id) => {
      descriptionSources[id] = source;
    });
  } catch (error) {
    console.error("[searchBooks] description enrichment failed:", error);
  }

  // Now that every candidate has had its chance, apply the quality filter.
  books = finalizeSearchBooks(books, {
    ratedIds: new Set(ratedSlugs),
    protectedBooks: ratedBooks,
    debug: SEARCH_DEBUG,
    query: genreMode ? undefined : searchQuery,
  });

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

  // Best-effort cover fallback for the survivors that still lack one
  // (sync OL ISBN/OLID — never stalls Browse on an external cover API).
  books = await enrichBooksWithCovers(books);

  if (genreMode) {
    books = preferMatchingGenreTags(books, searchQuery);
  }

  const sourceCounts: Partial<Record<BookSource, number>> = {
    google: googleBooks.length,
    openlibrary: openLibraryBooks.length,
    gutendex: gutendexBooks.length,
    // Omit Big Book from counts when unconfigured so the UI does not show a
    // permanent "(0)" as if the provider ran and failed.
    ...(bigBookConfigured || bigBookBooks.length > 0
      ? { bigbook: bigBookBooks.length }
      : {}),
  };

  // User-only rated identities → rewrite card ids to rated slugs, then list them.
  // Match by books.slug OR work-level title+author so OL/Google/NYT edition ids align.
  let userRatedSlugs: string[] = [];
  try {
    const userId = await userIdPromise;
    if (userId) {
      const { getUserRatedIdentities } = await import("@/lib/ratings");
      const {
        alignBooksToRatedSlugs,
        inscribedCardIdsForBooks,
      } = await import("@/lib/user-rated-identity");
      const identities = await getUserRatedIdentities(userId);
      if (identities.length > 0) {
        books = alignBooksToRatedSlugs(books, identities);
        userRatedSlugs = inscribedCardIdsForBooks(books, identities);
      }
    }
  } catch (error) {
    console.error("[searchBooks] user rated-identity lookup failed:", error);
  }

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
      bigBookResult.hasMore,
    userRatedSlugs,
    descriptionSources,
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

export type BookDetailResult = {
  book: BookDetail | null;
  /** Every provider/step failure seen while resolving this id. */
  failures: ProviderFailure[];
  /**
   * No record loaded and every failure looked temporary (429 / 5xx / timeout).
   * The detail page uses this to choose "archives are resting" over a dead id.
   */
  transient: boolean;
};

/** Enough of a record to render the tome: id, title, and an author line. */
function isUsableCoreBook(book: BookDetail | null): book is BookDetail {
  return Boolean(book?.title?.trim());
}

/**
 * Core record only (title, authors, cover, description, year, id).
 * Tries the id's own provider with one retry, then any other source that can
 * resolve the same id/isbn/title. Never throws — failures are collected.
 */
async function loadCoreBook(
  bookId: string,
  searchHint: string | undefined,
  onFailure: (failure: ProviderFailure) => void
): Promise<BookDetail | null> {
  const attempt = <T,>(
    provider: string,
    run: (tries: number) => Promise<T>,
    timeoutMs = 5000
  ) => withProviderRetry({ provider, id: bookId, timeoutMs, onFailure }, run);

  if (isBigBookId(bookId)) {
    const primary = await attempt("bigbook", () => getBigBookBookById(bookId));
    if (isUsableCoreBook(primary)) return primary;
  } else if (isOpenLibraryId(bookId)) {
    // Retry gets a longer OL budget — most misses here are slow work JSON.
    const primary = await attempt("openlibrary", (tries) =>
      getOpenLibraryBookById(bookId, { timeoutMs: tries === 1 ? 3000 : 6000 })
    );
    if (isUsableCoreBook(primary)) return primary;
  } else if (isGutendexId(bookId)) {
    const primary = await attempt("gutendex", () => getGutendexBookById(bookId));
    if (isUsableCoreBook(primary)) return primary;
  } else if (isIsbndbId(bookId)) {
    const primary = await attempt("isbndb", () => resolveIsbndbBook(bookId));
    if (isUsableCoreBook(primary)) return primary;
  } else if (isNytId(bookId)) {
    const primary = await attempt("nyt", () => resolveNytBook(bookId));
    if (isUsableCoreBook(primary)) return primary;
  } else {
    // Bare ids are Google volume ids (may include hyphens, e.g. E-OLEAAAQBAJ).
    const primary = await attempt("google", () =>
      resolveGoogleVolume(bookId, searchHint)
    );
    if (isUsableCoreBook(primary)) return primary;
  }

  // Cross-provider recovery: any source that can answer for this id/isbn/title.
  const isbn = isbnFromIsbndbId(bookId) ?? isbnFromNytId(bookId) ?? null;
  if (isbn) {
    const viaGoogleIsbn = await attempt("google-isbn", () =>
      getGoogleBookByIsbn(isbn)
    );
    if (isUsableCoreBook(viaGoogleIsbn)) return { ...viaGoogleIsbn, id: bookId };

    const viaOlIsbn = await attempt("openlibrary-isbn", () =>
      getOpenLibraryBookByIsbn(isbn)
    );
    if (isUsableCoreBook(viaOlIsbn)) return { ...viaOlIsbn, id: bookId };
  }

  if (searchHint) {
    const viaHint = await attempt(
      "search-hint",
      () => resolveViaSearchHint(bookId, searchHint),
      8000
    );
    if (isUsableCoreBook(viaHint)) return { ...viaHint, id: bookId };
  }

  const viaOl = await attempt(
    "openlibrary-fallback",
    () => resolveOpenLibraryFallback({ bookId, searchHint }),
    8000
  );
  if (isUsableCoreBook(viaOl)) return { ...viaOl, id: bookId };

  return null;
}

/**
 * Resolve a `/books/[id]` record with provider failures reported instead of
 * thrown. Core data loads first; enrichment is best-effort and isolated, so a
 * struggling secondary API can never blank a tome that did resolve.
 */
export const loadBookDetail = cache(async function loadBookDetail(
  id: string,
  options?: GetBookByIdOptions
): Promise<BookDetailResult> {
  const bookId = decodeBookRouteId(id);
  if (!bookId) return { book: null, failures: [], transient: false };

  const searchHint = options?.searchHint?.trim() || undefined;
  const failures: ProviderFailure[] = [];
  const onFailure = (failure: ProviderFailure) => failures.push(failure);

  let book: BookDetail | null = null;
  let fromCache = false;

  // 1) Prefer previously resolved books in Supabase — survives provider outages.
  const cached = await softStep(
    { provider: "book-cache", id: bookId, timeoutMs: 4000, onFailure },
    null as BookDetail | null,
    () => getCachedBookBySlug(bookId)
  );
  if (isUsableCoreBook(cached)) {
    book = cached;
    fromCache = true;
  }

  // 2) Core provider data (with retry + cross-provider fallback).
  if (!book) {
    book = await loadCoreBook(bookId, searchHint, onFailure);
  }

  if (!isUsableCoreBook(book)) {
    const transient =
      failures.length > 0 && failures.every((failure) => failure.transient);
    console.error("[getBookById] no usable record:", {
      id: bookId,
      searchHint: searchHint ?? null,
      transient,
      reasons: summarizeFailures(failures),
      failures,
    });
    return { book: null, failures, transient };
  }

  // Keep the route/external id stable. NYT and ISBNdb lookups may resolve via
  // Google Books and temporarily swap `book.id`; ratings are keyed by slug, so
  // the URL id and save/load id must match or marks vanish on refresh.
  book = { ...book, id: bookId };

  // Sync cover fill (provider → OL ISBN → OL OLID) before slower enrichment.
  book = fillMissingCoverUrl(book);

  // 3) Enrichment — every step optional, isolated, and time-boxed.
  // Cached complete books still get known-edition year enrichment so reprints
  // can show First published + Latest edition without a schema migration.
  const core = book;
  if (!fromCache || needsIsbndbEnrichment(core)) {
    book = await softStep(
      { provider: "enrichment", id: bookId, onFailure },
      core,
      async () => fillMissingCoverUrl(await enrichBookDetail(core))
    );
  } else {
    book = await softStep(
      { provider: "known-edition-enrichment", id: bookId, onFailure },
      core,
      async () => {
        const { enrichKnownEditionMetadata } = await import(
          "@/lib/book-enrichment"
        );
        return fillMissingCoverUrl(await enrichKnownEditionMetadata(core));
      }
    );
  }

  if (needsIsbndbEnrichment(book)) {
    const beforeIsbndb = book;
    book = await softStep(
      { provider: "isbndb-enrichment", id: bookId, onFailure },
      beforeIsbndb,
      async () =>
        fillMissingCoverUrl(await enrichBookDetailWithIsbndb(beforeIsbndb))
    );
  }

  // Final sync catalog year pass after ISBNdb so older ISBN years cannot wipe
  // First published / Latest edition on popular reprints.
  const beforeYears = book;
  book = await softStep(
    { provider: "known-edition-years", id: bookId, onFailure },
    beforeYears,
    async () => {
      const { applyKnownEditionYears } = await import("@/lib/book-enrichment");
      return applyKnownEditionYears(beforeYears);
    }
  );

  const canonical = { ...book, id: bookId };

  // Fire-and-forget cache write — soft-fail.
  void cacheBookDetail(bookId, canonical).catch((error) => {
    console.error("[getBookById] cache write failed:", {
      id: bookId,
      message: error instanceof Error ? error.message : String(error),
    });
  });

  const sexualContentAverage = await softStep(
    { provider: "community-ratings", id: bookId, timeoutMs: 3000 },
    null as number | null,
    async () => {
      const { getCommunityRatings } = await import("@/lib/ratings");
      const community = await getCommunityRatings(bookId);
      return community.averages?.sexual_content ?? null;
    }
  );

  let tagged = canonical;
  try {
    tagged = withFinalizedTags(canonical, { sexualContentAverage });
  } catch (error) {
    console.error("[getBookById] tag finalize failed:", {
      id: bookId,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  // Providers occasionally return objects where the types promise strings
  // (OL `publishers: [{ name }]`). Coerce before render — an unrenderable
  // field would otherwise crash the whole tome page.
  tagged = normalizeBookDetailForDisplay(tagged);

  if (failures.length > 0) {
    console.warn("[getBookById] recovered after provider failures:", {
      id: bookId,
      reasons: summarizeFailures(failures),
    });
  }

  return { book: tagged, failures, transient: false };
});

/** Book record only. Returns null instead of throwing on provider failures. */
export async function getBookById(
  id: string,
  options?: GetBookByIdOptions
): Promise<BookDetail | null> {
  const { book } = await loadBookDetail(id, options);
  return book;
}

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

/**
 * Open Library is the primary reliable fallback when Google 429s or returns null.
 * Tries ISBN first, then title (+ author / search hint).
 */
async function resolveOpenLibraryFallback(options: {
  bookId: string;
  isbn?: string | null;
  title?: string | null;
  authors?: string[];
  searchHint?: string;
}): Promise<BookDetail | null> {
  const { bookId, isbn, title, authors = [], searchHint } = options;

  if (isbn) {
    try {
      const byIsbn = await getOpenLibraryBookByIsbn(isbn);
      if (byIsbn) return { ...byIsbn, id: bookId };
    } catch (error) {
      console.error("[getBookById] OL ISBN fallback failed:", {
        bookId,
        isbn,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const titleQuery = title?.trim() || searchHint?.trim() || "";
  if (titleQuery) {
    try {
      const byTitle = await getOpenLibraryBookByTitle(titleQuery, authors);
      if (byTitle) return { ...byTitle, id: bookId };
    } catch (error) {
      console.error("[getBookById] OL title fallback failed:", {
        bookId,
        title: titleQuery,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      const page = await searchOpenLibrary(titleQuery, 1);
      const best = rankSearchResults(page.books, titleQuery)[0];
      if (best) {
        if (isOpenLibraryId(best.id)) {
          try {
            const detail = await getOpenLibraryBookById(best.id);
            if (detail) return { ...detail, id: bookId };
          } catch {
            // Use search summary below.
          }
        }
        return summaryToDetail(best, bookId);
      }
    } catch (error) {
      console.error("[getBookById] OL search fallback failed:", {
        bookId,
        title: titleQuery,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return null;
}

async function resolveIsbndbBook(bookId: string): Promise<BookDetail | null> {
  const isbn = isbnFromIsbndbId(bookId);
  if (isbn) {
    try {
      const viaGoogle = await getGoogleBookByIsbn(isbn);
      if (viaGoogle) return viaGoogle;
    } catch (error) {
      // Keep going: OL and ISBNdb below can still resolve this ISBN.
      console.error("[getBookById] ISBNdb→Google ISBN failed:", {
        bookId,
        isbn,
        message: error instanceof Error ? error.message : String(error),
        status:
          error instanceof RateLimitError
            ? error.status
            : (error as Error & { status?: number })?.status,
      });
    }

    const viaOl = await resolveOpenLibraryFallback({ bookId, isbn });
    if (viaOl) return viaOl;

    const viaIsbndb = await fetchIsbndbByIsbn(isbn);
    if (viaIsbndb) return { ...viaIsbndb, id: bookId };
    return null;
  }

  const slugQuery = bookId
    .replace(/^isbndb-/i, "")
    .replace(/-/g, " ")
    .trim();
  if (!slugQuery) return null;

  const viaOl = await resolveOpenLibraryFallback({
    bookId,
    title: slugQuery,
    searchHint: slugQuery,
  });
  if (viaOl) return viaOl;

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
      // Keep going: OL by ISBN and the NYT list record are still available.
      console.error("[getBookById] NYT→Google ISBN failed:", {
        bookId,
        isbn,
        message: error instanceof Error ? error.message : String(error),
        status:
          error instanceof RateLimitError
            ? error.status
            : (error as Error & { status?: number })?.status,
      });
    }

    const viaOl = await resolveOpenLibraryFallback({ bookId, isbn });
    if (viaOl) return viaOl;
  }
  return getNytBookById(bookId);
}

/**
 * Resolve a Google Books volume id with OL/search-hint fallback.
 * The caller (loadCoreBook) supplies the transient-error retry.
 */
async function resolveGoogleVolume(
  bookId: string,
  searchHint?: string
): Promise<BookDetail | null> {
  let lastError: unknown = null;

  try {
    const book = await getGoogleBookById(bookId);
    if (book) return book;
  } catch (error) {
    lastError = error;
    console.error("[getBookById] Google volume fetch failed:", {
      bookId,
      message: error instanceof Error ? error.message : String(error),
      status:
        error instanceof RateLimitError
          ? error.status
          : (error as Error & { status?: number })?.status,
    });
  }

  if (searchHint) {
    const fromHint = await resolveViaSearchHint(bookId, searchHint);
    if (fromHint) return fromHint;
  }

  // Always attempt Open Library before resting-archives / RateLimitError.
  const fromOl = await resolveOpenLibraryFallback({
    bookId,
    searchHint,
  });
  if (fromOl) return fromOl;

  if (lastError) {
    throw lastError;
  }
  return null;
}

/**
 * When direct Google volume fetch fails, use the browse query to recover
 * the same volume (exact id) or the best title/author match.
 * Open Library is preferred; ISBNdb is a last-resort detail fallback only.
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

      const viaOl = await resolveOpenLibraryFallback({
        bookId,
        isbn: exactGoogle.isbn,
        title: exactGoogle.title,
        authors: exactGoogle.authors,
        searchHint: hint,
      });
      if (viaOl) return viaOl;

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

      if (best) {
        const viaOl = await resolveOpenLibraryFallback({
          bookId,
          isbn: best.isbn,
          title: best.title,
          authors: best.authors,
          searchHint: hint,
        });
        if (viaOl) return viaOl;
        return summaryToDetail(best, bookId);
      }
    }
  } catch (error) {
    console.error("[getBookById] Google searchHint failed:", {
      bookId,
      hint,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  // Primary reliable alternate: Open Library only (no ISBNdb flood).
  const fromOl = await resolveOpenLibraryFallback({
    bookId,
    searchHint: hint,
    title: hint,
  });
  if (fromOl) return fromOl;

  // Last-resort ISBNdb detail fallback (throttled, soft-fail).
  try {
    const isbndbPage = await searchIsbndb(hint, 1);
    const best = rankSearchResults(isbndbPage.books, hint)[0];
    if (!best) return null;

    const isbn = isbnFromIsbndbId(best.id) ?? best.isbn ?? null;
    if (isbn) {
      const detail = await fetchIsbndbByIsbn(isbn);
      if (detail) return { ...detail, id: bookId };
    }
    return summaryToDetail(best, bookId);
  } catch (error) {
    console.error("[getBookById] ISBNdb searchHint fallback failed:", {
      bookId,
      hint,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

