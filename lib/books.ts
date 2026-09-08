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
  fetchHardcoverBook,
  isHardcoverCircuitOpen,
  isHardcoverConfigured,
  isHardcoverId,
  searchHardcover,
} from "@/lib/hardcover";
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
  createDeadline,
  softStep,
  summarizeFailures,
  withProviderRetry,
  withTimeout,
  type ProviderFailure,
} from "@/lib/provider-resilience";
import { finalizeSearchBooks } from "@/lib/search-finalize";
import {
  getCachedSearchPage,
  searchCacheKey,
  setCachedSearchPage,
} from "@/lib/search-cache";
import { getVerifiedUser } from "@/lib/supabase/server";
import {
  dropBrowseJunk,
  rankBrowseSearchResults,
} from "@/lib/book-utils";
import { unstable_noStore as noStore } from "next/cache";
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
/** Hard outer cap so one slow provider cannot stall the whole search. */
const PROVIDER_SEARCH_TIMEOUT_MS = 3000;
/** Detail-page enrichment total budget after core book is resolved. */
const DETAIL_ENRICH_BUDGET_MS = 1500;

/** Providers queried on every browse search. */
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
  });
  return {
    ...EMPTY_GOOGLE_PAGE,
    error: { message, status: status ?? null },
  };
}

async function resolveSearchUserId(
  accessToken?: string | null
): Promise<string | null> {
  const token = accessToken?.trim();
  if (!token) return null;
  try {
    const auth = await getVerifiedUser({ accessToken: token });
    if ("error" in auth) return null;
    return auth.user.id;
  } catch {
    return null;
  }
}

async function overlayUserRatedIdentities(
  books: BookSummary[],
  accessToken?: string | null
): Promise<{ books: BookSummary[]; userRatedSlugs: string[] }> {
  let next = books;
  let userRatedSlugs: string[] = [];
  try {
    const userId = await resolveSearchUserId(accessToken);
    if (userId) {
      const { getUserRatedIdentities } = await import("@/lib/ratings");
      const {
        alignBooksToRatedSlugs,
        inscribedCardIdsForBooks,
      } = await import("@/lib/user-rated-identity");
      const identities = await getUserRatedIdentities(userId);
      if (identities.length > 0) {
        next = alignBooksToRatedSlugs(next, identities);
        userRatedSlugs = inscribedCardIdsForBooks(next, identities);
      }
    }
  } catch (error) {
    console.error("[searchBooks] user rated-identity lookup failed:", error);
  }
  return { books: next, userRatedSlugs };
}

