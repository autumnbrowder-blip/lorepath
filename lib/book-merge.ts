import { finalizeBookTags } from "@/lib/book-tags";
import { getBookDedupeKey, pickPublishedYear } from "@/lib/book-utils";
import type { BookSource, BookSummary } from "@/types/book";

const SOURCE_PRIORITY: Record<BookSource, number> = {
  hardcover: 5,
  isbndb: 4,
  google: 3,
  openlibrary: 2,
  nyt: 2,
  gutendex: 1,
};

function sourceRank(source: BookSource): number {
  return SOURCE_PRIORITY[source];
}

function isGoodTitle(title: string | null | undefined): boolean {
  return Boolean(title?.trim()) && !/^untitled\b/i.test(title!.trim());
}

function isGoodAuthors(authors: string[] | null | undefined): boolean {
  return Boolean(
    authors?.length && authors[0]?.toLowerCase() !== "unknown author"
  );
}

function pickHardcoverBook(
  a: BookSummary,
  b: BookSummary
): BookSummary | null {
  if (a.source === "hardcover") return a;
  if (b.source === "hardcover") return b;
  return null;
}

/**
 * When merging provider rows, prefer Hardcover for title, description, cover,
 * published year, page count, and authors whenever those fields are present.
 * Identity (id/source) stays on the preferred duplicate; metadata still takes Hardcover.
 */
export function mergeFieldsPreferringHardcover(
  identity: BookSummary,
  a: BookSummary,
  b: BookSummary
): BookSummary {
  const hardcover = pickHardcoverBook(a, b);

  const title =
    (hardcover && isGoodTitle(hardcover.title) ? hardcover.title : null) ||
    (isGoodTitle(identity.title) ? identity.title : null) ||
    (isGoodTitle(a.title) ? a.title : null) ||
    (isGoodTitle(b.title) ? b.title : null) ||
    "Untitled";

  const authors =
    (hardcover && isGoodAuthors(hardcover.authors)
      ? hardcover.authors
      : null) ||
    (isGoodAuthors(identity.authors) ? identity.authors : null) ||
    (isGoodAuthors(a.authors) ? a.authors : null) ||
    (isGoodAuthors(b.authors) ? b.authors : null) ||
    ["Unknown author"];

  const description =
    hardcover?.description?.trim() ||
    identity.description?.trim() ||
    a.description?.trim() ||
    b.description?.trim() ||
    null;

  const coverUrl =
    hardcover?.coverUrl?.trim() ||
    identity.coverUrl?.trim() ||
    a.coverUrl?.trim() ||
    b.coverUrl?.trim() ||
    null;

  const publishedYear =
    hardcover?.publishedYear ??
    identity.publishedYear ??
    pickPublishedYear(a.publishedYear, b.publishedYear);

  const pageCount =
    hardcover?.pageCount ??
    identity.pageCount ??
    a.pageCount ??
    b.pageCount ??
    null;

  // Hardcover categories first so tag finalizer can prefer them exclusively.
  const genreEvidence = [
    ...(hardcover
      ? [{ source: hardcover.source, categories: hardcover.genres }]
      : []),
    { source: a.source, categories: a.genres },
    { source: b.source, categories: b.genres },
  ];

  return {
    // Prefer Hardcover id/source when present so detail pages stay on HC.
    id: hardcover?.id ?? identity.id,
    source: hardcover?.source ?? identity.source,
    title,
    authors,
    coverUrl,
    description,
    publishedYear,
    pageCount,
    genres: finalizeBookTags({
      genreEvidence,
      title,
      description,
      publishedYear,
      source: hardcover?.source ?? identity.source,
    }),
    isbn: hardcover?.isbn ?? identity.isbn ?? a.isbn ?? b.isbn ?? null,
    downloadCount:
      identity.downloadCount ?? a.downloadCount ?? b.downloadCount ?? null,
  };
}

/** Merge two book records, keeping the higher-priority source id and label. */
export function mergeBookPair(
  a: BookSummary,
  b: BookSummary
): BookSummary {
  const primary =
    sourceRank(a.source) >= sourceRank(b.source) ? a : b;

  return mergeFieldsPreferringHardcover(primary, a, b);
}

function mergeIntoMap(
  map: Map<string, BookSummary>,
  book: BookSummary
): void {
  const key = getBookDedupeKey(book);
  const existing = map.get(key);

  if (existing) {
    map.set(key, mergeBookPair(existing, book));
  } else {
    map.set(key, book);
  }
}

/**
 * Merge results from Google, Open Library, and Gutendex.
 * Field priority on overlaps: Hardcover > other sources for core metadata.
 */
export function mergeMultiSourceResults(
  googleBooks: BookSummary[],
  openLibraryBooks: BookSummary[],
  gutendexBooks: BookSummary[]
): BookSummary[] {
  const merged = new Map<string, BookSummary>();

  for (const book of googleBooks) mergeIntoMap(merged, book);
  for (const book of openLibraryBooks) mergeIntoMap(merged, book);
  for (const book of gutendexBooks) mergeIntoMap(merged, book);

  return Array.from(merged.values());
}

/** @deprecated Use mergeMultiSourceResults */
export function mergeBookResults(
  googleBooks: BookSummary[],
  openLibraryBooks: BookSummary[]
): BookSummary[] {
  return mergeMultiSourceResults(googleBooks, openLibraryBooks, []);
}
