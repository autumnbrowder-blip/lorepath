import {
  getBigBookBookById,
  isBigBookId,
} from "@/lib/big-book";
import { enrichBookDetail } from "@/lib/book-enrichment";
import { normalizeBookDetailForDisplay } from "@/lib/book-normalize";
import { withFinalizedTags } from "@/lib/book-tags";
import {
  enrichBooksWithCovers,
  fillMissingCoverUrl,
  logCoverSource,
  resolveCoverSrc,
} from "@/lib/cover-resolve";
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
  hasGoogleBooksApiKey,
  isGoogleBooksBusy,
  RateLimitError,
  searchGoogleBooks,
  type GoogleBooksPageResult,
} from "@/lib/google-books";
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
  fetchNytBestsellers,
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
import {
  cacheBookDetail,
  getCachedBookBySlug,
  searchLocalBooks,
  sourceFromBookSlug,
} from "@/lib/book-cache";
import {
  classifyProviderError,
  createDeadline,
  softStep,
  summarizeFailures,
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
  SEARCH_PAGE_429_TTL_MS,
  type CachedSearchPage,
} from "@/lib/search-cache";
import {
  bookMatchesSearchQuery,
  dropBrowseJunk,
  getBookDedupeKey,
  isTitleOnlyStub,
  rankBrowseSearchResults,
  rankSearchResults,
  repairSearchQuery,
} from "@/lib/book-utils";
import {
  googleSearchQuery,
  isPublicDomainClassicQuery,
} from "@/lib/search-query";
import { recoverPopularTitleHits } from "@/lib/search-recovery";
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
/** Local books ILIKE + in-memory NYT cache — fail fast on 57014 / hang. */
const LOCAL_SEARCH_TIMEOUT_MS = 1000;
/** One browse page — local+NYT fill this before catalogs. */
const SEARCH_PAGE_SIZE = 20;
/** Upsert only the returned page, not hundreds of OL rows. */
const SEARCH_UPSERT_CAP = 20;
/** Detail-page enrichment total budget after core book is resolved. */
const DETAIL_ENRICH_BUDGET_MS = 1500;
/** Core catalog lookups — keep short so Hardcover cannot decide page existence. */
const CORE_LOOKUP_TIMEOUT_MS = 2000;

const GOOGLE_429_WARNING =
  "One archive is resting. Results below are still valid.";
/** Catalog sources for browse search. Hardcover is never called here. */
const SEARCH_SOURCES: BookSource[] = [
  "openlibrary",
  "google",
  "gutendex",
  "isbndb",
  "nyt",
];

/** Leftover hardcover-* route ids only — never fetches Hardcover. */
function isHardcoverId(id: string): boolean {
  return id.startsWith("hardcover-");
}

function logBookDetailError(id: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[book-detail]", id, message);
}

/** Last-resort tome so `/books/[id]` can render a layout instead of a 500. */
function stubBookFromHint(bookId: string, title: string): BookDetail {
  return {
    id: bookId,
    title,
    authors: ["Unknown author"],
    coverUrl: null,
    description: null,
    genres: [],
    publishedYear: null,
    source: sourceFromBookSlug(bookId),
    publisher: null,
    pageCount: null,
    language: null,
    isbn: null,
  };
}

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

/** Title or author contains the query (or every token). Used for local/NYT pin. */
function titleOrAuthorMatchesQuery(book: BookSummary, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  const title = book.title.toLowerCase();
  const authors = book.authors.join(" ").toLowerCase();
  if (title.includes(q) || authors.includes(q)) return true;
  const tokens = q.split(/\s+/).filter((token) => token.length >= 2);
  if (tokens.length === 0) return false;
  return tokens.every(
    (token) => title.includes(token) || authors.includes(token)
  );
}

function pinLocalAndNyt(
  ranked: BookSummary[],
  pinned: BookSummary[],
  query: string
): BookSummary[] {
  if (pinned.length === 0) return ranked;

  const pinnedIds = new Set(pinned.map((book) => book.id));
  const pinnedKeys = new Set(pinned.map((book) => getBookDedupeKey(book)));
  const top: BookSummary[] = [];
  const rest: BookSummary[] = [];

  for (const book of ranked) {
    if (pinnedIds.has(book.id) || pinnedKeys.has(getBookDedupeKey(book))) {
      top.push(book);
    } else {
      rest.push(book);
    }
  }

  for (const book of pinned) {
    const key = getBookDedupeKey(book);
    if (
      !top.some((row) => row.id === book.id || getBookDedupeKey(row) === key)
    ) {
      top.push(book);
    }
  }

  return [...rankBrowseSearchResults(top, query), ...rest];
}