/**
 * Last good browse search (51fda74): Google + Open Library + Gutendex + Big Book
 * in one Promise.allSettled, one page each. Hardcover is at most one call and
 * is skipped when the token is missing or the circuit is open.
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

  const cacheKey = searchCacheKey({
    query: searchQuery,
    page: pageNumber,
    mode: genreMode ? "genre" : "text",
  });
  const cachedPage = getCachedSearchPage(cacheKey);
  if (cachedPage) {
    const overlay = await overlayUserRatedIdentities(
      cachedPage.books,
      options?.accessToken
    );
    return {
      ...cachedPage,
      books: overlay.books,
      userRatedSlugs: overlay.userRatedSlugs,
    };
  }

  const includeHardcover =
    isHardcoverConfigured() && !isHardcoverCircuitOpen();

  const [
    googleSettled,
    openLibrarySettled,
    gutendexSettled,
    bigBookSettled,
    hardcoverSettled,
  ] = await Promise.allSettled([
    withTimeout(
      searchGoogleBooks(searchQuery, pageNumber, searchOptions),
      PROVIDER_SEARCH_TIMEOUT_MS,
      "google search"
    ).catch(() => EMPTY_GOOGLE_PAGE),
    withTimeout(
      searchOpenLibrary(searchQuery, pageNumber, searchOptions),
      6500,
      "openlibrary search"
    ).catch(() => EMPTY_PAGE),
    genreMode || pageNumber === 1
      ? withTimeout(
          searchGutendex(searchQuery, pageNumber, searchOptions),
          PROVIDER_SEARCH_TIMEOUT_MS,
          "gutendex search"
        ).catch(() => EMPTY_PAGE)
      : Promise.resolve(EMPTY_PAGE),
    withTimeout(
      searchBigBook(searchQuery, pageNumber, searchOptions),
      PROVIDER_SEARCH_TIMEOUT_MS,
      "bigbook search"
    ).catch(() => EMPTY_PAGE),
    includeHardcover
      ? withTimeout(
          searchHardcover(searchQuery, pageNumber),
          PROVIDER_SEARCH_TIMEOUT_MS,
          "hardcover search"
        ).catch(() => EMPTY_PAGE)
      : Promise.resolve(EMPTY_PAGE),
  ]);

  const googleResult = readSettledGoogle(googleSettled);
  const openLibraryResult = readSettledPage(
    "Open Library",
    openLibrarySettled
  );
  const gutendexResult = readSettledPage("Gutendex", gutendexSettled);
  const bigBookResult = readSettledPage("Big Book", bigBookSettled);
  const hardcoverResult = includeHardcover
    ? readSettledPage("Hardcover", hardcoverSettled)
    : EMPTY_PAGE;

  const googleBooks = googleResult.books;
  const openLibraryBooks = openLibraryResult.books;
  const gutendexBooks = gutendexResult.books;
  const bigBookBooks = bigBookResult.books;
  const hardcoverBooks = hardcoverResult.books;

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
      hardcover: includeHardcover ? hardcoverBooks.length : "skipped",
      totalRaw:
        googleBooks.length +
        openLibraryBooks.length +
        gutendexBooks.length +
        bigBookBooks.length +
        hardcoverBooks.length,
      bigBookConfigured,
      googleBooksApiKeyConfigured: Boolean(
        process.env.GOOGLE_BOOKS_API_KEY?.trim()
      ),
    });
  }

  let ratedBooks: BookSummary[] = [];
  let ratedSlugs: string[] = [];
  if (pageNumber === 1) {
    try {
      const userId = await resolveSearchUserId(options?.accessToken);
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

  const rawCombined = [
    ...openLibraryBooks,
    ...googleBooks,
    ...gutendexBooks,
    ...bigBookBooks,
    ...hardcoverBooks,
    ...ratedBooks,
  ];

  let books = finalizeSearchBooks(rawCombined, {
    ratedIds: new Set(ratedSlugs),
    protectedBooks: ratedBooks,
    debug: SEARCH_DEBUG,
    query: genreMode ? undefined : searchQuery,
  });
  books = await enrichBooksWithCovers(books);
  books = dropBrowseJunk(books);

  if (genreMode) {
    books = preferMatchingGenreTags(books, searchQuery);
  } else {
    books = rankBrowseSearchResults(books, searchQuery);
  }

  const sourceCounts: Partial<Record<BookSource, number>> = {
    google: googleBooks.length,
    openlibrary: openLibraryBooks.length,
    gutendex: gutendexBooks.length,
    ...(bigBookConfigured || bigBookBooks.length > 0
      ? { bigbook: bigBookBooks.length }
      : {}),
    ...(includeHardcover ? { hardcover: hardcoverBooks.length } : {}),
  };

  const hasMore =
    googleResult.hasMore ||
    openLibraryResult.hasMore ||
    gutendexResult.hasMore ||
    bigBookResult.hasMore ||
    hardcoverResult.hasMore;

  // Do not cache a commercial miss — a Google 429 or OL timeout must not
  // pin Gutendex-only results for five minutes.
  if (googleBooks.length > 0 || openLibraryBooks.length > 0) {
    setCachedSearchPage(cacheKey, {
      books,
      sources: SEARCH_SOURCES,
      sourceCounts,
      source: "multi",
      page: pageNumber,
      hasMore,
      googleError: googleResult.error,
      googleRawCount: googleResult.rawCount,
    });
  }

  const overlay = await overlayUserRatedIdentities(
    books,
    options?.accessToken
  );

  return {
    books: overlay.books,
    sources: SEARCH_SOURCES,
    sourceCounts,
    source: "multi",
    page: pageNumber,
    hasMore,
    userRatedSlugs: overlay.userRatedSlugs,
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
  const coreDeadline = createDeadline(4000);
  const attempt = <T,>(
    provider: string,
    run: (tries: number) => Promise<T>,
    timeoutMs = 2500
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
      getOpenLibraryBookById(bookId, { timeoutMs: 2500 })
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
  } else if (isHardcoverId(bookId) && isHardcoverConfigured()) {
    const primary = await attempt("hardcover", async () => {
      const hintTitle =
        searchHint?.trim() ||
        bookId.replace(/^hardcover-/i, "").replace(/-/g, " ");
      const hit = await fetchHardcoverBook(hintTitle);
      if (!hit) return null;
      return {
        id: bookId,
        title: hit.title,
        authors: hit.authors.length > 0 ? hit.authors : ["Unknown author"],
        coverUrl: hit.coverUrl,
        description: hit.description,
        genres: hit.genres,
        publishedYear: hit.publishedYear,
        source: "hardcover" as const,
        publisher: null,
        pageCount: hit.pageCount,
        language: "en",
        isbn: hit.isbns[0] ?? null,
      };
    });
    if (isUsableCoreBook(primary)) return primary;
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
    { provider: "book-cache", id: bookId, timeoutMs: 1500, onFailure },
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

  // 3) Enrichment — skip network enrichment when cache already has a usable
  // core record. Under Netlify budgets, OL editions / ISBNdb must not block SSR.
  const enrichDeadline = createDeadline(DETAIL_ENRICH_BUDGET_MS);
  const core = book;

  async function enrichIfBudget(
    provider: string,
    desiredMs: number,
    run: () => Promise<BookDetail>
  ): Promise<void> {
    if (!book || enrichDeadline.expired()) return;
    const timeoutMs = enrichDeadline.cap(desiredMs, 100);
    if (timeoutMs <= 0) return;
    const before = book;
    book = await softStep(
      { provider, id: bookId, timeoutMs, onFailure },
      before,
      async () => fillMissingCoverUrl(await run())
    );
  }

  if (fromCache) {
    // Local/catalog year fill only — no external APIs on the hot path.
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

    // Skip openlibrary-editions on SSR — it was a frequent Netlify timeout source.
    if (book && !enrichDeadline.expired()) {
      const beforeYears = book;
      await enrichIfBudget("known-edition-years", 400, async () => {
        const { applyKnownEditionYears } = await import("@/lib/book-enrichment");
        return applyKnownEditionYears(beforeYears);
      });
    }
  }

  if (!book) {
    return { book: null, failures, transient: false };
  }

  const canonical = { ...book, id: bookId };

  // Fire-and-forget cache write — soft-fail.
  void cacheBookDetail(bookId, canonical).catch((error) => {
    console.error("[getBookById] cache write failed:", {
      id: bookId,
      message: error instanceof Error ? error.message : String(error),
    });
  });

  const sexualContentAverage =
    enrichDeadline.remaining() >= 400
      ? await softStep(
          {
            provider: "community-ratings",
            id: bookId,
            timeoutMs: enrichDeadline.cap(1200, 100),
          },
          null as number | null,
          async () => {
            const { getCommunityRatings } = await import("@/lib/ratings");
            const community = await getCommunityRatings(bookId, canonical.isbn);
            return community.averages?.sexual_content ?? null;
          }
        )
      : null;

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

