import {
  cleanAuthors,
  cleanDescription,
  cleanTitle,
  isWeakDescription,
  parsePublishedYear,
  pickEarliestYear,
  pickPublishedYear,
} from "@/lib/book-utils";
import { getGoogleBookByIsbn } from "@/lib/google-books";
import { findKnownWorkEditions } from "@/lib/known-editions";
import { fetchOpenLibrary } from "@/lib/open-library";
import type { BookDetail } from "@/types/book";

type OpenLibraryIsbnEntry = {
  title?: string;
  authors?: { name: string }[];
  publishers?: string[];
  publish_date?: string;
  number_of_pages?: number;
  subjects?: { name: string }[];
  excerpt?: string;
  cover?: { medium?: string; large?: string };
};

type OpenLibrarySearchDoc = {
  title?: string;
  author_name?: string[];
  subject?: string[];
  first_sentence?: string[];
  first_publish_year?: number;
  publisher?: string[];
  isbn?: string[];
  cover_i?: number;
  number_of_pages_median?: number;
  language?: string[];
};

type OpenLibraryEdition = {
  publishers?: string[];
  isbn_13?: string[];
  isbn_10?: string[];
  number_of_pages?: number;
  languages?: { key: string }[];
  covers?: number[];
  publish_date?: string;
};

export function isSparseBookDetail(book: BookDetail): boolean {
  const missingDescription = !book.description;
  const missingGenres = book.genres.length === 0;
  const missingPublisher = !book.publisher;
  const missingIsbn = !book.isbn;
  const missingYear = !book.publishedYear;

  return (
    missingDescription ||
    (missingGenres && missingPublisher && missingIsbn) ||
    (missingPublisher && missingIsbn && missingYear)
  );
}

function preferDescription(
  base: string | null | undefined,
  supplement: string | null | undefined
): string | null {
  const a = base?.trim() ?? "";
  const b = supplement?.trim() ?? "";
  if (!a) return b || null;
  if (!b) return a;
  const aWeak = isWeakDescription(a);
  const bWeak = isWeakDescription(b);
  if (aWeak && !bWeak) return b;
  if (!aWeak && bWeak) return a;
  return b.length > a.length ? b : a;
}

export function mergeBookDetails(
  base: BookDetail,
  supplement: Partial<BookDetail>
): BookDetail {
  return {
    ...base,
    title: base.title || supplement.title || "Untitled",
    authors:
      base.authors[0] !== "Unknown author"
        ? base.authors
        : supplement.authors ?? base.authors,
    description: preferDescription(base.description, supplement.description),
    genres:
      base.genres.length > 0
        ? base.genres
        : supplement.genres ?? base.genres,
    coverUrl: base.coverUrl?.trim() || supplement.coverUrl?.trim() || null,
    publishedYear: pickPublishedYear(
      base.publishedYear,
      supplement.publishedYear
    ),
    firstPublishYear: pickEarliestYear(
      base.firstPublishYear,
      supplement.firstPublishYear,
      base.publishedYear,
      supplement.publishedYear
    ),
    publisher: base.publisher ?? supplement.publisher ?? null,
    pageCount: base.pageCount ?? supplement.pageCount ?? null,
    language: base.language ?? supplement.language ?? null,
    isbn: base.isbn ?? supplement.isbn ?? null,
  };
}

function coverFromId(coverId?: number): string | null {
  if (!coverId) return null;
  return `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`;
}

function parseIsbnEntry(
  entry: OpenLibraryIsbnEntry,
  isbn: string
): Partial<BookDetail> {
  return {
    title: cleanTitle(entry.title),
    authors: cleanAuthors(entry.authors?.map((a) => a.name) ?? []),
    description: entry.excerpt ? cleanDescription(entry.excerpt) : null,
    genres: [],
    publisher: entry.publishers?.[0] ?? null,
    publishedYear: parsePublishedYear(entry.publish_date),
    pageCount: entry.number_of_pages ?? null,
    isbn,
    coverUrl: entry.cover?.medium ?? entry.cover?.large ?? null,
  };
}

