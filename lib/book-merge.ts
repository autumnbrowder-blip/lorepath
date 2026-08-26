import { finalizeBookTags } from "@/lib/book-tags";
import {
  getBookDedupeKey,
  hasRealDescription,
  isWeakDescription,
  pickEarliestYear,
  pickPublishedYear,
} from "@/lib/book-utils";
import type { BookSource, BookSummary } from "@/types/book";

/**
 * Identity preference for modern commercial catalogs.
 * Open Library is deliberately below Google / ISBNdb / Hardcover.
 */
const SOURCE_PRIORITY: Record<BookSource, number> = {
  hardcover: 7,
  isbndb: 6,
  google: 5,
  bigbook: 3,
  nyt: 2,
  openlibrary: 1,
  gutendex: 0,
};

function sourceRank(source: BookSource): number {
  return SOURCE_PRIORITY[source] ?? 0;
}

function isCommercialSource(source: BookSource): boolean {
  return (
    source === "google" ||
    source === "isbndb" ||
    source === "hardcover" ||
    source === "bigbook" ||
    source === "nyt"
  );
}

function isGoodTitle(title: string | null | undefined): boolean {
  return Boolean(title?.trim()) && !/^untitled\b/i.test(title!.trim());
}

function isGoodAuthors(authors: string[] | null | undefined): boolean {
  return Boolean(
    authors?.length && authors[0]?.toLowerCase() !== "unknown author"
  );
}

function descriptionScore(value: string | null | undefined): number {
  const text = value?.trim() ?? "";
  if (!text || isWeakDescription(text)) return 0;
  return Math.min(text.length, 4000);
}

function pickBestDescription(
  candidates: Array<{ source: BookSource; description: string | null | undefined }>
): string | null {
  const ranked = candidates
    .map((entry) => ({
      text: entry.description?.trim() ?? "",
      score:
        descriptionScore(entry.description) +
        (entry.source === "hardcover" ? 400 : 0) +
        (isCommercialSource(entry.source) ? 200 : 0),
    }))
    .filter((entry) => entry.text.length > 0)
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.text ?? null;
}

function pickBestCover(
  candidates: Array<{ source: BookSource; coverUrl: string | null | undefined }>
): string | null {
  const ranked = candidates
    .map((entry) => {
      const url = entry.coverUrl?.trim() ?? "";
      if (!url) return null;
      // Prefer https commercial CDN covers over bare OL placeholders when both exist.
      let score = isCommercialSource(entry.source) ? 10 : 1;
      if (entry.source === "hardcover") score += 12;
      if (/books\.google|googleapis|isbndb|hardcover|cloudfront/i.test(url)) {
        score += 5;
      }
      if (/openlibrary\.org\/b\/id\/-1|cover_unavailable/i.test(url)) {
        score -= 20;
      }
      return { url, score };
    })
    .filter((entry): entry is { url: string; score: number } => Boolean(entry))
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.url ?? null;
}

/**
 * When merging provider rows, keep the identity (id/source) of the preferred
 * duplicate and fill each metadata field from the strongest record — never keep
 * a weak OL blurb/cover when Google / ISBNdb / Hardcover supplied better data.
 */
function hardcoverRecord(
  identity: BookSummary,
  a: BookSummary,
  b: BookSummary
): BookSummary | null {
  return [identity, a, b].find((book) => book.source === "hardcover") ?? null;
}

