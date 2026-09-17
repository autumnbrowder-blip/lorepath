import type { BookSummary } from "@/types/book";

/**
 * Shared book-cover resolution for Browse cards and detail pages.
 *
 * Order:
 *  1. Stored Google thumbnail (zoom=1) or OL /b/id/N-M.jpg
 *  2. Other remote covers (not Hardcover)
 *  3. Open Library cover by ISBN last (often 404)
 *  4. Local fantasy placeholder
 *
 * Never waits on Hardcover. Hardcover CDN URLs are skipped.
 */

/** Fantasy parchment texture already used across LorePath UI. */
export const BOOK_COVER_PLACEHOLDER = "/images/parchment.webp";

export type CoverSource = "google" | "ol" | "none";

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

export function isGoogleCoverUrl(url: string): boolean {
  return /books\.google(?:usercontent)?\.com|googleusercontent\.com\/books|googleapis\.com\/books/i.test(
    url
  );
}

export function isOpenLibraryCoverUrl(url: string): boolean {
  return /covers\.openlibrary\.org/i.test(url);
}

export function isHardcoverCoverUrl(url: string): boolean {
  return /hardcover\.app/i.test(url);
}

/**
 * Force https and zoom=1 on Google Books thumbnail URLs.
 * zoom=5 is the tiny smallThumbnail; zoom=1 is the card-sized image.
 */