function persistSearchHits(books: BookSummary[]): void {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return;
  for (const book of books.slice(0, SEARCH_UPSERT_CAP)) {
    if (!book.title?.trim() || isTitleOnlyStub(book)) continue;
    void cacheBookDetail(book.id, summaryToDetail(book, book.id)).catch(
      (error) => {
        console.error("[searchBooks] upsert skipped:", error);
      }
    );
  }
}

async function loadLocalAndNytMatches(searchQuery: string): Promise<{
  localBooks: BookSummary[];
  nytBooks: BookSummary[];
}> {
  const [localSettled, nytSettled] = await Promise.allSettled([
    withTimeout(
      searchLocalBooks(searchQuery, SEARCH_PAGE_SIZE),
      LOCAL_SEARCH_TIMEOUT_MS,
      "local search"
    ),
    withTimeout(
      fetchNytBestsellers().then((result) =>
        result.books.filter((book) =>
          titleOrAuthorMatchesQuery(book, searchQuery)
        )
      ),
      LOCAL_SEARCH_TIMEOUT_MS,
      "nyt cache"
    ),
  ]);

  const localBooks =
    localSettled.status === "fulfilled"
      ? cloneSummaries(localSettled.value)
      : [];
  if (localSettled.status === "rejected") {
    console.error("[searchBooks] local rejected:", localSettled.reason);
  }

  const nytBooks =
    nytSettled.status === "fulfilled" ? cloneSummaries(nytSettled.value) : [];
  if (nytSettled.status === "rejected") {
    console.error("[searchBooks] nyt rejected:", nytSettled.reason);
  }

  return { localBooks, nytBooks };
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
    warning: cloned.warning ?? null,
  };
}

/**
 * Local public.books + cached NYT first (no catalog HTTP). Then fill remaining
 * slots with Open Library / ISBNdb / Google. Gutendex only for clear classics.
 * Hardcover is never called. One Google HTTP call per page max (cache + circuit).
 */
