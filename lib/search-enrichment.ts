import {
  cleanDescription,
  hasRealDescription,
  isExactTitleMatch,
} from "@/lib/book-utils";
import { getGoogleBookByIsbn, searchGoogleBooks } from "@/lib/google-books";
import { fetchHardcoverBook, isHardcoverConfigured } from "@/lib/hardcover";
import {
  fetchIsbndbByIsbn,
  fetchIsbndbByTitle,
  hasIsbndbApiKey,
  searchIsbndb,
} from "@/lib/isbndb";
import { getOpenLibraryWorkBlurb, isOpenLibraryId } from "@/lib/open-library";
import { withTimeout } from "@/lib/provider-resilience";
import type { BookSummary } from "@/types/book";

/** Which source finally supplied a card's synopsis. */
export type DescriptionSource =
  | "openlibrary-work"
  | "google-isbn"
  | "google-title"
  | "isbndb-isbn"
  | "isbndb-title"
  | "hardcover";

export type SearchEnrichmentResult = {
  books: BookSummary[];
  /** Card id → source that filled the description (for logs/debugging). */
  filled: Map<string, DescriptionSource>;
};

type Supplement = {
  description?: string | null;
  coverUrl?: string | null;
  publishedYear?: number | null;
  pageCount?: number | null;
};

/** Cards to repair per search — enough to fill a page without a request storm. */
const DEFAULT_ENRICH_LIMIT = 8;
const DEFAULT_BUDGET_MS = 2800;
const CONCURRENCY = 4;
/** ISBNdb is a small daily plan; only spend a few calls per search. */
const ISBNDB_CALL_BUDGET = 4;

function authorFor(book: BookSummary): string[] {
  return book.authors.filter(
    (name) => name && name.toLowerCase() !== "unknown author"
  );
}

function applySupplement(
  book: BookSummary,
  supplement: Supplement
): BookSummary {
  const description = cleanDescription(supplement.description);
  return {
    ...book,
    description: description ?? book.description,
    coverUrl: book.coverUrl?.trim() || supplement.coverUrl?.trim() || null,
    publishedYear: book.publishedYear ?? supplement.publishedYear ?? null,
    pageCount: book.pageCount ?? supplement.pageCount ?? null,
  };
}

function usableDescription(value?: string | null): string | null {
  const cleaned = cleanDescription(value);
  if (!cleaned) return null;
  return hasRealDescription({ description: cleaned }) ? cleaned : null;
}

/**
 * Find a synopsis for one card, trying free sources before metered ones.
 * Open Library search docs omit descriptions that the work record has, so the
 * work lookup is both the cheapest and the highest-yield first step.
 */
async function findDescription(
  book: BookSummary,
  budget: { isbndbCalls: number }
): Promise<{ supplement: Supplement; source: DescriptionSource } | null> {
  const authors = authorFor(book);

  if (isOpenLibraryId(book.id)) {
    const work = await getOpenLibraryWorkBlurb(book.id);
    const description = usableDescription(work?.description);
    if (description) {
      return {
        supplement: {
          description,
          coverUrl: work?.coverUrl ?? null,
          publishedYear: work?.publishedYear ?? null,
        },
        source: "openlibrary-work",
      };
    }
  }

  if (book.isbn) {
    try {
      const viaGoogle = await getGoogleBookByIsbn(book.isbn);
      const description = usableDescription(viaGoogle?.description);
      if (description) {
        return {
          supplement: {
            description,
            coverUrl: viaGoogle?.coverUrl ?? null,
            publishedYear: viaGoogle?.publishedYear ?? null,
            pageCount: viaGoogle?.pageCount ?? null,
          },
          source: "google-isbn",
        };
      }
    } catch {
      // Google quota/outage — keep going.
    }
  }

  try {
    const author = authors[0];
    const query = author
      ? `intitle:"${book.title}" inauthor:"${author}"`
      : `intitle:"${book.title}"`;
    const page = await searchGoogleBooks(query, 1);
    const match =
      page.books.find(
        (candidate) =>
          isExactTitleMatch(book.title, candidate.title) &&
          hasRealDescription(candidate)
      ) ?? page.books.find((candidate) => hasRealDescription(candidate));
    const description = usableDescription(match?.description);
    if (description && match) {
      return {
        supplement: {
          description,
          coverUrl: match.coverUrl,
          publishedYear: match.publishedYear,
          pageCount: match.pageCount,
        },
        source: "google-title",
      };
    }
  } catch {
    // Google quota/outage — keep going.
  }

  if (hasIsbndbApiKey() && budget.isbndbCalls > 0) {
    if (book.isbn) {
      budget.isbndbCalls -= 1;
      const viaIsbn = await fetchIsbndbByIsbn(book.isbn);
      const description = usableDescription(viaIsbn?.description);
      if (description) {
        return {
          supplement: {
            description,
            coverUrl: viaIsbn?.coverUrl ?? null,
            publishedYear: viaIsbn?.publishedYear ?? null,
            pageCount: viaIsbn?.pageCount ?? null,
          },
          source: "isbndb-isbn",
        };
      }
    }

    if (budget.isbndbCalls > 0) {
      budget.isbndbCalls -= 1;
      const viaTitle = await fetchIsbndbByTitle(book.title, authors);
      const description = usableDescription(viaTitle?.description);
      if (description) {
        return {
          supplement: {
            description,
            coverUrl: viaTitle?.coverUrl ?? null,
            publishedYear: viaTitle?.publishedYear ?? null,
            pageCount: viaTitle?.pageCount ?? null,
          },
          source: "isbndb-title",
        };
      }
    }
  }

  if (isHardcoverConfigured()) {
    const viaHardcover = await fetchHardcoverBook(book.title, authors);
    const description = usableDescription(viaHardcover?.description);
    if (description) {
      return {
        supplement: {
          description,
          coverUrl: viaHardcover?.coverUrl ?? null,
          publishedYear: viaHardcover?.publishedYear ?? null,
          pageCount: viaHardcover?.pageCount ?? null,
        },
        source: "hardcover",
      };
    }
  }

  return null;
}

