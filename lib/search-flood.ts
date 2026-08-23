import { searchBigBook } from "@/lib/big-book";
import type { SearchBooksOptions } from "@/lib/genre-search";
import { searchGoogleBooks, type GoogleBooksPageResult } from "@/lib/google-books";
import { searchGutendex } from "@/lib/gutendex";
import { isHardcoverConfigured, searchHardcover } from "@/lib/hardcover";
import { hasIsbndbApiKey, searchIsbndb } from "@/lib/isbndb";
import { searchOpenLibrary } from "@/lib/open-library";
import {
  createDeadline,
  type Deadline,
  withTimeout,
} from "@/lib/provider-resilience";
import {
  normalizeSearchQuery,
  primarySearchString,
  secondarySearchVariants,
  type NormalizedSearchQuery,
} from "@/lib/search-query";
import { recoverPopularTitleHits } from "@/lib/search-recovery";
import { knownWorkMatchesQuery } from "@/lib/known-editions";
import type { BookSource, BookSummary } from "@/types/book";

/** Per-provider caps — keep short so the overall search budget stays under Netlify. */
const PROVIDER_TIMEOUT_MS = 2500;
/** Flood stage share of the overall search budget. */
const FLOOD_BUDGET_MS = 4500;

export type ProviderFloodResult = {
  books: BookSummary[];
  sourceCounts: Partial<Record<BookSource, number>>;
  hasMore: boolean;
  googleError: GoogleBooksPageResult["error"];
  googleRawCount: number;
  normalized: NormalizedSearchQuery;
  primaryQuery: string;
  timedOutProviders: string[];
};

type ProviderPage = {
  source: BookSource;
  books: BookSummary[];
  hasMore: boolean;
  rawCount?: number;
  error?: GoogleBooksPageResult["error"];
  timedOut?: boolean;
};

