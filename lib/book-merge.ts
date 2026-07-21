import { finalizeBookTags } from "@/lib/book-tags";
import { getBookDedupeKey, pickPublishedYear } from "@/lib/book-utils";
import type { BookSource, BookSummary } from "@/types/book";

const SOURCE_PRIORITY: Record<BookSource, number> = {
  isbndb: 5,
  google: 4,
  bigbook: 3,
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

/**
 * When merging provider rows, keep the identity (id/source) of the preferred
 * duplicate and fill each metadata field from whichever record has it:
 * identity first, then the longer/better values from the other rows.
 */
export function mergePreferredBookFields(
  identity: BookSummary,
  a: BookSummary,
  b: BookSummary
): BookSummary {
  const title =
    (isGoodTitle(identity.title) ? identity.title : null) ||
    (isGoodTitle(a.title) ? a.title : null) ||
    (isGoodTitle(b.title) ? b.title : null) ||
    "Untitled";

  const authors =
    (isGoodAuthors(identity.authors) ? identity.authors : null) ||
    (isGoodAuthors(a.authors) ? a.authors : null) ||
    (isGoodAuthors(b.authors) ? b.authors : null) || ["Unknown author"];

  // Prefer the longest description — providers often ship truncated blurbs.
  const descriptions = [identity.description, a.description, b.description]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean);
  const description =
    descriptions.sort((x, y) => y.length - x.length)[0] ?? null;

  const coverUrl =
    identity.coverUrl?.trim() ||
    a.coverUrl?.trim() ||
    b.coverUrl?.trim() ||
    null;

  const publishedYear =
    identity.publishedYear ??
    pickPublishedYear(a.publishedYear, b.publishedYear);

  const pageCount =
    identity.pageCount ?? a.pageCount ?? b.pageCount ?? null;

  const genreEvidence = [
    { source: identity.source, categories: identity.genres },
    { source: a.source, categories: a.genres },
    { source: b.source, categories: b.genres },
  ];

  return {
    id: identity.id,
    source: identity.source,
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
      source: identity.source,
    }),
    isbn: identity.isbn ?? a.isbn ?? b.isbn ?? null,
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

  return mergePreferredBookFields(primary, a, b);
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
 * On overlaps, each field keeps the best available value across sources.
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
