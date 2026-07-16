import { withFinalizedTags } from "@/lib/book-tags";
import { mergeFieldsPreferringHardcover } from "@/lib/book-merge";
import {
  getBookDedupeKey,
  getBookIsbnKey,
  normalizePublishedYear,
  sortByPublishedYearDesc,
} from "@/lib/book-utils";
import type { BookSource, BookSummary } from "@/types/book";

/** Hardcover wins identity ties — field merging also prefers its metadata. */
const SOURCE_DEDUP_BONUS: Record<BookSource, number> = {
  hardcover: 12,
  isbndb: 4,
  google: 4,
  nyt: 2,
  openlibrary: 1,
  gutendex: 0,
};

const MISSING_DESCRIPTION_FALLBACK = "No description available.";

function hasDescription(book: BookSummary): boolean {
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
  return hasDescription(book) || hasCover(book);
}

function withDescriptionFallback(book: BookSummary): BookSummary {
  if (hasDescription(book)) return book;
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

  return books.filter(hasDescription);
}

/** Higher = cleaner / more complete record to keep during dedupe. */
function bookQualityScore(book: BookSummary): number {
  const description = book.description?.trim() ?? "";
  let score = 0;

  if (description) score += 3;
  if (hasCover(book)) score += 3;
  if (description && hasCover(book)) score += 4;
  if (getBookIsbnKey(book)) score += 1;
  if (normalizePublishedYear(book.publishedYear) != null) score += 1;
  if (book.pageCount && book.pageCount > 0) score += 1;
  if (book.authors.length > 0 && book.authors[0] !== "Unknown author") {
    score += 1;
  }
  score += Math.min(description.length / 200, 2);
  score += SOURCE_DEDUP_BONUS[book.source] ?? 0;

  return score;
}

/**
 * Keep the stronger record when duplicates collide.
 * Prefer Hardcover whenever it has a cover (merge fills description gaps).
 */
export function pickPreferredDuplicate(
  a: BookSummary,
  b: BookSummary
): BookSummary {
  const aHasBoth = hasDescriptionAndCover(a);
  const bHasBoth = hasDescriptionAndCover(b);

  // Prefer Hardcover identity when it has a cover (or is fully complete).
  if (
    a.source === "hardcover" &&
    b.source !== "hardcover" &&
    (aHasBoth || hasCover(a))
  ) {
    return a;
  }
  if (
    b.source === "hardcover" &&
    a.source !== "hardcover" &&
    (bHasBoth || hasCover(b))
  ) {
    return b;
  }

  if (aHasBoth !== bHasBoth) return bHasBoth ? b : a;

  // Prefer a cover over description-only when completeness differs.
  const aCover = hasCover(a);
  const bCover = hasCover(b);
  if (aCover !== bCover) return bCover ? b : a;

  const aScore = bookQualityScore(a);
  const bScore = bookQualityScore(b);
  if (aScore !== bScore) return bScore > aScore ? b : a;

  const aDesc = a.description?.trim() ?? "";
  const bDesc = b.description?.trim() ?? "";
  if (aDesc.length !== bDesc.length) {
    return bDesc.length > aDesc.length ? b : a;
  }

  const aYear = normalizePublishedYear(a.publishedYear);
  const bYear = normalizePublishedYear(b.publishedYear);
  if (aYear != null && bYear != null && aYear !== bYear) {
    return bYear > aYear ? b : a;
  }
  if (aYear == null && bYear != null) return b;
  if (bYear == null && aYear != null) return a;

  return a.id.localeCompare(b.id) <= 0 ? a : b;
}

function mergePreferredFields(
  winner: BookSummary,
  other: BookSummary
): BookSummary {
  return mergeFieldsPreferringHardcover(winner, winner, other);
}

/**
 * 1) Keep books with a description and/or cover (exclude empty stubs)
 * 2) Deduplicate by ISBN (strongest) then normalized title + author
 * 3) Prefer Hardcover identity + metadata on overlaps
 * 4) Prefer fully complete records; fall back to cover/description if needed
 * 5) Sort by published year, newest first (stable)
 */
export function finalizeSearchBooks(books: BookSummary[]): BookSummary[] {
  const candidates = books.filter(hasUsableSearchFields);

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
    const preferred = pickPreferredDuplicate(existing, book);
    const other = preferred === existing ? book : existing;
    byIsbn.set(isbnKey, mergePreferredFields(preferred, other));
  }

  // Pass 2: title + author for the rest (and against ISBN survivors)
  const byTitleAuthor = new Map<string, BookSummary>();

  for (const book of [...Array.from(byIsbn.values()), ...withoutIsbn]) {
    const key = getBookDedupeKey(book);
    const existing = byTitleAuthor.get(key);
    if (!existing) {
      byTitleAuthor.set(key, book);
      continue;
    }
    const preferred = pickPreferredDuplicate(existing, book);
    const other = preferred === existing ? book : existing;
    byTitleAuthor.set(key, mergePreferredFields(preferred, other));
  }

  const merged = Array.from(byTitleAuthor.values()).map((book) =>
    withFinalizedTags(book)
  );

  return sortByPublishedYearDesc(selectQualityBooks(merged));
}
