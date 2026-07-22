import { withFinalizedTags } from "@/lib/book-tags";
import { mergePreferredBookFields } from "@/lib/book-merge";
import {
  getBookDedupeKey,
  getBookIsbnKey,
  isMerchandiseOrCompanion,
  isWeakDescription,
  pickPreferredDuplicate,
  sortByPublishedYearDesc,
  type PickPreferredOptions,
} from "@/lib/book-utils";
import type { BookSummary } from "@/types/book";

const MISSING_DESCRIPTION_FALLBACK = "No description available.";

function hasDescription(book: BookSummary): boolean {
  return Boolean(book.description?.trim()) && !isWeakDescription(book.description);
}

function hasAnyDescription(book: BookSummary): boolean {
  return Boolean(book.description?.trim());
}

function hasCover(book: BookSummary): boolean {
  return Boolean(book.coverUrl?.trim());
}

function hasDescriptionAndCover(book: BookSummary): boolean {
  return hasDescription(book) && hasCover(book);
}

/** Eligible for merge — need at least one of description or cover. */
function hasUsableSearchFields(book: BookSummary): boolean {
  return hasAnyDescription(book) || hasCover(book);
}

function withDescriptionFallback(book: BookSummary): BookSummary {
  if (hasAnyDescription(book)) return book;
  return { ...book, description: MISSING_DESCRIPTION_FALLBACK };
}

/**
 * Prefer complete records. If none survive, fall back to cover-only
 * (with a short description stub), then description-only — never junk with neither.
 */
function selectQualityBooks(books: BookSummary[]): BookSummary[] {
  const withBoth = books.filter(hasDescriptionAndCover);
  if (withBoth.length > 0) return withBoth;

  const withCover = books.filter(hasCover).map(withDescriptionFallback);
  if (withCover.length > 0) return withCover;

  return books.filter(hasAnyDescription);
}

/**
 * Winner keeps its identity; missing/better fields fill in from the loser
 * (longest description, any cover, newest year, page count, genres, ISBN).
 */
function mergePreferredFields(
  winner: BookSummary,
  other: BookSummary
): BookSummary {
  return mergePreferredBookFields(winner, winner, other);
}

export type FinalizeSearchOptions = PickPreferredOptions & {
  /**
   * Rated (or otherwise protected) books that must appear in the final list
   * even if the quality filter would drop them. Prefer these DB identities
   * when a title/author or ISBN match is found among API results.
   */
  protectedBooks?: BookSummary[];
  /** When true, emit temporary [finalizeSearchBooks] debug logs. */
  debug?: boolean;
};

function dedupeCandidates(
  candidates: BookSummary[],
  options?: PickPreferredOptions
): { books: BookSummary[]; removedByIsbn: number; removedByTitleAuthor: number } {
  // Pass 1: ISBN matches always collapse
  const byIsbn = new Map<string, BookSummary>();
  const withoutIsbn: BookSummary[] = [];

  for (const book of candidates) {
    const isbnKey = getBookIsbnKey(book);
    if (!isbnKey) {
      withoutIsbn.push(book);
      continue;
    }
    const existing = byIsbn.get(isbnKey);
    if (!existing) {
      byIsbn.set(isbnKey, book);
      continue;
    }
    const preferred = pickPreferredDuplicate(existing, book, options);
    const other = preferred === existing ? book : existing;
    byIsbn.set(isbnKey, mergePreferredFields(preferred, other));
  }

  const afterIsbn = byIsbn.size + withoutIsbn.length;
  const removedByIsbn = candidates.length - afterIsbn;

  // Pass 2: normalized title + author (distinct ISBNs of the same work collapse)
  const byTitleAuthor = new Map<string, BookSummary>();

  for (const book of [...Array.from(byIsbn.values()), ...withoutIsbn]) {
    const key = getBookDedupeKey(book);
    const existing = byTitleAuthor.get(key);
    if (!existing) {
      byTitleAuthor.set(key, book);
      continue;
    }
    const preferred = pickPreferredDuplicate(existing, book, options);
    const other = preferred === existing ? book : existing;
    byTitleAuthor.set(key, mergePreferredFields(preferred, other));
  }

  const removedByTitleAuthor = afterIsbn - byTitleAuthor.size;

  return {
    books: Array.from(byTitleAuthor.values()),
    removedByIsbn,
    removedByTitleAuthor,
  };
}

/**
 * Ensure every protected (rated) book appears in `books`. When an API result
 * already matches by ISBN or title+author, keep the protected identity and
 * merge the richer fields. Otherwise append the protected book.
 */