export async function fetchOpenLibraryByIsbn(
  isbn: string
): Promise<Partial<BookDetail> | null> {
  const digits = isbn.replace(/\D/g, "");
  if (!digits) return null;

  const response = await fetchOpenLibrary(
    `https://openlibrary.org/api/books?bibkeys=ISBN:${digits}&format=json&jscmd=data`,
    { revalidate: 3600 }
  );

  if (!response.ok) return null;

  const data: Record<string, OpenLibraryIsbnEntry> = await response.json();
  const entry = data[`ISBN:${digits}`];
  if (!entry) return null;

  return parseIsbnEntry(entry, digits);
}

export async function fetchOpenLibraryByTitleAuthor(
  title: string,
  authors: string[]
): Promise<Partial<BookDetail> | null> {
  if (!title || authors.length === 0) return null;

  const params = new URLSearchParams({
    title,
    author: authors[0],
    limit: "1",
    fields:
      "title,author_name,subject,first_sentence,first_publish_year,publisher,isbn,cover_i,number_of_pages_median,language",
  });

  const response = await fetchOpenLibrary(
    `https://openlibrary.org/search.json?${params.toString()}`,
    { revalidate: 3600 }
  );

  if (!response.ok) return null;

  const data: { docs?: OpenLibrarySearchDoc[] } = await response.json();
  const doc = data.docs?.[0];
  if (!doc) return null;

  const isbn = doc.isbn?.find((value) => value.length >= 10) ?? null;
  const firstYear = parsePublishedYear(doc.first_publish_year);

  return {
    title: cleanTitle(doc.title),
    authors: cleanAuthors(doc.author_name ?? authors),
    description: doc.first_sentence?.[0]
      ? cleanDescription(doc.first_sentence[0])
      : null,
    genres: [],
    publisher: doc.publisher?.[0] ?? null,
    publishedYear: firstYear,
    firstPublishYear: firstYear,
    pageCount: doc.number_of_pages_median ?? null,
    language: doc.language?.[0]?.replace(/^\/languages\//, "") ?? null,
    isbn,
    coverUrl: coverFromId(doc.cover_i),
  };
}

/**
 * Scan work editions and prefer the newest publish_date (plus any publisher/ISBN).
 */
export async function fetchOpenLibraryEditionForWork(
  workId: string
): Promise<Partial<BookDetail> | null> {
  const response = await fetchOpenLibrary(
    `https://openlibrary.org/works/${workId}/editions.json?limit=40`,
    { revalidate: 3600 }
  );

  if (!response.ok) return null;

  const data: { entries?: OpenLibraryEdition[] } = await response.json();
  const entries = data.entries ?? [];
  if (entries.length === 0) return null;

  let best: OpenLibraryEdition | null = null;
  let bestYear: number | null = null;

  for (const entry of entries) {
    const year = parsePublishedYear(entry.publish_date);
    const hasMeta =
      Boolean(entry.publishers?.[0]) ||
      Boolean(entry.isbn_13?.[0] || entry.isbn_10?.[0]) ||
      Boolean(entry.covers?.[0]);
    if (!hasMeta && year == null) continue;
    if (
      best == null ||
      (year != null && (bestYear == null || year > bestYear))
    ) {
      best = entry;
      bestYear = year;
    }
  }

  if (!best) return null;

  const isbn = best.isbn_13?.[0] ?? best.isbn_10?.[0] ?? null;

  return {
    publisher: best.publishers?.[0] ?? null,
    publishedYear: parsePublishedYear(best.publish_date),
    pageCount: best.number_of_pages ?? null,
    language: best.languages?.[0]?.key?.replace(/^\/languages\//, "") ?? null,
    isbn,
    coverUrl: coverFromId(best.covers?.[0]),
  };
}

async function softGoogleIsbn(isbn: string): Promise<Partial<BookDetail> | null> {
  try {
    const detail = await getGoogleBookByIsbn(isbn);
    if (!detail) return null;
    return {
      title: detail.title,
      authors: detail.authors,
      description: detail.description,
      coverUrl: detail.coverUrl,
      publishedYear: detail.publishedYear,
      publisher: detail.publisher,
      pageCount: detail.pageCount,
      language: detail.language,
      isbn: detail.isbn ?? isbn,
      genres: detail.genres,
    };
  } catch {
    return null;
  }
}

/**
 * For known works (e.g. Between Two Fires), pull newer edition years/covers
 * from catalog ISBNs while keeping the same work id and original year.
 *
 * Catalog years are always applied so First published + Latest edition still
 * render when Google/OL ISBN lookups are rate-limited or incomplete.
 */
export async function enrichKnownEditionMetadata(
  book: BookDetail
): Promise<BookDetail> {
  const known = findKnownWorkEditions(book.title, book.authors);
  if (!known) return book;

  let enriched: BookDetail = {
    ...book,
    firstPublishYear: pickEarliestYear(
      book.firstPublishYear,
      known.firstPublishYear,
      book.publishedYear
    ),
    publishedYear: pickPublishedYear(
      book.publishedYear,
      known.latestEditionYear
    ),
  };

  const lookups = await Promise.all(
    known.isbns.map(async (isbn) => {
      const fromGoogle = await softGoogleIsbn(isbn);
      if (fromGoogle) return fromGoogle;
      return fetchOpenLibraryByIsbn(isbn);
    })
  );

  for (const hit of lookups) {
    if (!hit) continue;
    enriched = mergeBookDetails(enriched, hit);
    // Prefer richer reprint covers when the work cover is missing/empty.
    if (!enriched.coverUrl?.trim() && hit.coverUrl?.trim()) {
      enriched = { ...enriched, coverUrl: hit.coverUrl.trim() };
    } else if (
      hit.coverUrl?.trim() &&
      hit.publishedYear != null &&
      (enriched.publishedYear == null ||
        hit.publishedYear >= enriched.publishedYear)
    ) {
      // Newer edition cover often matches the currently popular reprint.
      enriched = { ...enriched, coverUrl: hit.coverUrl.trim() };
    }
  }

  // Re-assert catalog years after max/min merges from live rows.
  enriched = {
    ...enriched,
    firstPublishYear: pickEarliestYear(
      enriched.firstPublishYear,
      known.firstPublishYear
    ),
    publishedYear: pickPublishedYear(
      enriched.publishedYear,
      known.latestEditionYear
    ),
    id: book.id,
  };

  return enriched;
}

export async function enrichBookDetail(book: BookDetail): Promise<BookDetail> {
  let enriched = { ...book };

  // Known-edition year/cover pass runs even when the record looks "complete",
  // so reprints can surface a newer latest-edition year on detail pages.
  enriched = await enrichKnownEditionMetadata(enriched);

  if (!isSparseBookDetail(enriched)) return enriched;

  if (enriched.isbn) {
    const byIsbn = await fetchOpenLibraryByIsbn(enriched.isbn);
    if (byIsbn) enriched = mergeBookDetails(enriched, byIsbn);
  }

  if (book.source === "openlibrary" && isSparseBookDetail(enriched)) {
    const workId = book.id.replace(/^ol-/, "");
    const edition = await fetchOpenLibraryEditionForWork(workId);
    if (edition) enriched = mergeBookDetails(enriched, edition);
  }

  if (isSparseBookDetail(enriched)) {
    const byTitleAuthor = await fetchOpenLibraryByTitleAuthor(
      book.title,
      book.authors
    );
    if (byTitleAuthor) enriched = mergeBookDetails(enriched, byTitleAuthor);
  }

  if (enriched.isbn && isSparseBookDetail(enriched)) {
    const byIsbn = await fetchOpenLibraryByIsbn(enriched.isbn);
    if (byIsbn) enriched = mergeBookDetails(enriched, byIsbn);
  }

  // Re-assert known original year after other merges.
  enriched = await enrichKnownEditionMetadata(enriched);

  return { ...enriched, id: book.id };
}
