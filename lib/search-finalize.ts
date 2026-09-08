import { withFinalizedTags } from "@/lib/book-tags";
import { mergePreferredBookFields } from "@/lib/book-merge";
import { getLanguageEditionBucket } from "@/lib/book-language";
import {
  booksShareTitleAuthorWork,
  getBookDedupeKey,
  getBookIsbnKey,
  getBookWorkDedupeKey,
  isExactTitleMatch,
  isMerchandiseOrCompanion,
  isPlaceholderDescription,
  isWeakDescription,
  pickPreferredDuplicate,
  PLACEHOLDER_DESCRIPTION,
  sortByPublishedYearDesc,
  type PickPreferredOptions,
} from "@/lib/book-utils";
import {
  collectWorkEditionRefs,
  firstPublishedYear,
  pickFirstEditionId,
  pickLatestEdition,
  isBannedLatestEditionId,
} from "@/lib/book-work";
import type { BookSummary } from "@/types/book";

const MISSING_DESCRIPTION_FALLBACK = PLACEHOLDER_DESCRIPTION;

function hasDescription(book: BookSummary): boolean {
  return Boolean(book.description?.trim()) && !isWeakDescription(book.description);
}

/** Any real text — the "No description available." stub does not count. */
function hasAnyDescription(book: BookSummary): boolean {
  return !isPlaceholderDescription(book.description);
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
 * Exact title matches for the active query always survive (even thin metadata).
 */
function selectQualityBooks(
  books: BookSummary[],
  query?: string
): BookSummary[] {
  const exactTitleHits = query
    ? books.filter((book) => isExactTitleMatch(query, book.title))
    : [];

  const withBoth = books.filter(hasDescriptionAndCover);
  if (withBoth.length > 0) {
    return mergeExactTitleSurvivors(withBoth, exactTitleHits);
  }

  const withCover = books.filter(hasCover).map(withDescriptionFallback);
  if (withCover.length > 0) {
    return mergeExactTitleSurvivors(withCover, exactTitleHits);
  }

  const withDesc = books.filter(hasAnyDescription);
  if (withDesc.length > 0) {
    return mergeExactTitleSurvivors(withDesc, exactTitleHits);
  }

  // Nothing else survived — still keep exact title hits with a stub description.
  return exactTitleHits.map(withDescriptionFallback);
}

function mergeExactTitleSurvivors(
  selected: BookSummary[],
  exactTitleHits: BookSummary[]
): BookSummary[] {
  if (exactTitleHits.length === 0) return selected;
  const ids = new Set(selected.map((book) => book.id));
  const keys = new Set(selected.map((book) => getBookDedupeKey(book)));
  const extras = exactTitleHits
    .filter(
      (book) => !ids.has(book.id) && !keys.has(getBookDedupeKey(book))
    )
    .map(withDescriptionFallback);
  return extras.length > 0 ? [...selected, ...extras] : selected;
}

/**
 * Visible card is the newest English covered edition. Title / description /
 * cover / tags fill from the strongest record (Hardcover when it was in the
 * search page). firstPublishYear stays the earliest year in the pair.
 * Latest edition id is stored only when it differs from first published.
 */
function mergePreferredFields(
  winner: BookSummary,
  other: BookSummary
): BookSummary {
  const identity = pickLatestEdition(winner, other);
  const merged = mergePreferredBookFields(identity, winner, other);
  const first = firstPublishedYear([winner, other]);
  const firstEditionId = pickFirstEditionId([winner, other]) ?? identity.id;
  const latestEditionId =
    identity.id !== firstEditionId && !isBannedLatestEditionId(identity.id)
      ? identity.id
      : null;
  return {
    ...merged,
    id: identity.id,
    source: identity.source,
    firstPublishYear: first ?? merged.firstPublishYear ?? null,
    firstEditionId,
    latestEditionId,
    workEditions: collectWorkEditionRefs(winner, other),
  };
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
  /**
   * Active search query — exact title matches for this query always survive
   * quality filtering (thin/missing description must not hide them).
   */
  query?: string;
  /**
   * Dedupe and merge only, skipping the description/cover quality filter.
   * Used for the first pass so enrichment can run before anything is dropped.
   */
  deferQualityFilter?: boolean;
};

function dedupeCandidates(
  candidates: BookSummary[],
  options?: PickPreferredOptions
): {
  books: BookSummary[];
  removedByIsbn: number;
  removedByTitleAuthor: number;
} {
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

  // Pass 2: normalized title + primary author (language is not part of the key)
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

  // Pass 3: soft work-level merge — same title + compatible author keys
  // ("buehlman" ↔ "buehlman c", "herbert" ↔ "herbert f") or unknown-author
  // into a sole titled author. Language editions of the same title+author
  // collapse here; English commercial ids win via pickLatestEdition.
  const workMerged: BookSummary[] = [];
  for (const book of Array.from(byTitleAuthor.values())) {
    let mergedIntoExisting = false;

    for (let i = 0; i < workMerged.length; i++) {
      const existing = workMerged[i]!;
      if (!booksShareTitleAuthorWork(existing, book)) continue;

      const preferred = pickPreferredDuplicate(existing, book, options);
      const other = preferred === existing ? book : existing;
      workMerged[i] = mergePreferredFields(preferred, other);
      mergedIntoExisting = true;
      break;
    }

    if (!mergedIntoExisting) {
      workMerged.push(book);
    }
  }

  const removedByTitleAuthor = afterIsbn - workMerged.length;

  return {
    books: workMerged,
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
    const keyIdx = indexByKey.get(getBookDedupeKey(protectedBook));
    const workIdx = next.findIndex((book) =>
      booksShareTitleAuthorWork(book, protectedBook)
    );
    const existingIdx =
      indexById.get(protectedBook.id) ??
      (isbn !== null ? indexByIsbn.get(isbn) : undefined) ??
      keyIdx ??
      (workIdx >= 0 ? workIdx : undefined);

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

/** When an English copy exists for the same title+author, drop non-English rows. */
function dropNonEnglishWhenEnglishExists(books: BookSummary[]): BookSummary[] {
  const groups = new Map<string, BookSummary[]>();
  for (const book of books) {
    const key = getBookWorkDedupeKey(book);
    const list = groups.get(key) ?? [];
    list.push(book);
    groups.set(key, list);
  }
  const next: BookSummary[] = [];
  for (const group of Array.from(groups.values())) {
    const hasEnglish = group.some(
      (book) => getLanguageEditionBucket(book) === "eng"
    );
    if (!hasEnglish) {
      next.push(...group);
      continue;
    }
    next.push(
      ...group.filter((book) => getLanguageEditionBucket(book) !== "non-eng")
    );
  }
  return next;
}

/**
 * 1) Keep books with a description and/or cover (exclude empty stubs)
 * 2) Deduplicate by ISBN (strongest) then normalized title + first author
 *    (shared key from getBookDedupeKey — same on server and client; language
 *    is not part of the key)
 * 3) Winner per pickPreferredDuplicate keeps its identity; merge the best
 *    fields from the losing edition (rated DB ids win when provided)
 * 4) Prefer fully complete records; fall back to cover/description if needed
 * 5) Force protected (rated) books back in if quality filter dropped them
 * 6) Sort by published year (newest); missing years last
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
  const query = options?.query?.trim() || undefined;
  const candidates = books.filter((book) => {
    const protectedHit =
      (ratedIds?.has(book.id) ?? false) || protectedIds.has(book.id);
    if (protectedHit) return true;
    if (query && isExactTitleMatch(query, book.title)) return true;
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
  let qualitySelected = options?.deferQualityFilter
    ? merged
    : selectQualityBooks(merged, query);

  // A search that found real records must never come back empty; enrichment
  // may still be pending for these, so keep them with a stub description.
  if (qualitySelected.length === 0 && merged.length > 0) {
    qualitySelected = merged.map(withDescriptionFallback);
  }

  const { books: withProtected, forcedCount } = forceProtectedBooks(
    qualitySelected,
    protectedBooks,
    pickOptions
  );

  const result = sortByPublishedYearDesc(
    dropNonEnglishWhenEnglishExists(withProtected)
  );
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