function forceProtectedBooks(
  books: BookSummary[],
  protectedBooks: BookSummary[],
  options?: PickPreferredOptions
): { books: BookSummary[]; forcedCount: number } {
  if (protectedBooks.length === 0) {
    return { books, forcedCount: 0 };
  }

  const next = [...books];
  const indexById = new Map(next.map((book, index) => [book.id, index]));
  const indexByIsbn = new Map<string, number>();
  const indexByKey = new Map<string, number>();

  function reindex() {
    indexById.clear();
    indexByIsbn.clear();
    indexByKey.clear();
    next.forEach((book, index) => {
      indexById.set(book.id, index);
      const isbn = getBookIsbnKey(book);
      if (isbn) indexByIsbn.set(isbn, index);
      indexByKey.set(getBookDedupeKey(book), index);
    });
  }

  reindex();

  let forcedCount = 0;

  for (const protectedBook of protectedBooks) {
    const isbn = getBookIsbnKey(protectedBook);
    const existingIdx =
      indexById.get(protectedBook.id) ??
      (isbn !== null ? indexByIsbn.get(isbn) : undefined) ??
      indexByKey.get(getBookDedupeKey(protectedBook));

    if (existingIdx !== undefined) {
      const existing = next[existingIdx]!;
      // Prefer the DB/rated identity so ratings stay attached to the slug.
      const merged = withFinalizedTags(
        mergePreferredFields(protectedBook, existing)
      );
      const identityChanged = existing.id !== merged.id;
      next[existingIdx] = merged;
      if (identityChanged || !indexById.has(protectedBook.id)) {
        forcedCount += 1;
      }
      reindex();
      continue;
    }

    // Not in API / quality results — force it back in.
    const stub = withFinalizedTags(
      hasAnyDescription(protectedBook)
        ? protectedBook
        : withDescriptionFallback(protectedBook)
    );
    next.push(stub);
    forcedCount += 1;
    reindex();
  }

  return { books: next, forcedCount };
}

/**
 * 1) Keep books with a description and/or cover (exclude empty stubs)
 * 2) Deduplicate by ISBN (strongest) then normalized title + first author
 *    (shared key from getBookDedupeKey — same on server and client)
 * 3) Winner per pickPreferredDuplicate keeps its identity; merge the best
 *    fields from the losing edition (rated DB ids win when provided)
 * 4) Prefer fully complete records; fall back to cover/description if needed
 * 5) Force protected (rated) books back in if quality filter dropped them
 * 6) Sort by published year (newest), then descriptions, then the rest
 */
export function finalizeSearchBooks(
  books: BookSummary[],
  options?: FinalizeSearchOptions
): BookSummary[] {
  const ratedIds = options?.ratedIds;
  const pickOptions: PickPreferredOptions | undefined = ratedIds
    ? { ratedIds }
    : undefined;
  const protectedBooks = options?.protectedBooks ?? [];
  const protectedIds = new Set(protectedBooks.map((book) => book.id));
  const debug = options?.debug ?? false;

  const inputCount = books.length;
  const candidates = books.filter((book) => {
    const protectedHit =
      (ratedIds?.has(book.id) ?? false) || protectedIds.has(book.id);
    if (protectedHit) return true;
    if (isMerchandiseOrCompanion(book)) return false;
    return hasUsableSearchFields(book);
  });
  const droppedAsUnusable = inputCount - candidates.length;

  const {
    books: deduped,
    removedByIsbn,
    removedByTitleAuthor,
  } = dedupeCandidates(candidates, pickOptions);

  const merged = deduped.map((book) => withFinalizedTags(book));
  const qualitySelected = selectQualityBooks(merged);

  const { books: withProtected, forcedCount } = forceProtectedBooks(
    qualitySelected,
    protectedBooks,
    pickOptions
  );

  const result = sortByPublishedYearDesc(withProtected);
  const removedByDedupe = removedByIsbn + removedByTitleAuthor;

  if (debug) {
    console.info("[finalizeSearchBooks]", {
      input: inputCount,
      afterUsableFilter: candidates.length,
      droppedAsUnusable,
      removedByIsbnDedupe: removedByIsbn,
      removedByTitleAuthorDedupe: removedByTitleAuthor,
      removedByDedupe,
      afterDedupe: merged.length,
      afterQualityFilter: qualitySelected.length,
      ratedForcedBack: forcedCount,
      protectedInput: protectedBooks.length,
      ratedIds: ratedIds?.size ?? 0,
      output: result.length,
    });
  }

  return result;
}