async function fetchSearchPageUncached(
  searchQuery: string,
  pageNumber: number,
  genreMode: boolean,
  searchOptions: SearchBooksOptions | undefined
): Promise<CachedSearchPage> {
  let localBooks: BookSummary[] = [];
  let nytBooks: BookSummary[] = [];
  if (!genreMode && pageNumber === 1) {
    const localAndNyt = await loadLocalAndNytMatches(searchQuery);
    localBooks = localAndNyt.localBooks;
    nytBooks = localAndNyt.nytBooks;
  }

  const pinned = genreMode
    ? []
    : rankBrowseSearchResults(
        dropBrowseJunk([...localBooks, ...nytBooks]).filter(
          (book) => !isTitleOnlyStub(book)
        ),
        searchQuery
      );
  const remainingSlots =
    genreMode || pageNumber > 1
      ? SEARCH_PAGE_SIZE
      : Math.max(0, SEARCH_PAGE_SIZE - pinned.length);
  const needExternal = remainingSlots > 0;

  const includeIsbndb = needExternal && hasIsbndbApiKey();
  const includeGutendex =
    needExternal &&
    (genreMode ||
      (pageNumber === 1 && isPublicDomainClassicQuery(searchQuery)));
  const includeGoogle = needExternal && hasGoogleBooksApiKey();
  const includeOpenLibrary = needExternal;
  // One Google HTTP call per search page. Person names use inauthor;
  // multi-word titles use intitle; otherwise raw q. searchGoogleBooks
  // itself skips HTTP on cache hit or open circuit.
  const googleQuery = genreMode
    ? searchQuery
    : googleSearchQuery(searchQuery);

  const [
    openLibrarySettled,
    googleSettled,
    gutendexSettled,
    isbndbSettled,
  ] = await Promise.allSettled([
    includeOpenLibrary
      ? withTimeout(
          searchOpenLibrary(searchQuery, pageNumber, searchOptions),
          OPEN_LIBRARY_SEARCH_TIMEOUT_MS,
          "openlibrary search"
        )
      : Promise.resolve(emptyPage()),
    includeGoogle
      ? withTimeout(
          searchGoogleBooks(googleQuery, pageNumber, searchOptions),
          OPTIONAL_SEARCH_TIMEOUT_MS,
          "google search"
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
  const gutendexResult = readSettledPage("Gutendex", gutendexSettled);
  const isbndbResult = includeIsbndb
    ? readSettledPage("ISBNdb", isbndbSettled)
    : emptyPage();

  const openLibraryBooks = openLibraryResult.books;
  const googleBooks = googleResult.books;
  const gutendexBooks = gutendexResult.books;
  const isbndbBooks = isbndbResult.books;
  const googleRawCount = googleResult.rawCount ?? 0;
  const googleError = googleResult.error;

  if (
    googleError &&
    googleError.status !== 429 &&
    googleError.status !== 403
  ) {
    console.error("[searchBooks] Google Books provider error:", {
      query: searchQuery,
      page: pageNumber,
      mode: genreMode ? "genre" : "text",
      googleError,
      googleRawCount,
      googleQuery,
    });
  }

  const googleHttp = googleResult.httpStatus;
  const googleQuotaBlocked =
    googleHttp === 429 ||
    googleHttp === 403 ||
    googleError?.status === 429 ||
    googleError?.status === 403 ||
    /rate limit|quota|api key/i.test(googleError?.message ?? "");

  if (SEARCH_DEBUG) {
    console.info("[searchBooks] raw provider counts", {
      query: searchQuery,
      page: pageNumber,
      mode: genreMode ? "genre" : "text",
      openlibrary: openLibraryBooks.length,
      google: googleBooks.length,
      googleRawCount,
      googleError,
      googleQuery,
      gutendex: gutendexBooks.length,
      isbndb: includeIsbndb ? isbndbBooks.length : "skipped",
      local: localBooks.length,
      nyt: nytBooks.length,
      totalRaw:
        localBooks.length +
        nytBooks.length +
        openLibraryBooks.length +
        googleBooks.length +
        gutendexBooks.length +
        isbndbBooks.length,
      googleBooksApiKeyConfigured: Boolean(
        process.env.GOOGLE_BOOKS_API_KEY?.trim()
      ),
    });
  }

  // Local+NYT first, then commercial catalogs, then archives.
  // Dedupe prefers author+cover over a title-only stub.
  const rawCombined = [
    ...localBooks,
    ...nytBooks,
    ...googleBooks,
    ...isbndbBooks,
    ...openLibraryBooks,
    ...gutendexBooks,
  ];
  if (!genreMode && pageNumber === 1) {
    try {
      const recovered = await recoverPopularTitleHits(
        searchQuery,
        rawCombined,
        { debug: SEARCH_DEBUG }
      );
      rawCombined.push(...recovered);
    } catch {
      // Recovery is best-effort — never fail the page.
    }
  }
  const providerHitCount = rawCombined.length;
  const archiveRows = [...openLibraryBooks, ...gutendexBooks];

  let books: BookSummary[] = [];
  let afterFinalize: BookSummary[] = [];
  try {
    books = finalizeSearchBooks(rawCombined, {
      ratedIds: new Set(),
      protectedBooks: [],
      debug: SEARCH_DEBUG,
      query: genreMode ? undefined : searchQuery,
    });
    books = enrichBooksWithCovers(books);
    afterFinalize = books;
    books = dropBrowseJunk(books).filter((book) => !isTitleOnlyStub(book));

    if (genreMode) {
      books = preferMatchingGenreTags(books, searchQuery);
    } else {
      books = pinLocalAndNyt(
        rankBrowseSearchResults(books, searchQuery),
        pinned,
        searchQuery
      );
    }

    if (books.length === 0 && providerHitCount > 0) {
      const matching = (afterFinalize.length > 0 ? afterFinalize : rawCombined)
        .filter((book) => !isTitleOnlyStub(book))
        .filter((book) =>
          genreMode ? true : bookMatchesSearchQuery(book, searchQuery)
        );
      books = genreMode
        ? matching
        : pinLocalAndNyt(
            rankBrowseSearchResults(matching, searchQuery),
            pinned,
            searchQuery
          );
    }
  } catch (error) {
    console.error("[searchBooks] finalize/rank failed; keeping archive rows:", error);
    books = [];
  }

  // Google 429 / ranking / google=0 must never wipe Open Library or Gutendex.
  if (books.length === 0 && pinned.length > 0) {
    books = pinned;
  }
  if (books.length === 0 && archiveRows.length > 0) {
    const kept = dropBrowseJunk(archiveRows).filter(
      (book) => !isTitleOnlyStub(book)
    );
    const ranked = genreMode
      ? kept
      : rankBrowseSearchResults(
          kept.filter((book) => bookMatchesSearchQuery(book, searchQuery)),
          searchQuery
        );
    if (ranked.length > 0) {
      books = ranked;
    } else if (kept.length > 0) {
      books = kept;
    } else {
      books = archiveRows.filter((book) => !isTitleOnlyStub(book));
    }
    if (books.length === 0) {
      books = archiveRows;
    }
  }

  const googleFailed =
    includeGoogle && (settledFailed(googleSettled) || Boolean(googleError));
  const olFailed = includeOpenLibrary && settledFailed(openLibrarySettled);
  const gutendexFailed =
    includeGutendex &&
    (settledFailed(gutendexSettled) || settledTimedOut(gutendexSettled));
  const isbndbFailed =
    includeIsbndb &&
    (settledFailed(isbndbSettled) || settledTimedOut(isbndbSettled));
  const allSourcesTimedOut =
    localBooks.length === 0 &&
    nytBooks.length === 0 &&
    (!includeOpenLibrary || olFailed) &&
    (!includeGoogle || googleFailed) &&
    (!includeGutendex || gutendexFailed) &&
    (!includeIsbndb || isbndbFailed);

  const sourceCounts: Partial<Record<BookSource | "local", number>> = {
    local: localBooks.length,
    nyt: nytBooks.length,
    openlibrary: openLibraryBooks.length,
    google: googleBooks.length,
    gutendex: gutendexBooks.length,
    isbndb: isbndbBooks.length,
  };
  const sources = SEARCH_SOURCES.filter(
    (source) => (sourceCounts[source] ?? 0) > 0
  );

  const hasMore = !needExternal
    ? pinned.length >= SEARCH_PAGE_SIZE
    : openLibraryResult.hasMore ||
      googleResult.hasMore ||
      gutendexResult.hasMore ||
      isbndbResult.hasMore;

  const warning =
    googleQuotaBlocked && books.length > 0 ? GOOGLE_429_WARNING : null;
  const googleStatus =
    googleHttp === 200 || googleHttp === 403 || googleHttp === 429
      ? String(googleHttp)
      : googleQuotaBlocked
        ? String(googleError?.status ?? "429")
        : googleHttp == null
          ? "skip"
          : String(googleHttp);
  console.info(
    `[search] q=${searchQuery} google=${googleStatus} ol=${openLibraryBooks.length} gutendex=${gutendexBooks.length} out=${books.length} local=${localBooks.length} nyt=${nytBooks.length}`
  );

  persistSearchHits(books);

  return {
    query: searchQuery,
    books: cloneSummaries(books),
    sources,
    sourceCounts,
    source: "multi",
    page: pageNumber,
    hasMore,
    googleError: googleQuotaBlocked
      ? {
          message:
            googleError?.message ?? "Google Books rate limit reached.",
          status: googleError?.status ?? googleHttp ?? 429,
        }
      : googleError,
    googleRawCount,
    allSourcesTimedOut,
    warning,
  };
}

/**
 * Browse search: local+NYT first, then catalogs. Cache keyed by exact q + page.
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
  const searchQuery = genreMode
    ? normalizeGenreQuery(repairSearchQuery(query))
    : repairSearchQuery(query);
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
    (pageResult.sourceCounts.local ?? 0) +
      (pageResult.sourceCounts.nyt ?? 0) +
      (pageResult.sourceCounts.openlibrary ?? 0) +
      (pageResult.sourceCounts.google ?? 0) +
      (pageResult.sourceCounts.gutendex ?? 0) +
      (pageResult.sourceCounts.isbndb ?? 0) >
      0
  ) {
    // A Google 429/403 must not occupy the 15-min success slot. Cache OL briefly
    // so we still serve results without hammering Google.
    if (
      pageResult.googleError?.status === 429 ||
      pageResult.googleError?.status === 403
    ) {
      setCachedSearchPage(cacheKey, pageResult, SEARCH_PAGE_429_TTL_MS);
    } else {
      setCachedSearchPage(cacheKey, pageResult);
    }
  }

  return toSearchResult(pageResult);
}


export type GetBookByIdOptions = {
  /**
   * Browse `?q=` hint. When a direct Google volume fetch fails (rate limit /
   * transient error), we search providers with this query and pick the best match.
   */
  searchHint?: string;
  /**
   * Hardcover.app enricher. No-op unless HARDCOVER_ENABLED=true.
   * Search, browse, NYT, Load More, and cards never set this.
   */
  enrichHardcover?: boolean;
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
 * ol-* → Open Library first; everything else → Google first. Each catalog
 * gets its own 2s timeout + try/catch. Never throws.
 */
async function loadCoreBook(
  bookId: string,
  searchHint: string | undefined,
  onFailure: (failure: ProviderFailure) => void
): Promise<BookDetail | null> {
  try {
    const trySource = async (
      provider: string,
      run: () => Promise<BookDetail | null>
    ): Promise<BookDetail | null> => {
      try {
        const result = await withTimeout(
          run(),
          CORE_LOOKUP_TIMEOUT_MS,
          `${provider} lookup`
        );
        if (isUsableCoreBook(result)) return { ...result, id: bookId };
        return null;
      } catch (error) {
        logBookDetailError(bookId, error);
        const classified = classifyProviderError(error);
        onFailure({
          provider,
          id: bookId,
          status: classified.status,
          message: classified.message,
          transient: classified.transient,
          attempt: 1,
        });
        return null;
      }
    };

    if (isOpenLibraryId(bookId)) {
      const primary = await trySource("openlibrary", () =>
        getOpenLibraryBookById(bookId, { timeoutMs: CORE_LOOKUP_TIMEOUT_MS })
      );
      if (primary) return primary;
    } else if (isBigBookId(bookId)) {
      const primary = await trySource("bigbook", () => getBigBookBookById(bookId));
      if (primary) return primary;
    } else if (isGutendexId(bookId)) {
      const primary = await trySource("gutendex", () => getGutendexBookById(bookId));
      if (primary) return primary;
    } else if (isIsbndbId(bookId)) {
      const primary = await trySource("isbndb", () => resolveIsbndbBook(bookId));
      if (primary) return primary;
    } else if (isNytId(bookId)) {
      const primary = await trySource("nyt", () => resolveNytBook(bookId));
      if (primary) return primary;
    } else if (
      !isHardcoverId(bookId) &&
      hasGoogleBooksApiKey() &&
      !isGoogleBooksBusy()
    ) {
      const primary = await trySource("google", () => getGoogleBookById(bookId));
      if (primary) return primary;
    }

    const isbn = isNytId(bookId) ? null : isbnFromIsbndbId(bookId);
    if (isbn) {
      if (hasGoogleBooksApiKey() && !isGoogleBooksBusy()) {
        const viaGoogleIsbn = await trySource("google", () =>
          getGoogleBookByIsbn(isbn)
        );
        if (viaGoogleIsbn) return viaGoogleIsbn;
      }

      const viaOlIsbn = await trySource("openlibrary", () =>
        getOpenLibraryBookByIsbn(isbn)
      );
      if (viaOlIsbn) return viaOlIsbn;
    }

    if (searchHint) {
      const viaHint = await trySource("openlibrary", () =>
        resolveViaSearchHint(bookId, searchHint)
      );
      if (viaHint) return viaHint;
    }

    if (!isOpenLibraryId(bookId)) {
      const viaOl = await trySource("openlibrary", () =>
        resolveOpenLibraryFallback({ bookId, searchHint })
      );
      if (viaOl) return viaOl;
    }

    return null;
  } catch (error) {
    logBookDetailError(bookId, error);
    return null;
  }
}

/**
 * Resolve a `/books/[id]` record with provider failures reported instead of
 * thrown. Core Google / OL / NYT data loads first; Hardcover and cache are
 * best-effort and can never blank a tome that already has a title.
 */
export async function loadBookDetail(
  id: string,
  options?: GetBookByIdOptions
): Promise<BookDetailResult> {
  return loadBookDetailCached(
    id,
    options?.searchHint?.trim() || "",
    options?.enrichHardcover === true &&
      process.env.HARDCOVER_ENABLED === "true"
  );
}

const loadBookDetailCached = cache(async function loadBookDetailCached(
  id: string,
  searchHintRaw: string,
  enrichHardcover: boolean
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

    const searchHint = searchHintRaw || undefined;
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
        isGoogleBooksBusy() ||
        transient ||
        coreFailures.some(
          (failure) => failure.status === 429 || failure.status === 403
        );
      console.error("[getBookById] no usable record:", {
        id: bookId,
        searchHint: searchHint ?? null,
        transient,
        reasons: summarizeFailures(coreFailures),
        failures: coreFailures,
      });
      if (searchHint) {
        return {
          book: normalizeBookDetailForDisplay(
            stubBookFromHint(bookId, searchHint)
          ),
          failures: coreFailures,
          transient,
          archivesBusy: true,
        };
      }
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

    try {
      const { applyKnownEditionYears } = await import("@/lib/book-enrichment");
      book = applyKnownEditionYears(fillMissingCoverUrl(book));
    } catch (error) {
      logBookDetailError(bookId, error);
      book = recovered;
    }

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
      try {
        book = await softStep(
          { provider, id: bookId, timeoutMs, onFailure: onOptionalFailure },
          before,
          async () => fillMissingCoverUrl(await run())
        );
      } catch (error) {
        logBookDetailError(bookId, error);
        book = before;
      }
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
      logBookDetailError(bookId, error);
    }

    if (!isUsableCoreBook(tagged)) {
      tagged = { ...coreTitle, id: bookId };
    }

    try {
      tagged = normalizeBookDetailForDisplay(tagged);
    } catch (error) {
      logBookDetailError(bookId, error);
    }
    recovered = tagged;

    logCoverSource(resolveCoverSrc(tagged));

    // Hardcover HTTP is off unless HARDCOVER_ENABLED=true (gated at the
    // loadBookDetailCached call site). Prefer not importing the module at all.
    if (enrichHardcover && process.env.HARDCOVER_ENABLED === "true") {
      try {
        const { overlayHardcoverMemoryCache } = await import("@/lib/hardcover");
        tagged = overlayHardcoverMemoryCache(tagged);
      } catch (error) {
        logBookDetailError(bookId, error);
      }
      if (!isUsableCoreBook(tagged)) {
        tagged = { ...coreTitle, id: bookId };
      }
      recovered = tagged;

      void import("@/lib/hardcover")
        .then(({ enrichFromHardcover }) => enrichFromHardcover(tagged))
        .then((enriched) => {
          if (!isUsableCoreBook(enriched)) return;
          return cacheBookDetail(bookId, enriched);
        })
        .catch((error) => {
          logBookDetailError(bookId, error);
        });
    }

    void cacheBookDetail(bookId, tagged).catch((error) => {
      // Upsert is best-effort. Google/OL already rendered — never throw,
      // and never treat a cache/RLS miss as "archives are resting".
      logBookDetailError(bookId, error);
    });

    const failures = [...coreFailures, ...optionalFailures];
    const archivesBusy =
      isGoogleBooksBusy() ||
      failures.some(
        (failure) =>
          (failure.status === 429 || failure.status === 403) &&
          failure.provider !== "book-cache"
      );

    if (failures.length > 0) {
      console.warn("[getBookById] recovered after provider failures:", {
        id: bookId,
        reasons: summarizeFailures(failures),
      });
    }

    return { book: tagged, failures, transient: false, archivesBusy };
  } catch (error) {
    logBookDetailError(id, error);
    if (recovered?.title?.trim()) {
      try {
        return {
          book: normalizeBookDetailForDisplay(recovered),
          failures: [],
          transient: false,
          archivesBusy: isGoogleBooksBusy(),
        };
      } catch (normalizeError) {
        logBookDetailError(id, normalizeError);
        return {
          book: recovered,
          failures: [],
          transient: false,
          archivesBusy: isGoogleBooksBusy(),
        };
      }
    }
    const hintTitle = searchHintRaw.trim();
    const bookId = decodeBookRouteId(id);
    if (bookId && hintTitle) {
      return {
        book: stubBookFromHint(bookId, hintTitle),
        failures: [],
        transient: true,
        archivesBusy: true,
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
  try {
    const { book } = await loadBookDetail(id, options);
    return book;
  } catch (error) {
    logBookDetailError(id, error);
    return null;
  }
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
    if (hasGoogleBooksApiKey() && !isGoogleBooksBusy()) {
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
    const viaOl = await resolveOpenLibraryFallback({ bookId, isbn });
    if (viaOl) return viaOl;
  }
  return getNytBookById(bookId);
}

/**
 * When direct Google volume fetch fails, recover from Open Library using
 * the browse query. Never starts a Google search (quota).
 * ISBNdb is a last-resort detail fallback only.
 */
async function resolveViaSearchHint(
  bookId: string,
  searchHint: string
): Promise<BookDetail | null> {
  const hint = searchHint.trim();
  if (!hint) return null;

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

