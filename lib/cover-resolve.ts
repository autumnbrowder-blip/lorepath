import type { BookSummary } from "@/types/book";

/**
 * Shared book-cover resolution for Browse cards and detail pages.
 *
 * Order:
 *  1. Existing provider coverUrl / coverImage
 *  2. Open Library cover by ISBN
 *  3. Open Library cover by OLID (from `ol-…` ids)
 *  4. Local fantasy placeholder
 *
 * Open Library missing covers return 404 when `default=false`, so next/image
 * `onError` can advance to the next candidate / placeholder.
 */

/** Fantasy parchment texture already used across LorePath UI. */
export const BOOK_COVER_PLACEHOLDER = "/images/parchment.jpg";

type CoverBook = Pick<BookSummary, "id" | "coverUrl" | "isbn"> & {
  coverImage?: string | null;
};

/** Short session memo so the same book does not re-resolve cover candidates. */
const coverCandidateMemo = new Map<string, string[]>();

function normalizeIsbn(isbn: string | null | undefined): string | null {
  if (!isbn?.trim()) return null;
  const digits = isbn.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 13) return digits;
  return null;
}

/** Extract Open Library edition/work id (e.g. OL45804W) from our `ol-` route id. */
export function openLibraryOlidFromBookId(id: string): string | null {
  const trimmed = id.trim();
  if (!trimmed.toLowerCase().startsWith("ol-")) return null;
  const raw = trimmed.slice(3).trim();
  // Work or edition keys: OL123W / OL123M
  const match = raw.match(/^(OL\d+[WM])$/i);
  return match ? match[1].toUpperCase() : null;
}

export function openLibraryCoverByIsbn(isbn: string | null | undefined): string | null {
  const digits = normalizeIsbn(isbn);
  if (!digits) return null;
  return `https://covers.openlibrary.org/b/isbn/${digits}-M.jpg?default=false`;
}

export function openLibraryCoverByOlid(id: string): string | null {
  const olid = openLibraryOlidFromBookId(id);
  if (!olid) return null;
  return `https://covers.openlibrary.org/b/olid/${olid}-M.jpg?default=false`;
}

function providerCover(book: CoverBook): string | null {
  const fromCoverUrl = book.coverUrl?.trim() || null;
  if (fromCoverUrl) return fromCoverUrl;
  const fromCoverImage = book.coverImage?.trim() || null;
  return fromCoverImage || null;
}

/**
 * Remote candidates only (no local placeholder) — safe to store in coverUrl / DB.
 */
export function resolveRemoteCoverUrl(book: CoverBook): string | null {
  return (
    providerCover(book) ||
    openLibraryCoverByIsbn(book.isbn) ||
    openLibraryCoverByOlid(book.id) ||
    null
  );
}

/**
 * Ordered cover candidates for next/image + onError fallback chain.
 * Always ends with the local fantasy placeholder.
 */
export function getCoverCandidates(book: CoverBook): string[] {
  const memoKey = `${book.id}|${book.coverUrl ?? ""}|${book.isbn ?? ""}|${book.coverImage ?? ""}`;
  const cached = coverCandidateMemo.get(memoKey);
  if (cached) return cached;

  const ordered: string[] = [];
  const push = (url: string | null | undefined) => {
    const value = url?.trim();
    if (!value) return;
    if (!ordered.includes(value)) ordered.push(value);
  };

  push(providerCover(book));
  push(openLibraryCoverByIsbn(book.isbn));
  push(openLibraryCoverByOlid(book.id));
  push(BOOK_COVER_PLACEHOLDER);

  coverCandidateMemo.set(memoKey, ordered);
  // Bound memo growth in long Browse sessions.
  if (coverCandidateMemo.size > 400) {
    const first = coverCandidateMemo.keys().next().value;
    if (first) coverCandidateMemo.delete(first);
  }

  return ordered;
}

/** Best cover src for display (never empty — falls back to placeholder). */
export function resolveCoverSrc(book: CoverBook): string {
  return getCoverCandidates(book)[0] ?? BOOK_COVER_PLACEHOLDER;
}

/** Fill missing `coverUrl` with OL ISBN/OLID when possible (does not use placeholder). */
export function fillMissingCoverUrl<T extends CoverBook>(book: T): T {
  if (book.coverUrl?.trim()) return book;
  const remote = resolveRemoteCoverUrl(book);
  return remote ? { ...book, coverUrl: remote } : book;
}

/**
 * Sync cover backfill for search results — no network, no new APIs.
 * Books that still lack a remote cover keep `coverUrl: null`; UI uses BookCover
 * placeholder via getCoverCandidates.
 */
export function enrichBooksWithCovers(
  books: BookSummary[]
): BookSummary[] {
  return books.map((book) => fillMissingCoverUrl(book));
}
