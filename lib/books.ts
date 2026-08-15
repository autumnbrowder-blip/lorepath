import {
  getBigBookBookById,
  isBigBookConfigured,
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
import { getGutendexBookById, isGutendexId } from "@/lib/gutendex";
import {
  getGoogleBookById,
  getGoogleBookByIsbn,
  RateLimitError,
  searchGoogleBooks,
} from "@/lib/google-books";
import {
  fetchHardcoverBook,
  isHardcoverConfigured,
  isHardcoverId,
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
import {
  fetchSearchProviderFlood,
  SEARCH_FLOOD_SOURCES,
} from "@/lib/search-flood";
import { getVerifiedUser } from "@/lib/supabase/server";
import { rankSearchResults } from "@/lib/book-utils";
import type {
  BookDetail,
  BookSearchResult,
  BookSource,
  BookSummary,
} from "@/types/book";
import { cache } from "react";

export { finalizeSearchBooks } from "@/lib/search-finalize";

const SEARCH_DEBUG = process.env.SEARCH_DEBUG === "1";

/**
 * Hard wall-clock budget for the entire searchBooks handler.
 * Must stay under Netlify/serverless function timeouts (~10s).
 */
const SEARCH_OVERALL_BUDGET_MS = 7000;
/** Skip slow enrichment/english attach when less than this remains. */
const SEARCH_ENRICH_MIN_REMAINING_MS = 1200;
/** Detail-page enrichment total budget after core book is resolved. */
const DETAIL_ENRICH_BUDGET_MS = 1500;

/** Providers queried on every browse search. */
const SEARCH_SOURCES: BookSource[] = SEARCH_FLOOD_SOURCES;

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

/**
 * Multi-stage browse search:
 * 1) Query normalization + safe variants (title never lost when author added)
 * 2) Parallel provider flood (Google, ISBNdb, Hardcover, Open Library, …)
 * 3–4) Normalize / merge via finalize (language-aware; commercial preferred)
 * Then enrich + English editions with budgets; cache the anonymous page.
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

  const cacheKey = searchCacheKey({
    query: searchQuery,
    page: pageNumber,
    mode: genreMode ? "genre" : "text",
  });
  const cachedPage = getCachedSearchPage(cacheKey);

  const userIdPromise = resolveSearchUserId(options?.accessToken);

  // Fast path: reuse a recent page, then re-apply Inscribed for this user.
  if (cachedPage) {
    let books = cachedPage.books;
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
      console.error("[searchBooks] cached rated-identity lookup failed:", error);
    }

    return {
      ...cachedPage,
      books,
      userRatedSlugs,
    };
  }

  const bigBookConfigured = isBigBookConfigured();
  const deadline = createDeadline(SEARCH_OVERALL_BUDGET_MS);

  let flood;
  try {
    flood = await withTimeout(
      fetchSearchProviderFlood({
        query: searchQuery,
        page: pageNumber,
        genreMode,
        searchOptions,
        includeGutendex: genreMode || pageNumber === 1,
        includeBigBook: bigBookConfigured,
        debug: SEARCH_DEBUG,
        deadline,
      }),
      deadline.cap(4500, 500),
      "search flood"
    );
  } catch (error) {
    console.error("[searchBooks] flood timed out — returning partial/empty:", {
      query: searchQuery,
      message: error instanceof Error ? error.message : String(error),
      elapsedMs: Date.now() - deadline.startedAt,
    });
    flood = {
      books: [] as BookSummary[],
      sourceCounts: {} as Partial<Record<BookSource, number>>,
      hasMore: false,
      googleError: null,
      googleRawCount: 0,
      normalized: {
        kind: "raw" as const,
        raw: searchQuery,
        title: searchQuery,
        author: null,
        isbn: null,
        variants: [searchQuery],
      },
      primaryQuery: searchQuery,
      timedOutProviders: ["search-flood"],
    };
  }

  const rankingQuery =
    flood.normalized.kind === "title_author" && flood.normalized.title
      ? flood.normalized.title
      : searchQuery;

  if (flood.googleError) {
    console.error("[searchBooks] Google Books provider error:", {
      query: searchQuery,
      page: pageNumber,
      mode: options?.mode ?? "text",
      googleError: flood.googleError,
      googleRawCount: flood.googleRawCount,
    });
  }

  if (SEARCH_DEBUG) {
    console.info("[searchBooks] raw provider counts", {
      query: searchQuery,
      primary: flood.primaryQuery,
      kind: flood.normalized.kind,
      page: pageNumber,
      mode: genreMode ? "genre" : "text",
      sourceCounts: flood.sourceCounts,
      totalRaw: flood.books.length,
      googleRawCount: flood.googleRawCount,
      googleError: flood.googleError,
      bigBookConfigured,
      googleBooksApiKeyConfigured: Boolean(
        process.env.GOOGLE_BOOKS_API_KEY?.trim()
      ),
      isbndbInSearchFlood: true,
      hardcoverInSearchFlood: true,
    });
  }

  // Rated books that match this query — always surface them on page 1,
  // prefer DB identity so ratings stay attached after dedupe.
  let ratedBooks: BookSummary[] = [];
  let ratedSlugs: string[] = [];
  if (pageNumber === 1 && deadline.remaining() >= 400) {
    try {
      const userId = await userIdPromise;
      const { findRatedBooksMatchingQuery } = await import("@/lib/ratings");
      const rated = await withTimeout(
        findRatedBooksMatchingQuery(searchQuery, {
          mode: genreMode ? "genre" : "text",
          userId,
        }),
        deadline.cap(1200, 300),
        "rated-books-lookup"
      );
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

  const rawCombined = [...flood.books, ...ratedBooks];

  // First pass merges and dedupes but keeps everything: a book must not be
  // dropped for a missing description before enrichment has had a chance.
  let books = finalizeSearchBooks(rawCombined, {
    ratedIds: new Set(ratedSlugs),
    protectedBooks: ratedBooks,
    debug: SEARCH_DEBUG,
    query: genreMode ? undefined : rankingQuery,
    deferQualityFilter: true,
  });

  // Known-title / exact-phrase fallback when the flood missed an exact title
  // (e.g. provider outage, or a prior author-misclassification miss).
  if (
    !genreMode &&
    pageNumber === 1 &&
    deadline.remaining() >= 800 &&
    !deadline.expired()
  ) {
    try {
      const { fetchTitleSearchFallbacks } = await import(
        "@/lib/search-title-fallback"
      );
      const fallbackQuery = flood.normalized.title ?? searchQuery;
      const fallbackHits = await withTimeout(
        fetchTitleSearchFallbacks(fallbackQuery, books),
        deadline.cap(1500, 400),
        "title-fallback"
      );
      if (fallbackHits.length > 0) {
        books = finalizeSearchBooks([...books, ...fallbackHits], {
          ratedIds: new Set(ratedSlugs),
          protectedBooks: ratedBooks,
          debug: SEARCH_DEBUG,
          query: rankingQuery,
          deferQualityFilter: true,
        });
        if (SEARCH_DEBUG) {
          console.info("[searchBooks] title fallback merged", {
            query: fallbackQuery,
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
    books = rankSearchResults(books, rankingQuery);
  }

  // Thin flood backup — only when commercial providers returned almost nothing
  // (ISBNdb is already in the primary flood; this is a last resort).
  if (
    !genreMode &&
    pageNumber === 1 &&
    books.length < 2 &&
    deadline.remaining() >= 800 &&
    !deadline.expired()
  ) {
    try {
      const { fetchBackupSearchResults } = await import(
        "@/lib/search-enrichment"
      );
      const backup = await withTimeout(
        fetchBackupSearchResults(rankingQuery, books),
        deadline.cap(1500, 400),
        "backup-search"
      );
      if (backup.length > 0) {
        books = rankSearchResults(
          finalizeSearchBooks([...books, ...backup], {
            ratedIds: new Set(ratedSlugs),
            protectedBooks: ratedBooks,
            debug: SEARCH_DEBUG,
            query: rankingQuery,
            deferQualityFilter: true,
          }),
          rankingQuery
        );
      }
    } catch (error) {
      console.error("[searchBooks] backup provider search failed:", error);
    }
  }

  // Fill missing synopses and attach English editions in parallel — ONLY when
  // budget remains. Never block the response on slow enrichment.
  const descriptionSources: Record<string, string> = {};
  const preEnrichBooks = books;
  const canEnrich =
    !deadline.expired() &&
    deadline.remaining() >= SEARCH_ENRICH_MIN_REMAINING_MS;

  if (canEnrich) {
    const enrichBudget = deadline.cap(1800, 300);
    const [enrichSettled, englishSettled] = await Promise.allSettled([
      (async () => {
        const { enrichSearchDescriptions } = await import(
          "@/lib/search-enrichment"
        );
        return enrichSearchDescriptions(preEnrichBooks, {
          debug: SEARCH_DEBUG,
          budgetMs: enrichBudget,
          limit: 5,
        });
      })(),
      genreMode
        ? Promise.resolve(preEnrichBooks)
        : (async () => {
            const { attachEnglishEditions } = await import(
              "@/lib/search-english-editions"
            );
            return attachEnglishEditions(preEnrichBooks, {
              debug: SEARCH_DEBUG,
              budgetMs: enrichBudget,
            });
          })(),
    ]);

    if (enrichSettled.status === "fulfilled") {
      books = enrichSettled.value.books;
      enrichSettled.value.filled.forEach((source, id) => {
        descriptionSources[id] = source;
      });
    } else {
      console.error(
        "[searchBooks] description enrichment failed:",
        enrichSettled.reason
      );
    }

    if (!genreMode && englishSettled.status === "fulfilled") {
      const englishResult = englishSettled.value;
      const baseIds = new Set(books.map((book) => book.id));
      const originalLabels = new Set(
        englishResult
          .filter((book) => book.editionLabel === "original")
          .map((book) => book.id)
      );
      const englishExtras = englishResult.filter(
        (book) =>
          book.editionLabel === "english" && !baseIds.has(book.id)
      );
      books = [
        ...books.map((book) =>
          originalLabels.has(book.id)
            ? { ...book, editionLabel: "original" as const }
            : book
        ),
        ...englishExtras,
      ];
    } else if (!genreMode && englishSettled.status === "rejected") {
      console.error(
        "[searchBooks] English edition attach failed:",
        englishSettled.reason
      );
    }
  } else if (SEARCH_DEBUG || deadline.expired()) {
    console.warn("[searchBooks] skipped enrichment — budget exhausted", {
      query: searchQuery,
      remainingMs: deadline.remaining(),
      elapsedMs: Date.now() - deadline.startedAt,
    });
  }

  // Now that every candidate has had its chance, apply the quality filter.
  books = finalizeSearchBooks(books, {
    ratedIds: new Set(ratedSlugs),
    protectedBooks: ratedBooks,
    debug: SEARCH_DEBUG,
    query: genreMode ? undefined : rankingQuery,
  });

  // Re-apply Original / English edition labels after merges.
  if (!genreMode) {
    try {
      const { labelOriginalAndEnglishEditions } = await import(
        "@/lib/search-english-editions"
      );
      const {
        applyKnownWorkEditionLabels,
        ensureKnownTranslatedEditionPair,
      } = await import("@/lib/known-editions");
      books = labelOriginalAndEnglishEditions(books);
      books = applyKnownWorkEditionLabels(books, searchQuery);
      // Inject English translation BEFORE ranking so it can score.
      books = ensureKnownTranslatedEditionPair(books, searchQuery);
    } catch {
      // Labels are cosmetic — never fail the search.
    }
  }

  if (!genreMode) {
    books = rankSearchResults(books, rankingQuery);
    // Final pin: ranking must not leave a translated work without its English
    // edition card (Cadáver exquisito → Tender Is the Flesh).
    try {
      const { ensureKnownTranslatedEditionPair } = await import(
        "@/lib/known-editions"
      );
      books = ensureKnownTranslatedEditionPair(books, searchQuery);
    } catch {
      // never fail search
    }
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
    ...flood.sourceCounts,
  };

  const hasMore = flood.hasMore;

  // Cache the anonymous page (before Inscribed) for ~45s.
  // Never cache empty shelves — that freezes outages into "0 results".
  if (books.length > 0) {
    setCachedSearchPage(cacheKey, {
      books,
      sources: SEARCH_SOURCES,
      sourceCounts,
      source: "multi",
      page: pageNumber,
      hasMore,
      descriptionSources,
      googleError: flood.googleError,
      googleRawCount: flood.googleRawCount,
    });
  }

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
    hasMore,
    userRatedSlugs,
    descriptionSources,
    // Temporary debug fields — remove once Google search stability is confirmed.
    googleError: flood.googleError,
    googleRawCount: flood.googleRawCount,
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
            const community = await getCommunityRatings(bookId);
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

