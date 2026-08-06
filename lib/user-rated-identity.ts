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

/** True when this browse/search card is the same work the user already rated. */
export function isBookInscribedByUser(
  book: Pick<BookSummary, "id" | "title" | "authors" | "isbn">,
  rated: readonly UserRatedIdentity[]
): boolean {
  if (!rated.length) return false;

  const bookId = book.id.trim();
  if (bookId && rated.some((row) => row.slug === bookId)) {
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

/** Card ids from a result page that should show the Inscribed badge. */
export function inscribedCardIdsForBooks(
  books: readonly Pick<BookSummary, "id" | "title" | "authors" | "isbn">[],
  rated: readonly UserRatedIdentity[]
): string[] {
  if (!rated.length || books.length === 0) return [];
  return books
    .filter((book) => isBookInscribedByUser(book, rated))
    .map((book) => book.id);
}
