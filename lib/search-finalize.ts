import { withFinalizedTags } from "@/lib/book-tags";
import { mergePreferredBookFields } from "@/lib/book-merge";
import {
  getBookDedupeKey,
  getBookIsbnKey,
  pickPreferredDuplicate,
  sortByPublishedYearDesc,
} from "@/lib/book-utils";
import type { BookSummary } from "@/types/book";

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

/**
 * 1) Keep books with a description and/or cover (exclude empty stubs)
 * 2) Deduplicate by ISBN (strongest) then normalized title + first author
 *    (shared key from getBookDedupeKey — same on server and client)
 * 3) Winner per pickPreferredDuplicate keeps its identity; merge the best
 *    fields from the losing edition
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

  // Pass 2: normalized title + author for the rest (and against ISBN
  // survivors) — distinct ISBNs of the same work collapse here.
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