function plainQuery(query: string): string {
  return query
    .replace(/\b(intitle|inauthor|isbn):/gi, " ")
    .replace(/"/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Multi-strategy query strings for one user search.
 * Cap fan-out tightly — each strategy multiplies provider calls.
 */
function buildQueryStrategies(normalized: NormalizedSearchQuery): string[] {
  const strategies: string[] = [];
  const seen = new Set<string>();

  function add(value: string | null | undefined) {
    const cleaned = value?.trim();
    if (!cleaned) return;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    strategies.push(cleaned);
  }

  add(normalized.raw);
  add(primarySearchString(normalized));

  if (normalized.kind === "isbn" && normalized.isbn) {
    add(normalized.isbn);
    add(`isbn:${normalized.isbn}`);
  }

  if (normalized.title) {
    add(normalized.title);
    add(`intitle:"${normalized.title.replace(/"/g, "")}"`);
  }

  if (normalized.title && normalized.author) {
    add(
      `intitle:"${normalized.title.replace(/"/g, "")}" inauthor:"${normalized.author.replace(/"/g, "")}"`
    );
  }

  for (const variant of secondarySearchVariants(normalized)) {
    add(variant);
  }

  // Emergency: 2 strategies max (exact + title) to stay inside Netlify budgets.
  return strategies.slice(0, 2);
}

async function timedProviderPage(
  source: BookSource,
  label: string,
  timeoutMs: number,
  run: () => Promise<Omit<ProviderPage, "source" | "timedOut">>
): Promise<ProviderPage> {
  if (timeoutMs <= 0) {
    return { source, books: [], hasMore: false, timedOut: true };
  }
  try {
    const page = await withTimeout(run(), timeoutMs, label);
    return { source, ...page, timedOut: false };
  } catch {
    return { source, books: [], hasMore: false, timedOut: true };
  }
}

/**
 * Stage 2 — one parallel wave across commercial + OL + optional providers.
 * Never waits sequentially for slow enrichment; overall flood budget is hard.
 */
export async function fetchSearchProviderFlood(input: {
  query: string;
  page: number;
  genreMode: boolean;
  searchOptions?: SearchBooksOptions;
  includeGutendex?: boolean;
  includeBigBook?: boolean;
  debug?: boolean;
  /** Optional parent deadline (searchBooks overall budget). */
  deadline?: Deadline;
}): Promise<ProviderFloodResult> {
  const normalized = normalizeSearchQuery(input.query);
  const primary = primarySearchString(normalized) || input.query.trim();
  const strategies = input.genreMode
    ? [primary]
    : buildQueryStrategies(normalized);

  const floodDeadline =
    input.deadline ?? createDeadline(FLOOD_BUDGET_MS);
  // Never spend more than FLOOD_BUDGET_MS even if parent allows more.
  const floodCapMs = Math.min(FLOOD_BUDGET_MS, floodDeadline.remaining());
  const localDeadline = createDeadline(floodCapMs);

  const books: BookSummary[] = [];
  const sourceCounts: Partial<Record<BookSource, number>> = {};
  const timedOutProviders: string[] = [];
  let hasMore = false;
  let googleError: GoogleBooksPageResult["error"] = null;
  let googleRawCount = 0;
  const seenIds = new Set<string>();

  function ingest(page: ProviderPage) {
    if (page.timedOut) {
      timedOutProviders.push(page.source);
    }
    sourceCounts[page.source] =
      (sourceCounts[page.source] ?? 0) + page.books.length;
    if (page.hasMore) hasMore = true;
    if (page.source === "google") {
      if (page.error) googleError = page.error;
      if (typeof page.rawCount === "number") googleRawCount += page.rawCount;
    }
    for (const book of page.books) {
      if (seenIds.has(book.id)) continue;
      seenIds.add(book.id);
      books.push(book);
    }
  }

  const stepTimeout = () =>
    localDeadline.cap(PROVIDER_TIMEOUT_MS, 200);

  const wave: Promise<ProviderPage>[] = [];
  const catalogQuery = plainQuery(primary) || primary;

  // Google: keep a short strategy fan-out (highest recall, no 1 req/s throttle).
  for (const strategy of strategies) {
    const ms = stepTimeout();
    wave.push(
      timedProviderPage("google", `google search:${strategy}`, ms, async () => {
        const result = await searchGoogleBooks(
          strategy,
          input.page,
          input.searchOptions
        );
        return {
          books: result.books,
          hasMore: result.hasMore,
          rawCount: result.rawCount,
          error: result.error,
        };
      })
    );
  }

  // Other providers: primary query only. Repeating ISBNdb/Hardcover/OL for
  // every Google strategy doubled work; ISBNdb also serializes at 1 req/s.
  if (hasIsbndbApiKey()) {
    const ms = stepTimeout();
    wave.push(
      timedProviderPage("isbndb", `isbndb search:${catalogQuery}`, ms, async () => {
        const result = await searchIsbndb(
          catalogQuery,
          input.page,
          input.searchOptions
        );
        return { books: result.books, hasMore: result.hasMore };
      })
    );
  }

  if (isHardcoverConfigured()) {
    const ms = stepTimeout();
    wave.push(
      timedProviderPage(
        "hardcover",
        `hardcover search:${catalogQuery}`,
        ms,
        async () => {
          const result = await searchHardcover(catalogQuery, input.page);
          return { books: result.books, hasMore: result.hasMore };
        }
      )
    );
  }

  // Open Library in the SAME wave — do not wait for commercial to finish first.
  if (!input.genreMode) {
    const olQuery = (normalized.title || catalogQuery).trim();
    if (olQuery) {
      const ms = stepTimeout();
      wave.push(
        timedProviderPage(
          "openlibrary",
          `openlibrary search:${olQuery}`,
          ms,
          async () => {
            const page = await searchOpenLibrary(
              olQuery,
              input.page,
              input.searchOptions
            );
            return { books: page.books, hasMore: page.hasMore };
          }
        )
      );
    }
  }

  if (input.includeGutendex) {
    const ms = stepTimeout();
    const q = plainQuery(primary) || primary;
    wave.push(
      timedProviderPage("gutendex", "gutendex search", ms, async () => {
        const page = await searchGutendex(q, input.page, input.searchOptions);
        return { books: page.books, hasMore: page.hasMore };
      })
    );
  }

  if (input.includeBigBook) {
    const ms = stepTimeout();
    const q = plainQuery(primary) || primary;
    wave.push(
      timedProviderPage("bigbook", "bigbook search", ms, async () => {
        const page = await searchBigBook(q, input.page, input.searchOptions);
        return { books: page.books, hasMore: page.hasMore };
      })
    );
  }

  const settled = await Promise.allSettled(wave);
  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    ingest(result.value);
  }

  // Catalog seed recovery — only if budget remains and results are thin
  // (or a known translated title still needs its English edition).
  const recoveryMs = localDeadline.cap(1500, 100);
  const needsRecovery =
    books.length < 8 || Boolean(knownWorkMatchesQuery(primary));
  if (
    !input.genreMode &&
    input.page === 1 &&
    needsRecovery &&
    recoveryMs > 0 &&
    !localDeadline.expired()
  ) {
    try {
      const recovered = await withTimeout(
        recoverPopularTitleHits(primary, books, { debug: input.debug }),
        recoveryMs,
        "search-recovery"
      );
      const prepend: BookSummary[] = [];
      for (const book of recovered) {
        if (seenIds.has(book.id)) continue;
        seenIds.add(book.id);
        prepend.push(book);
        sourceCounts[book.source] = (sourceCounts[book.source] ?? 0) + 1;
      }
      if (prepend.length > 0) {
        books.unshift(...prepend);
      }
    } catch (error) {
      timedOutProviders.push("search-recovery");
      if (input.debug) {
        console.error("[searchFlood] recovery failed:", error);
      }
    }
  }

  if (timedOutProviders.length > 0) {
    console.warn("[searchFlood] provider timeouts", {
      primary,
      timedOutProviders: Array.from(new Set(timedOutProviders)),
      elapsedMs: Date.now() - localDeadline.startedAt,
      sourceCounts,
    });
  }

  if (input.debug) {
    console.info("[searchFlood]", {
      primary,
      strategies,
      kind: normalized.kind,
      sourceCounts,
      totalRaw: books.length,
      timedOutProviders: Array.from(new Set(timedOutProviders)),
      elapsedMs: Date.now() - localDeadline.startedAt,
    });
  }

  return {
    books,
    sourceCounts,
    hasMore,
    googleError,
    googleRawCount,
    normalized,
    primaryQuery: primary,
    timedOutProviders: Array.from(new Set(timedOutProviders)),
  };
}

/** Providers advertised on search responses. */
export const SEARCH_FLOOD_SOURCES: BookSource[] = [
  "google",
  "isbndb",
  "hardcover",
  "openlibrary",
  "gutendex",
  "bigbook",
];
