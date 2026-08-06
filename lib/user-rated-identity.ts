import {
  authorKeysCompatible,
  getBookAuthorDedupeKey,
  getBookDedupeKey,
  getBookTitleDedupeKey,
} from "@/lib/book-utils";
import type { BookSummary } from "@/types/book";

/**
 * One work the signed-in user has rated.
 * `slug` is the external id stored on `books.slug` at rating time (route id).
 * Title/author let browse cards match when search returns a different provider id
 * for the same work (e.g. rated `ol-OL19329975W`, card shows a Google volume id).
 */
export type UserRatedIdentity = {
  slug: string;
  title: string;
  author: string | null;
};

/** Normalize route/search ids so ol-%2F… and ol-/… compare equal. */
export function normalizeExternalBookId(id: string): string {
  const trimmed = id.trim();
  if (!trimmed) return "";
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

/** True when this browse/search card is the same work the user already rated. */
export function isBookInscribedByUser(
  book: Pick<BookSummary, "id" | "title" | "authors" | "isbn">,
  rated: readonly UserRatedIdentity[]
): boolean {
  if (!rated.length) return false;

  const bookId = normalizeExternalBookId(book.id);
  if (
    bookId &&
    rated.some((row) => normalizeExternalBookId(row.slug) === bookId)
  ) {
    return true;
  }

  const bookKey = getBookDedupeKey(book);
  const bookTitle = getBookTitleDedupeKey(book);
  const bookAuthor = getBookAuthorDedupeKey(book);

  for (const row of rated) {
    const ratedAsBook: Pick<BookSummary, "id" | "title" | "authors" | "isbn"> = {
      id: row.slug,
      title: row.title,
      authors: row.author?.trim() ? [row.author.trim()] : ["Unknown author"],
      isbn: null,
    };

    if (getBookDedupeKey(ratedAsBook) === bookKey) {
      return true;
    }

    // Soft author match: same title + compatible author tokens
    // (e.g. "buehlman" vs "buehlman c") when exact keys differ.
    if (
      getBookTitleDedupeKey(ratedAsBook) === bookTitle &&
      bookTitle &&
      authorKeysCompatible(getBookAuthorDedupeKey(ratedAsBook), bookAuthor)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Align search/browse card ids to the user's rated `books.slug` when the card
 * is the same work. After this, hasUserRating can use exact id === slug.
 */
export function alignBooksToRatedSlugs<T extends BookSummary>(
  books: readonly T[],
  rated: readonly UserRatedIdentity[]
): T[] {
  if (!rated.length || books.length === 0) return [...books];

  return books.map((book) => {
    const bookId = normalizeExternalBookId(book.id);
    const exact = rated.find(
      (row) => normalizeExternalBookId(row.slug) === bookId
    );
    if (exact) {
      return exact.slug !== book.id ? { ...book, id: exact.slug } : book;
    }
    const match = rated.find((row) => isBookInscribedByUser(book, [row]));
    if (!match) return book;
    return { ...book, id: match.slug };
  });
}

/** Card ids from a result page that should show the Inscribed badge. */
export function inscribedCardIdsForBooks(
  books: readonly Pick<BookSummary, "id" | "title" | "authors" | "isbn">[],
  rated: readonly UserRatedIdentity[]
): string[] {
  if (!rated.length || books.length === 0) return [];
  const ids = new Set<string>();
  for (const book of books) {
    if (!isBookInscribedByUser(book, rated)) continue;
    const match = rated.find(
      (row) =>
        normalizeExternalBookId(row.slug) ===
          normalizeExternalBookId(book.id) ||
        isBookInscribedByUser(book, [row])
    );
    ids.add(match?.slug ?? book.id);
  }
  return Array.from(ids);
}

/** Slug set for O(1) exact hasUserRating checks after alignment. */
export function ratedSlugSet(
  rated: readonly UserRatedIdentity[]
): Set<string> {
  return new Set(
    rated
      .map((row) => normalizeExternalBookId(row.slug))
      .filter(Boolean)
  );
}
