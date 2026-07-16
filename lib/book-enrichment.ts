import {
  cleanAuthors,
  cleanDescription,
  cleanTitle,
  parsePublishedYear,
  pickPublishedYear,
} from "@/lib/book-utils";
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
    description: base.description ?? supplement.description ?? null,
    genres: base.genres,
    coverUrl: base.coverUrl ?? supplement.coverUrl ?? null,
    publishedYear: pickPublishedYear(base.publishedYear, supplement.publishedYear),
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

  const response = await fetch(
    `https://openlibrary.org/api/books?bibkeys=ISBN:${digits}&format=json&jscmd=data`,
    { next: { revalidate: 3600 } }
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

  const response = await fetch(
    `https://openlibrary.org/search.json?${params.toString()}`,
    { next: { revalidate: 3600 } }
  );

  if (!response.ok) return null;

  const data: { docs?: OpenLibrarySearchDoc[] } = await response.json();
  const doc = data.docs?.[0];
  if (!doc) return null;

  const isbn = doc.isbn?.find((value) => value.length >= 10) ?? null;

  return {
    title: cleanTitle(doc.title),
    authors: cleanAuthors(doc.author_name ?? authors),
    description: doc.first_sentence?.[0]
      ? cleanDescription(doc.first_sentence[0])
      : null,
    genres: [],
    publisher: doc.publisher?.[0] ?? null,
    publishedYear: parsePublishedYear(doc.first_publish_year),
    pageCount: doc.number_of_pages_median ?? null,
    language: doc.language?.[0]?.replace(/^\/languages\//, "") ?? null,
    isbn,
    coverUrl: coverFromId(doc.cover_i),
  };
}

export async function fetchOpenLibraryEditionForWork(
  workId: string
): Promise<Partial<BookDetail> | null> {
  const response = await fetch(
    `https://openlibrary.org/works/${workId}/editions.json?limit=5`,
    { next: { revalidate: 3600 } }
  );

  if (!response.ok) return null;

  const data: { entries?: OpenLibraryEdition[] } = await response.json();
  const edition = data.entries?.find(
    (entry) => entry.publishers?.[0] || entry.isbn_13?.[0] || entry.isbn_10?.[0]
  );

  if (!edition) return null;

  const isbn = edition.isbn_13?.[0] ?? edition.isbn_10?.[0] ?? null;

  return {
    publisher: edition.publishers?.[0] ?? null,
    publishedYear: parsePublishedYear(edition.publish_date),
    pageCount: edition.number_of_pages ?? null,
    language: edition.languages?.[0]?.key?.replace(/^\/languages\//, "") ?? null,
    isbn,
    coverUrl: coverFromId(edition.covers?.[0]),
  };
}

export async function enrichBookDetail(book: BookDetail): Promise<BookDetail> {
  if (!isSparseBookDetail(book)) return book;

  let enriched = { ...book };

  if (book.isbn) {
    const byIsbn = await fetchOpenLibraryByIsbn(book.isbn);
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

  if (book.isbn && isSparseBookDetail(enriched)) {
    const byIsbn = await fetchOpenLibraryByIsbn(book.isbn);
    if (byIsbn) enriched = mergeBookDetails(enriched, byIsbn);
  }

  return enriched;
}