/** Below this, the flood is considered thin enough to spend a metered call. */
const BACKFILL_RESULT_THRESHOLD = 5;

/**
 * Metered backup providers, queried only when the free flood came back thin.
 * ISBNdb ids resolve on the detail page, so its rows are safe to surface as
 * cards; Hardcover stays an enrichment-only source for that reason.
 */
export async function fetchBackupSearchResults(
  query: string,
  existing: BookSummary[]
): Promise<BookSummary[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  if (existing.length >= BACKFILL_RESULT_THRESHOLD) return [];
  if (!hasIsbndbApiKey()) return [];

  try {
    const page = await withTimeout(
      searchIsbndb(trimmed, 1),
      3000,
      "isbndb search backfill"
    );
    return page.books;
  } catch (error) {
    console.error("[searchEnrichment] ISBNdb backfill failed:", {
      query: trimmed,
      message: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

export type EnrichSearchOptions = {
  /** Max cards to repair (in list order). */
  limit?: number;
  /** Whole-stage time budget; partial results are kept when it expires. */
  budgetMs?: number;
  debug?: boolean;
};

/**
 * Fill missing synopses before any description-based filtering runs, so a real
 * book is never dropped just because its first provider had no blurb.
 */
export async function enrichSearchDescriptions(
  books: BookSummary[],
  options?: EnrichSearchOptions
): Promise<SearchEnrichmentResult> {
  const filled = new Map<string, DescriptionSource>();
  if (books.length === 0) return { books, filled };

  const limit = options?.limit ?? DEFAULT_ENRICH_LIMIT;
  const targets = books
    .map((book, index) => ({ book, index }))
    .filter(({ book }) => !hasRealDescription(book))
    .slice(0, limit);

  if (targets.length === 0) return { books, filled };

  const next = [...books];
  const budget = { isbndbCalls: ISBNDB_CALL_BUDGET };
  let cursor = 0;

  async function worker() {
    while (cursor < targets.length) {
      const current = targets[cursor++];
      if (!current) return;
      try {
        const hit = await findDescription(current.book, budget);
        if (!hit) continue;
        next[current.index] = applySupplement(current.book, hit.supplement);
        filled.set(current.book.id, hit.source);
      } catch (error) {
        console.error("[searchEnrichment] description lookup failed:", {
          id: current.book.id,
          title: current.book.title,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  try {
    await withTimeout(
      Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, targets.length) }, () =>
          worker()
        )
      ),
      options?.budgetMs ?? DEFAULT_BUDGET_MS,
      "search description enrichment"
    );
  } catch {
    // Budget spent — keep whatever finished.
  }

  if (options?.debug) {
    console.info("[searchEnrichment]", {
      candidates: targets.length,
      filled: filled.size,
      sources: Array.from(filled.entries()).slice(0, 10),
    });
  }

  return { books: next, filled };
}