export function normalizeGoogleCoverUrl(url: string): string {
  let next = url.trim().replace(/^http:\/\//i, "https://");
  if (/[?&]zoom=\d+/i.test(next)) {
    next = next.replace(/([?&]zoom=)\d+/i, "$11");
  } else if (/books\.google\.com/i.test(next)) {
    next += next.includes("?") ? "&zoom=1" : "?zoom=1";
  }
  return next;
}

export function coverSourceFromUrl(url: string | null | undefined): CoverSource {
  const value = url?.trim() ?? "";
  if (!value || value === BOOK_COVER_PLACEHOLDER || isHardcoverCoverUrl(value)) {
    return "none";
  }
  if (isGoogleCoverUrl(value)) return "google";
  if (isOpenLibraryCoverUrl(value)) return "ol";
  return "none";
}

export function logCoverSource(url: string | null | undefined): CoverSource {
  const source = coverSourceFromUrl(url);
  console.info(`[covers] source=${source}`);
  return source;
}

/** Extract Open Library edition/work id (e.g. OL45804W) from our `ol-` route id. */
export function openLibraryOlidFromBookId(id: string): string | null {
  const trimmed = id.trim();
  if (!trimmed.toLowerCase().startsWith("ol-")) return null;
  const raw = trimmed.slice(3).trim();
  const match = raw.match(/^(OL\d+[WM])$/i);
  return match ? match[1].toUpperCase() : null;
}

export function openLibraryCoverByIsbn(isbn: string | null | undefined): string | null {
  const digits = normalizeIsbn(isbn);
  if (!digits) return null;
  return `https://covers.openlibrary.org/b/isbn/${digits}-M.jpg?default=false`;
}

export function isOpenLibraryCoverIdUrl(url: string): boolean {
  return /covers\.openlibrary\.org\/b\/id\/\d+/i.test(url);
}

function isOpenLibraryIsbnCoverUrl(url: string): boolean {
  return /covers\.openlibrary\.org\/b\/isbn\//i.test(url);
}

export function openLibraryCoverByOlid(id: string): string | null {
  const olid = openLibraryOlidFromBookId(id);
  if (!olid) return null;
  return `https://covers.openlibrary.org/b/olid/${olid}-M.jpg?default=false`;
}

/** Google or OL /b/id/N-M.jpg — usable as the first <img> src. */
function primaryStoredCover(book: CoverBook): string | null {
  for (const raw of [book.coverUrl, book.coverImage]) {
    const value = raw?.trim();
    if (!value || isHardcoverCoverUrl(value)) continue;
    if (isGoogleCoverUrl(value)) return normalizeGoogleCoverUrl(value);
    if (isOpenLibraryCoverIdUrl(value)) return value;
  }
  return null;
}

function googleCover(book: CoverBook): string | null {
  for (const raw of [book.coverUrl, book.coverImage]) {
    const value = raw?.trim();
    if (!value || isHardcoverCoverUrl(value)) continue;
    if (isGoogleCoverUrl(value)) return normalizeGoogleCoverUrl(value);
  }
  return null;
}

function otherRemoteCover(book: CoverBook): string | null {
  for (const raw of [book.coverUrl, book.coverImage]) {
    const value = raw?.trim();
    if (!value || isHardcoverCoverUrl(value)) continue;
    if (isGoogleCoverUrl(value)) continue;
    if (value.startsWith("/") && !value.startsWith("//")) continue;
    return value;
  }
  return null;
}

/**
 * Prefer a working stored URL (Google or OL /b/id/), never Hardcover.
 * Do not prefer /b/isbn/?default=false — those 404 and look like no cover.
 */
export function preferCoverUrl(
  ...urls: Array<string | null | undefined>
): string | null {
  const cleaned = urls
    .map((url) => url?.trim() ?? "")
    .filter(Boolean)
    .filter((url) => !isHardcoverCoverUrl(url));

  const google = cleaned.find((url) => isGoogleCoverUrl(url));
  if (google) return normalizeGoogleCoverUrl(google);

  const olId = cleaned.find((url) => isOpenLibraryCoverIdUrl(url));
  if (olId) return olId;

  const olOther = cleaned.find(
    (url) => isOpenLibraryCoverUrl(url) && !isOpenLibraryIsbnCoverUrl(url)
  );
  if (olOther) return olOther;

  const olIsbn = cleaned.find((url) => isOpenLibraryIsbnCoverUrl(url));
  if (olIsbn) return olIsbn;

  return cleaned[0] || null;
}

/**
 * Remote candidates only (no local placeholder) — safe to store in coverUrl / DB.
 */
export function resolveRemoteCoverUrl(book: CoverBook): string | null {
  return (
    primaryStoredCover(book) ||
    googleCover(book) ||
    otherRemoteCover(book) ||
    openLibraryCoverByIsbn(book.isbn) ||
    null
  );
}

/**
 * Ordered cover candidates for a plain <img> + onError fallback chain.
 * Always ends with the local fantasy placeholder. Never includes Hardcover.
 */
export function getCoverCandidates(book: CoverBook): string[] {
  const memoKey = `${book.id}|${book.coverUrl ?? ""}|${book.isbn ?? ""}|${book.coverImage ?? ""}`;
  const cached = coverCandidateMemo.get(memoKey);
  if (cached) return cached;

  const ordered: string[] = [];
  const push = (url: string | null | undefined) => {
    const value = url?.trim();
    if (!value) return;
    if (isHardcoverCoverUrl(value)) return;
    if (ordered.includes(value)) return;
    ordered.push(value);
  };

  // 1. Stored Google or OL /b/id/14407898-M.jpg — do not strip these.
  push(primaryStoredCover(book));
  push(googleCover(book));
  const other = otherRemoteCover(book);
  if (other && !isOpenLibraryIsbnCoverUrl(other)) {
    push(other);
  }
  // ISBN ?default=false 404s often — never first.
  push(openLibraryCoverByIsbn(book.isbn));
  push(BOOK_COVER_PLACEHOLDER);

  coverCandidateMemo.set(memoKey, ordered);
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

/**
 * Fill / replace coverUrl with Google zoom=1, else OL ISBN.
 * Hardcover URLs are treated as missing so they never block OL fallback.
 */
export function fillMissingCoverUrl<T extends CoverBook>(book: T): T {
  const existing = book.coverUrl?.trim() || null;
  const hardcoverOnly = Boolean(existing && isHardcoverCoverUrl(existing));
  const google = existing && isGoogleCoverUrl(existing)
    ? normalizeGoogleCoverUrl(existing)
    : null;

  if (google) {
    return google === existing ? book : { ...book, coverUrl: google };
  }

  if (existing && !hardcoverOnly) return book;

  const remote = resolveRemoteCoverUrl({ ...book, coverUrl: hardcoverOnly ? null : existing });
  return remote ? { ...book, coverUrl: remote } : { ...book, coverUrl: hardcoverOnly ? null : existing };
}

/**
 * Sync cover backfill for search results — no network, no new APIs.
 * Logs [covers] source=google|ol|none once per book.
 */
export function enrichBooksWithCovers(
  books: BookSummary[]
): BookSummary[] {
  return books.map((book) => {
    const next = fillMissingCoverUrl(book);
    const display = getCoverCandidates(next)[0] ?? null;
    logCoverSource(display);
    return next;
  });
}
