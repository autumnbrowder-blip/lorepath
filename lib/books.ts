import {
  getBigBookBookById,
  isBigBookId,
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
  isGoogleBooksBusy,
  RateLimitError,
  searchGoogleBooks,
  type GoogleBooksPageResult,
} from "@/lib/google-books";
import {
  enrichFromHardcover,
  isHardcoverId,
  peekHardcoverMemoryCache,
} from "@/lib/hardcover";
import {
  enrichBookDetailWithIsbndb,
  fetchIsbndbByIsbn,
  hasIsbndbApiKey,
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
import { bookIsbnKey, cacheBookDetail, getCachedBookBySlug, persistHardcoverCache } from "@/lib/book-cache";
import {
  createDeadline,
  softStep,
  summarizeFailures,
  withProviderRetry,
  withTimeout,
  type ProviderFailure,
} from "@/lib/provider-resilience";
import { finalizeSearchBooks } from "@/lib/search-finalize";
import {
  clearInFlightSearch,
  cloneCachedSearchPage,
  getCachedSearchPage,
  getInFlightSearch,
  searchCacheKey,
  setCachedSearchPage,
  setInFlightSearch,
  type CachedSearchPage,
} from "@/lib/search-cache";
import {
  bookMatchesSearchQuery,
  dropBrowseJunk,
  isTitleOnlyStub,
  rankBrowseSearchResults,
  rankSearchResults,
} from "@/lib/book-utils";
import { googleTitlePriorityQuery } from "@/lib/search-query";
import { unstable_noStore as noStore } from "next/cache";
import type {
  BookDetail,
  BookSearchResult,
  BookSource,
  BookSummary,
} from "@/types/book";
import { cache } from "react";

export { finalizeSearchBooks } from "@/lib/search-finalize";

function emptyPage(): { books: BookSummary[]; hasMore: boolean } {
  return { books: [], hasMore: false };
}

function emptyGooglePage(
  error: GoogleBooksPageResult["error"] = null
): GoogleBooksPageResult {
  return { books: [], hasMore: false, rawCount: 0, error };
}

const SEARCH_DEBUG = process.env.SEARCH_DEBUG === "1";
/** Optional catalogs (Google, Gutendex, ISBNdb). Never block after OL returns. */
const OPTIONAL_SEARCH_TIMEOUT_MS = 2000;
/** Open Library is required — search.json is often slower than optional catalogs. */
const OPEN_LIBRARY_SEARCH_TIMEOUT_MS = 12000;
/** Detail-page enrichment total budget after core book is resolved. */
const DETAIL_ENRICH_BUDGET_MS = 1500;
/** Core catalog lookups — keep short so Hardcover cannot decide page existence. */
const CORE_LOOKUP_TIMEOUT_MS = 2000;

/** Catalog sources for browse search. Hardcover is never called here. */
const SEARCH_SOURCES: BookSource[] = [
  "openlibrary",
  "google",
  "gutendex",
  "isbndb",
];

function cloneSummaries(books: BookSummary[]): BookSummary[] {
  return books.map((book) => ({ ...book }));
}

function readSettledPage(
  label: string,
  result: PromiseSettledResult<{ books: BookSummary[]; hasMore: boolean }>
): { books: BookSummary[]; hasMore: boolean } {
  if (result.status === "fulfilled") {
    return {
      books: cloneSummaries(result.value.books),
      hasMore: result.value.hasMore,
    };
  }

  console.error(`[searchBooks] ${label} rejected:`, result.reason);
  return emptyPage();
}

function readSettledGoogle(
  result: PromiseSettledResult<GoogleBooksPageResult>
): GoogleBooksPageResult {
  if (result.status === "fulfilled") {
    return {
      ...result.value,
      books: cloneSummaries(result.value.books),
    };
  }

  const reason = result.reason;
  const message =
    reason instanceof Error ? reason.message : String(reason ?? "unknown error");
  const status: number | undefined =
    reason instanceof Error
      ? (reason as Error & { status?: number | null }).status ?? undefined
      : undefined;

  console.error(`[searchBooks] Google Books rejected:`, {
    message,
    status,
  });
  return emptyGooglePage({
    message,
    status: status ?? undefined,
  });
}

function settledTimedOut(result: PromiseSettledResult<unknown>): boolean {
  return (
    result.status === "rejected" &&
    result.reason instanceof Error &&
    result.reason.name === "TimeoutError"
  );
}

function settledFailed(result: PromiseSettledResult<unknown>): boolean {
  return result.status === "rejected";
}

/** Catalog-only page — never attaches ratings or preferences. */
function toSearchResult(page: CachedSearchPage): BookSearchResult {
  const cloned = cloneCachedSearchPage(page);
  return {
    books: cloned.books,
    sources: cloned.sources,
    sourceCounts: cloned.sourceCounts,
    source: cloned.source,
    page: cloned.page,
    hasMore: cloned.hasMore,
    descriptionSources: cloned.descriptionSources,
    userRatedSlugs: [],
    googleError: cloned.googleError,
    googleRawCount: cloned.googleRawCount,
    allSourcesTimedOut: cloned.allSourcesTimedOut,
  };
}

/**
 * Fetch one browse page from catalog APIs only.
 * Open Library is required (longer budget); Google / Gutendex / ISBNdb are
 * optional at 2s. Promise.allSettled so a 2s optional timeout cannot reject
 * unhandled while OL is still in flight. Hardcover and Supabase are never called.
 */
async function fetchSearchPageUncached(
  searchQuery: string,
  pageNumber: number,
  genreMode: boolean,
  searchOptions: SearchBooksOptions | undefined
): Promise<CachedSearchPage> {
  const includeIsbndb = hasIsbndbApiKey();
  const includeGutendex = genreMode || pageNumber === 1;
  const titlePriorityQuery =
    !genreMode && pageNumber === 1
      ? googleTitlePriorityQuery(searchQuery)
      : null;

  // Attach allSettled immediately so optional 2s timeouts are never unhandled
  // while Open Library (required) is still running. Hardcover stays off.
  const [
    openLibrarySettled,
    googleSettled,
    googleTitleSettled,
    gutendexSettled,
    isbndbSettled,
  ] = await Promise.allSettled([
    withTimeout(
      searchOpenLibrary(searchQuery, pageNumber, searchOptions),
      OPEN_LIBRARY_SEARCH_TIMEOUT_MS,
      "openlibrary search"
    ),
    withTimeout(
      searchGoogleBooks(searchQuery, pageNumber, searchOptions),
      OPTIONAL_SEARCH_TIMEOUT_MS,
      "google search"
    ),
    titlePriorityQuery
      ? withTimeout(
          searchGoogleBooks(titlePriorityQuery, pageNumber, {
            ...searchOptions,
            tripRateLimitCircuit: false,
          }),
          OPTIONAL_SEARCH_TIMEOUT_MS,
          "google title-priority search"
        )
      : Promise.resolve(emptyGooglePage()),
    includeGutendex
      ? withTimeout(
          searchGutendex(searchQuery, pageNumber, searchOptions),
          OPTIONAL_SEARCH_TIMEOUT_MS,
          "gutendex search"
        )
      : Promise.resolve(emptyPage()),
    includeIsbndb
      ? withTimeout(
          searchIsbndb(searchQuery, pageNumber, searchOptions),
          OPTIONAL_SEARCH_TIMEOUT_MS,
          "isbndb search"
        )
      : Promise.resolve(emptyPage()),
  ]);

  const openLibraryResult = readSettledPage(
    "Open Library",
    openLibrarySettled
  );
  const googleResult = readSettledGoogle(googleSettled);
  const googleTitleResult = titlePriorityQuery
    ? readSettledGoogle(googleTitleSettled)
    : emptyGooglePage();
  const gutendexResult = readSettledPage("Gutendex", gutendexSettled);
  const isbndbResult = includeIsbndb
    ? readSettledPage("ISBNdb", isbndbSettled)
    : emptyPage();

  const openLibraryBooks = openLibraryResult.books;
  const googleBooks = [
    ...googleResult.books,
    ...googleTitleResult.books,
  ];
  const gutendexBooks = gutendexResult.books;
  const isbndbBooks = isbndbResult.books;
  const googleRawCount =
    (googleResult.rawCount ?? 0) + (googleTitleResult.rawCount ?? 0);
  const googleError = googleResult.error ?? googleTitleResult.error;

  if (googleError) {
    console.error("[searchBooks] Google Books provider error:", {
      query: searchQuery,
      page: pageNumber,
      mode: genreMode ? "genre" : "text",
      googleError,
      googleRawCount,
      titlePriorityQuery,
    });
  }

  if (SEARCH_DEBUG) {
    console.info("[searchBooks] raw provider counts", {
      query: searchQuery,
      page: pageNumber,
      mode: genreMode ? "genre" : "text",
      openlibrary: openLibraryBooks.length,
      google: googleBooks.length,
      googleRawCount,
      googleError,
      titlePriorityQuery,
      gutendex: gutendexBooks.length,
      isbndb: includeIsbndb ? isbndbBooks.length : "skipped",
      totalRaw:
        openLibraryBooks.length +
        googleBooks.length +
        gutendexBooks.length +
        isbndbBooks.length,
      googleBooksApiKeyConfigured: Boolean(
        process.env.GOOGLE_BOOKS_API_KEY?.trim()
      ),
    });
  }

  // Google first so a complete commercial record is in the merge pool before
  // an Open Library title-only stub of the same work.
  const rawCombined = [
    ...googleBooks,
    ...isbndbBooks,
    ...openLibraryBooks,
    ...gutendexBooks,
  ];
  const providerHitCount = rawCombined.length;

  let books = finalizeSearchBooks(rawCombined, {
    ratedIds: new Set(),
    protectedBooks: [],
    debug: SEARCH_DEBUG,
    query: genreMode ? undefined : searchQuery,
  });
  books = await enrichBooksWithCovers(books);
  const afterFinalize = books;
  books = dropBrowseJunk(books).filter((book) => !isTitleOnlyStub(book));

  if (genreMode) {
    books = preferMatchingGenreTags(books, searchQuery);
  } else {
    books = rankBrowseSearchResults(books, searchQuery);
  }

  if (books.length === 0 && providerHitCount > 0) {
    const matching = (afterFinalize.length > 0 ? afterFinalize : rawCombined)
      .filter((book) => !isTitleOnlyStub(book))
      .filter((book) =>
        genreMode ? true : bookMatchesSearchQuery(book, searchQuery)
      );
    books = genreMode
      ? matching
      : rankBrowseSearchResults(matching, searchQuery);
    // Do not fall back to substring hits ("Aescendune" for q=dune). Empty is
    // better than the wrong catalog when OL/Google timed out.
  }

  const attempted = [
    openLibrarySettled,
    googleSettled,
    ...(titlePriorityQuery ? [googleTitleSettled] : []),
    ...(includeGutendex ? [gutendexSettled] : []),
    ...(includeIsbndb ? [isbndbSettled] : []),
  ];
  const allSourcesTimedOut =
    attempted.length > 0 &&
    attempted.every((result) => settledFailed(result) || settledTimedOut(result));

  const sourceCounts: Partial<Record<BookSource, number>> = {
    openlibrary: openLibraryBooks.length,
    google: googleBooks.length,
    gutendex: gutendexBooks.length,
    isbndb: isbndbBooks.length,
  };

  const hasMore =
    openLibraryResult.hasMore ||
    googleResult.hasMore ||
    gutendexResult.hasMore ||
    isbndbResult.hasMore;

  return {
    query: searchQuery,
    books: cloneSummaries(books),
    sources: SEARCH_SOURCES,
    sourceCounts,
    source: "multi",
    page: pageNumber,
    hasMore,
    googleError,
    googleRawCount,
    allSourcesTimedOut,
  };
}

/**
 * Browse search: catalog APIs only. Cache keyed by exact q + page.
 * Never caches an empty page or a mismatched q.
 */
export async function searchBooks(
  query: string,
  page = 1,
  options?: SearchBooksOptions
): Promise<BookSearchResult> {
  noStore();
  const pageNumber = Math.max(1, page);
  const genreMode = isGenreSearchMode(options?.mode);
  const searchQuery = genreMode ? normalizeGenreQuery(query) : query.trim();
  const searchOptions: SearchBooksOptions | undefined = genreMode
    ? { mode: "genre" }
    : undefined;
  const mode = genreMode ? "genre" : "text";

  const cacheKey = searchCacheKey({
    query: searchQuery,
    page: pageNumber,
    mode,
  });
  const cachedPage = getCachedSearchPage(cacheKey, searchQuery);
  if (cachedPage) {
    return toSearchResult(cachedPage);
  }

  const existing = getInFlightSearch(cacheKey);
  if (existing) {
    const shared = await existing;
    return toSearchResult(shared);
  }

  const pending = fetchSearchPageUncached(
    searchQuery,
    pageNumber,
    genreMode,
    searchOptions
  ).finally(() => {
    clearInFlightSearch(cacheKey);
  });
  setInFlightSearch(cacheKey, pending);

  const pageResult = await pending;

  const echoed = pageResult.query.trim().toLowerCase();
  const requested = searchQuery.trim().toLowerCase();
  if (
    pageResult.books.length > 0 &&
    echoed === requested &&
    (pageResult.sourceCounts.openlibrary ?? 0) +
      (pageResult.sourceCounts.google ?? 0) >
      0
  ) {
    setCachedSearchPage(cacheKey, pageResult);
  }

  return toSearchResult(pageResult);
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
   * No record loaded and every *core catalog* failure looked temporary
   * (429 / 5xx / timeout). Hardcover / ratings / book-cache failures never
   * set this. The detail page uses this to choose "archives are resting"
   * over a dead id — only when there is no title.
   */
  transient: boolean;
  /** Google (or another catalog) returned 429 — show a banner, still render. */
  archivesBusy: boolean;
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
  const coreDeadline = createDeadline(4000);
  const attempt = <T,>(
    provider: string,
    run: (tries: number) => Promise<T>,
    timeoutMs = CORE_LOOKUP_TIMEOUT_MS
  ) => {
    const capped = coreDeadline.cap(timeoutMs, 100);
    if (capped <= 0) return Promise.resolve(null);
    return withProviderRetry(
      { provider, id: bookId, timeoutMs: capped, retries: 0, onFailure },
      run
    );
  };

  if (isBigBookId(bookId)) {
    const primary = await attempt("bigbook", () => getBigBookBookById(bookId));
    if (isUsableCoreBook(primary)) return primary;
  } else if (isOpenLibraryId(bookId)) {
    const primary = await attempt("openlibrary", () =>
      getOpenLibraryBookById(bookId, { timeoutMs: CORE_LOOKUP_TIMEOUT_MS })
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
  } else if (isHardcoverId(bookId)) {
    // Never fetch Hardcover for core identity. Fall through to Google / OL / NYT.
  } else {
    // Bare ids are Google volume ids (may include hyphens, e.g. E-OLEAAAQBAJ).
    const primary = await attempt("google", () =>
      resolveGoogleVolume(bookId, searchHint)
    );
    if (isUsableCoreBook(primary)) return primary;
  }

  // Cross-provider recovery: any source that can answer for this id/isbn/title.
  if (coreDeadline.expired()) return null;

  const isbn = isbnFromIsbndbId(bookId) ?? isbnFromNytId(bookId) ?? null;
  if (isbn && !coreDeadline.expired()) {
    const viaGoogleIsbn = await attempt("google-isbn", () =>
      getGoogleBookByIsbn(isbn)
    );
    if (isUsableCoreBook(viaGoogleIsbn)) return { ...viaGoogleIsbn, id: bookId };

    const viaOlIsbn = await attempt("openlibrary-isbn", () =>
      getOpenLibraryBookByIsbn(isbn)
    );
    if (isUsableCoreBook(viaOlIsbn)) return { ...viaOlIsbn, id: bookId };
  }

  if (searchHint && !coreDeadline.expired()) {
    const viaHint = await attempt(
      "search-hint",
      () => resolveViaSearchHint(bookId, searchHint),
      2000
    );
    if (isUsableCoreBook(viaHint)) return { ...viaHint, id: bookId };
  }

  if (!coreDeadline.expired()) {
    const viaOl = await attempt(
      "openlibrary-fallback",
      () => resolveOpenLibraryFallback({ bookId, searchHint }),
      2000
    );
    if (isUsableCoreBook(viaOl)) return { ...viaOl, id: bookId };
  }

  return null;
}

/**
 * Resolve a `/books/[id]` record with provider failures reported instead of
 * thrown. Core Google / OL / NYT data loads first; Hardcover and cache are
 * best-effort and can never blank a tome that already has a title.
 */
export const loadBookDetail = cache(async function loadBookDetail(
  id: string,
  options?: GetBookByIdOptions
): Promise<BookDetailResult> {
  const empty: BookDetailResult = {
    book: null,
    failures: [],
    transient: false,
    archivesBusy: false,
  };
  let recovered: BookDetail | null = null;

  try {
    const bookId = decodeBookRouteId(id);
    if (!bookId) return empty;

    const searchHint = options?.searchHint?.trim() || undefined;
    const coreFailures: ProviderFailure[] = [];
    const optionalFailures: ProviderFailure[] = [];
    const onCoreFailure = (failure: ProviderFailure) => coreFailures.push(failure);
    const onOptionalFailure = (failure: ProviderFailure) =>
      optionalFailures.push(failure);

    let book: BookDetail | null = null;
    let fromCache = false;
    let coreTitle: BookDetail | null = null;

    // 1) Prefer a previously resolved books row — 57014 / timeout must not
    // decide whether the page exists.
    const cached = await softStep(
      { provider: "book-cache", id: bookId, timeoutMs: 2000, onFailure: onOptionalFailure },
      null as BookDetail | null,
      () => getCachedBookBySlug(bookId)
    );
    if (isUsableCoreBook(cached)) {
      book = cached;
      fromCache = true;
    }

    // 2) Core catalog (Google / OL / NYT / …). Never Hardcover.
    if (!book) {
      book = await loadCoreBook(bookId, searchHint, onCoreFailure);
    }

    if (!isUsableCoreBook(book)) {
      const transient =
        coreFailures.length > 0 &&
        coreFailures.every((failure) => failure.transient);
      const archivesBusy =
        isGoogleBooksBusy() || coreFailures.some((failure) => failure.status === 429);
      console.error("[getBookById] no usable record:", {
        id: bookId,
        searchHint: searchHint ?? null,
        transient,
        reasons: summarizeFailures(coreFailures),
        failures: coreFailures,
      });
      return {
        book: null,
        failures: coreFailures,
        transient,
        archivesBusy,
      };
    }

    coreTitle = book;
    recovered = { ...book, id: bookId };
    book = { ...book, id: bookId };

    const { applyKnownEditionYears } = await import("@/lib/book-enrichment");
    book = applyKnownEditionYears(fillMissingCoverUrl(book));

    const enrichDeadline = createDeadline(DETAIL_ENRICH_BUDGET_MS);
    const core = book;

    const enrichIfBudget = async (
      provider: string,
      desiredMs: number,
      run: () => Promise<BookDetail>
    ): Promise<void> => {
      if (!book || enrichDeadline.expired()) return;
      const timeoutMs = enrichDeadline.cap(desiredMs, 100);
      if (timeoutMs <= 0) return;
      const before = book;
      book = await softStep(
        { provider, id: bookId, timeoutMs, onFailure: onOptionalFailure },
        before,
        async () => fillMissingCoverUrl(await run())
      );
      if (!isUsableCoreBook(book)) book = before;
    };

    if (fromCache) {
      await enrichIfBudget("known-edition-years", 400, async () => {
        const { applyKnownEditionYears } = await import("@/lib/book-enrichment");
        return applyKnownEditionYears(core);
      });
    } else {
      await enrichIfBudget("enrichment", 1200, () => enrichBookDetail(core));

      if (book && needsIsbndbEnrichment(book) && !enrichDeadline.expired()) {
        const beforeIsbndb = book;
        await enrichIfBudget("isbndb-enrichment", 1000, () =>
          enrichBookDetailWithIsbndb(beforeIsbndb)
        );
      }

      if (book && !enrichDeadline.expired()) {
        const beforeYears = book;
        await enrichIfBudget("known-edition-years", 400, async () => {
          const { applyKnownEditionYears } = await import("@/lib/book-enrichment");
          return applyKnownEditionYears(beforeYears);
        });
      }
    }

    if (!isUsableCoreBook(book)) {
      book = { ...coreTitle, id: bookId };
    }

    let tagged = { ...book, id: bookId };
    try {
      tagged = withFinalizedTags(tagged);
    } catch (error) {
      console.error("[getBookById] tag finalize failed:", {
        id: bookId,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    // 3) Hardcover is detail-only. Timeout / 401 / quota never take the page down.
    try {
      tagged = await enrichFromHardcover(tagged);
    } catch (error) {
      console.error("[getBookById] hardcover enrich skipped:", {
        id: bookId,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    if (!isUsableCoreBook(tagged)) {
      tagged = { ...coreTitle, id: bookId };
    }

    tagged = normalizeBookDetailForDisplay(tagged);
    recovered = tagged;

    void cacheBookDetail(bookId, tagged)
      .then(async () => {
        const record = peekHardcoverMemoryCache(tagged.isbn, bookId);
        if (record && !record.empty) {
          await persistHardcoverCache(bookId, bookIsbnKey(tagged.isbn), record);
        }
      })
      .catch((error) => {
        console.error("[getBookById] cache write failed:", {
          id: bookId,
          message: error instanceof Error ? error.message : String(error),
        });
      });

    const failures = [...coreFailures, ...optionalFailures];
    const archivesBusy =
      isGoogleBooksBusy() || failures.some((failure) => failure.status === 429);

    if (failures.length > 0) {
      console.warn("[getBookById] recovered after provider failures:", {
        id: bookId,
        reasons: summarizeFailures(failures),
      });
    }

    return { book: tagged, failures, transient: false, archivesBusy };
  } catch (error) {
    console.error("[getBookById] unexpected failure:", {
      id,
      message: error instanceof Error ? error.message : String(error),
    });
    if (recovered?.title?.trim()) {
      return {
        book: recovered,
        failures: [],
        transient: false,
        archivesBusy: isGoogleBooksBusy(),
      };
    }
    return empty;
  }
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

  // A 429 here is a missing title from Google — callers may still have OL.
  // Never throw: withProviderRetry would swallow it, but a leak takes down the page.
  if (lastError instanceof RateLimitError) {
    return null;
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

