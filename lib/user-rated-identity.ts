import {
  authorKeysCompatible,
  getBookAuthorDedupeKey,
  getBookTitleDedupeKey,
  getBookWorkDedupeKey,
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
  return createRatedBookLookup(rated).has(book);
}

/**
 * Align search/browse card ids to the user's rated `books.slug` when the card
 * id already matches that slug (normalization only).
 *
 * Do NOT rewrite via title+author work keys: original-language and English
 * editions of the same work must keep distinct Open the Tome ids.
 * Inscribed badges still use work-level matching in `createRatedBookLookup`.
 */
export function alignBooksToRatedSlugs<T extends BookSummary>(
  books: readonly T[],
  rated: readonly UserRatedIdentity[]
): T[] {
  if (!rated.length || books.length === 0) return [...books];

  const slugSet = new Set(
    rated
      .map((row) => normalizeExternalBookId(row.slug))
      .filter(Boolean)
  );
  const slugByNormalized = new Map(
    rated
      .filter((row) => row.slug?.trim())
      .map((row) => [normalizeExternalBookId(row.slug), row.slug] as const)
  );

  return books.map((book) => {
    const normalized = normalizeExternalBookId(book.id);
    if (!slugSet.has(normalized)) return book;
    const slug = slugByNormalized.get(normalized);
    if (!slug || slug === book.id) return book;
    return { ...book, id: slug };
  });
}

/** Card ids from a result page that should show the Inscribed badge. */
export function inscribedCardIdsForBooks(
  books: readonly Pick<BookSummary, "id" | "title" | "authors" | "isbn">[],
  rated: readonly UserRatedIdentity[]
): string[] {
  if (!rated.length || books.length === 0) return [];
  const lookup = createRatedBookLookup(rated);
  const ids = new Set<string>();
  for (const book of books) {
    const slug = lookup.keyFor(book);
    if (slug) ids.add(slug);
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

/**
 * The single key Inscribed is keyed on: the rated work.
 * Written as `books.slug` (the `/books/[id]` route id) when a rating is saved,
 * and reduced to a provider-independent `title::author` work key so a card that
 * arrives with another provider's id resolves to the same rated work.
 */
export function ratedBookKey(
  book: Pick<BookSummary, "id" | "title" | "authors" | "isbn">
): string {
  // Work-level (no language) so Original + English cards share Inscribed state.
  return getBookWorkDedupeKey(book);
}

export type RatedBookLookup = {
  /** Number of rated works in the set. */
  size: number;
  /** Rated `books.slug` values (normalized) — the exact-key fast path. */
  slugs: ReadonlySet<string>;
  /** Provider-independent work keys for the same rated works. */
  workKeys: ReadonlySet<string>;
  /** The rated slug this card resolves to, or null when unrated. */
  keyFor(
    book: Pick<BookSummary, "id" | "title" | "authors" | "isbn">
  ): string | null;
  /** True when the logged-in reader already rated this work. */
  has(book: Pick<BookSummary, "id" | "title" | "authors" | "isbn">): boolean;
};

/** Build one lookup used for every hasUserRating decision. */
export function createRatedBookLookup(
  rated: readonly UserRatedIdentity[]
): RatedBookLookup {
  const slugToKey = new Map<string, string>();
  const workKeyToSlug = new Map<string, string>();

  for (const row of rated) {
    const slug = row.slug?.trim();
    if (!slug) continue;
    slugToKey.set(normalizeExternalBookId(slug), slug);
    if (row.title?.trim()) {
      workKeyToSlug.set(
        ratedBookKey({
          id: slug,
          title: row.title,
          authors: row.author?.trim() ? [row.author.trim()] : ["Unknown author"],
          isbn: null,
        }),
        slug
      );
    }
  }

  function keyFor(
    book: Pick<BookSummary, "id" | "title" | "authors" | "isbn">
  ): string | null {
    if (rated.length === 0) return null;

    const exact = slugToKey.get(normalizeExternalBookId(book.id));
    if (exact) return exact;

    const byWork = workKeyToSlug.get(ratedBookKey(book));
    if (byWork) return byWork;

    // Same title with compatible author tokens ("buehlman" vs "buehlman c").
    const title = getBookTitleDedupeKey(book);
    if (!title) return null;
    const author = getBookAuthorDedupeKey(book);
    const match = rated.find((row) => {
      const ratedAsBook = {
        id: row.slug,
        title: row.title,
        authors: row.author?.trim() ? [row.author.trim()] : ["Unknown author"],
        isbn: null,
      };
      return (
        getBookTitleDedupeKey(ratedAsBook) === title &&
        authorKeysCompatible(getBookAuthorDedupeKey(ratedAsBook), author)
      );
    });
    return match?.slug ?? null;
  }

  return {
    size: slugToKey.size,
    slugs: new Set(slugToKey.keys()),
    workKeys: new Set(workKeyToSlug.keys()),
    keyFor,
    has: (book) => keyFor(book) !== null,
  };
}