export function mergePreferredBookFields(
  identity: BookSummary,
  a: BookSummary,
  b: BookSummary
): BookSummary {
  const hc = hardcoverRecord(identity, a, b);

  const titleCandidates = [identity.title, a.title, b.title].filter(isGoodTitle);
  const title =
    (hc && isGoodTitle(hc.title) ? hc.title : null) ??
    titleCandidates.sort((x, y) => x!.length - y!.length)[0] ??
    "Untitled";

  const authors =
    (hc && isGoodAuthors(hc.authors) ? hc.authors : null) ||
    (isGoodAuthors(identity.authors) ? identity.authors : null) ||
    (isGoodAuthors(a.authors) ? a.authors : null) ||
    (isGoodAuthors(b.authors) ? b.authors : null) || ["Unknown author"];

  const description =
    (hc && hasRealDescription(hc) ? hc.description : null) ??
    pickBestDescription([
      { source: identity.source, description: identity.description },
      { source: a.source, description: a.description },
      { source: b.source, description: b.description },
    ]);

  const coverUrl =
    (hc?.coverUrl?.trim() || null) ??
    pickBestCover([
      { source: identity.source, coverUrl: identity.coverUrl },
      { source: a.source, coverUrl: a.coverUrl },
      { source: b.source, coverUrl: b.coverUrl },
    ]);

  const publishedYear = pickPublishedYear(
    identity.publishedYear,
    a.publishedYear,
    b.publishedYear,
    identity.latestEditionYear,
    a.latestEditionYear,
    b.latestEditionYear
  );

  const firstPublishYear = pickEarliestYear(
    identity.firstPublishYear,
    a.firstPublishYear,
    b.firstPublishYear,
    identity.publishedYear,
    a.publishedYear,
    b.publishedYear
  );

  const latestEditionYear =
    publishedYear != null &&
    firstPublishYear != null &&
    publishedYear > firstPublishYear
      ? publishedYear
      : pickPublishedYear(
          identity.latestEditionYear,
          a.latestEditionYear,
          b.latestEditionYear
        );

  const pageCount =
    hc?.pageCount ?? identity.pageCount ?? a.pageCount ?? b.pageCount ?? null;

  const genreEvidence = [
    ...(hc?.genres.length
      ? [{ source: "hardcover" as const, categories: hc.genres }]
      : []),
    { source: identity.source, categories: identity.genres },
    { source: a.source, categories: a.genres },
    { source: b.source, categories: b.genres },
  ];

  // Prefer commercial ISBN when identity lacks one.
  const isbn =
    identity.isbn ??
    (isCommercialSource(a.source) ? a.isbn : null) ??
    (isCommercialSource(b.source) ? b.isbn : null) ??
    a.isbn ??
    b.isbn ??
    null;

  return {
    id: identity.id,
    source: identity.source,
    title,
    authors,
    coverUrl,
    description,
    publishedYear,
    firstPublishYear,
    latestEditionYear,
    pageCount,
    genres: finalizeBookTags({
      genreEvidence,
      title,
      description,
      publishedYear,
      source: identity.source,
    }),
    isbn,
    downloadCount:
      identity.downloadCount ?? a.downloadCount ?? b.downloadCount ?? null,
    language: identity.language ?? a.language ?? b.language ?? null,
    editionLabel:
      identity.editionLabel ?? a.editionLabel ?? b.editionLabel ?? null,
  };
}

/** Merge two book records, keeping the higher-priority source id and label. */
export function mergeBookPair(
  a: BookSummary,
  b: BookSummary
): BookSummary {
  // For modern works, never let a thin OL row claim identity over a commercial hit.
  const aYear = a.publishedYear ?? a.firstPublishYear;
  const bYear = b.publishedYear ?? b.firstPublishYear;
  const modern =
    (aYear != null && aYear >= 1980) ||
    (bYear != null && bYear >= 1980) ||
    aYear == null ||
    bYear == null;

  if (modern) {
    const aCommercial = isCommercialSource(a.source);
    const bCommercial = isCommercialSource(b.source);
    if (aCommercial !== bCommercial) {
      const commercial = aCommercial ? a : b;
      const other = aCommercial ? b : a;
      if (
        other.source === "openlibrary" &&
        (hasRealDescription(commercial) || commercial.coverUrl?.trim())
      ) {
        return mergePreferredBookFields(commercial, a, b);
      }
    }
  }

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
