import {
  cleanAuthors,
  cleanDescription,
  cleanTitle,
  keepProviderSubjects,
  parsePublishedYear,
} from "@/lib/book-utils";
import { finalizeBookTags } from "@/lib/book-tags";
import {
  GENRE_PAGE_SIZE,
  isGenreSearchMode,
  type SearchBooksOptions,
} from "@/lib/genre-search";
import type { BookDetail, BookSummary } from "@/types/book";

const ISBNDB_BASE = "https://api2.isbndb.com";
const FETCH_TIMEOUT_MS = 10000;

type IsbndbBook = {
  title?: string;
  title_long?: string;
  isbn?: string;
  isbn13?: string;
  isbn10?: string;
  authors?: string[] | string;
  publisher?: string;
  language?: string;
  date_published?: string;
  pages?: number | string;
  overview?: string;
  synopsis?: string;
  excerpt?: string;
  image?: string;
  image_original?: string;
  subjects?: string[];
};

type IsbndbBookResponse = {
  book?: IsbndbBook;
  message?: string;
};

type IsbndbSearchResponse = {
  total?: number;
  books?: IsbndbBook[];
  message?: string;
};

function hasIsbndbApiKey(): boolean {
  return Boolean(process.env.ISBNDB_API_KEY?.trim());
}

function getIsbndbApiKey(): string | null {
  const key = process.env.ISBNDB_API_KEY?.trim();
  return key || null;
}

async function fetchIsbndb(path: string): Promise<Response | null> {
  const apiKey = getIsbndbApiKey();
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(`${ISBNDB_BASE}${path}`, {
      headers: {
        Accept: "application/json",
        Authorization: apiKey,
      },
      next: { revalidate: 3600 },
      signal: controller.signal,
    });
  } catch (error) {
    console.error("[isbndb] request failed:", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeCoverUrl(url?: string | null): string | null {
  if (!url?.trim()) return null;
  return url.trim().replace("http://", "https://");
}

function normalizeAuthors(authors?: string[] | string): string[] {
  if (!authors) return ["Unknown author"];
  if (typeof authors === "string") {
    return cleanAuthors(
      authors
        .split(/\s+and\s+|,|;/i)
        .map((part) => part.trim())
        .filter(Boolean)
    );
  }
  return cleanAuthors(authors);
}

function pickDescription(book: IsbndbBook): string | null {
  return (
    cleanDescription(book.synopsis) ??
    cleanDescription(book.overview) ??
    cleanDescription(book.excerpt) ??
    null
  );
}

function pickPageCount(pages?: number | string): number | null {
  if (typeof pages === "number" && Number.isFinite(pages) && pages > 0) {
    return Math.round(pages);
  }
  if (typeof pages === "string") {
    const parsed = Number.parseInt(pages.replace(/\D/g, ""), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

const ISBNDB_ID_PREFIX = "isbndb-";
const ISBNDB_PAGE_SIZE = 20;

export function isIsbndbId(id: string): boolean {
  return id.startsWith(ISBNDB_ID_PREFIX);
}

export function isbnFromIsbndbId(id: string): string | null {
  if (!isIsbndbId(id)) return null;
  const digits = id.slice(ISBNDB_ID_PREFIX.length).replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 13) return digits;
  return null;
}

/** Normalize an ISBNdb book payload into LorePath book fields. */
export function normalizeIsbndbBook(
  book: IsbndbBook,
  options?: { id?: string; source?: BookSummary["source"] }
): BookDetail | null {
  // Prefer the catalog `title` over `title_long` — the long form often
  // appends "From the #1 Sunday Times…" marketing that is not the book title.
  const title = cleanTitle(book.title) || cleanTitle(book.title_long);
  if (!title || title === "Untitled") return null;

  const isbn =
    book.isbn13?.replace(/\D/g, "") ||
    book.isbn?.replace(/\D/g, "") ||
    book.isbn10?.replace(/\D/g, "") ||
    null;

  const safeSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

  return {
    id: options?.id ?? (isbn ? `${ISBNDB_ID_PREFIX}${isbn}` : `${ISBNDB_ID_PREFIX}${safeSlug}`),
    title,
    authors: normalizeAuthors(book.authors),
    coverUrl: normalizeCoverUrl(book.image) ?? normalizeCoverUrl(book.image_original),
    description: pickDescription(book),
    genres: keepProviderSubjects(book.subjects ?? []),
    publishedYear: parsePublishedYear(book.date_published),
    source: options?.source ?? "isbndb",
    publisher: book.publisher?.trim() || null,
    pageCount: pickPageCount(book.pages),
    language: book.language?.trim() || null,
    isbn,
  };
}

function toBookSummary(detail: BookDetail): BookSummary {
  return {
    id: detail.id,
    title: detail.title,
    authors: detail.authors,
    coverUrl: detail.coverUrl,
    description: detail.description,
    genres: detail.genres,
    publishedYear: detail.publishedYear,
    source: detail.source,
    isbn: detail.isbn,
    pageCount: detail.pageCount,
  };
}

export type IsbndbPageResult = {
  books: BookSummary[];
  hasMore: boolean;
};

/**
 * Search ISBNdb by title/author keywords (paginated).
 * Returns empty page when the key is missing or the request fails.
 */
export async function searchIsbndb(
  query: string,
  page = 1,
  options?: SearchBooksOptions
): Promise<IsbndbPageResult> {
  const trimmed = query.trim().slice(0, 150);
  if (!trimmed || !hasIsbndbApiKey()) {
    return { books: [], hasMore: false };
  }

  const pageNumber = Math.max(1, page);
  const genreMode = isGenreSearchMode(options?.mode);
  const pageSize = genreMode ? GENRE_PAGE_SIZE : ISBNDB_PAGE_SIZE;

  try {
    const params = new URLSearchParams({
      page: String(pageNumber),
      pageSize: String(pageSize),
    });

    if (genreMode) {
      params.set("column", "subjects");
    }

    const response = await fetchIsbndb(
      `/books/${encodeURIComponent(trimmed)}?${params.toString()}`
    );

    if (!response) {
      console.error("[searchIsbndb] Request returned no response.", {
        query: trimmed,
        page: pageNumber,
        mode: options?.mode ?? "text",
      });
      return { books: [], hasMore: false };
    }

    if (response.status === 429) {
      console.error("[searchIsbndb] Rate limited (429). Returning empty page.", {
        query: trimmed,
        page: pageNumber,
        mode: options?.mode ?? "text",
      });
      return { books: [], hasMore: false };
    }

    if (!response.ok) {
      console.error("[searchIsbndb] API error — not silently ignored.", {
        status: response.status,
        query: trimmed,
        page: pageNumber,
        mode: options?.mode ?? "text",
      });
      return { books: [], hasMore: false };
    }

    const data: IsbndbSearchResponse = await response.json();
    const rawBooks = data.books ?? [];
    const books = rawBooks
      .map((book) => {
        const detail = normalizeIsbndbBook(book);
        return detail ? toBookSummary(detail) : null;
      })
      .filter((book): book is BookSummary => book !== null);

    const total = typeof data.total === "number" ? data.total : null;
    const hasMore =
      total != null
        ? pageNumber * pageSize < total
        : rawBooks.length >= pageSize;

    return { books, hasMore };
  } catch (error) {
    console.error("[searchIsbndb] request failed:", error);
    return { books: [], hasMore: false };
  }
}

/**
 * Look up a single book by ISBN (ISBN-10 or ISBN-13 digits).
 */
export async function fetchIsbndbByIsbn(
  isbn: string
): Promise<BookDetail | null> {
  if (!hasIsbndbApiKey()) return null;

  const digits = isbn.replace(/\D/g, "");
  if (digits.length !== 10 && digits.length !== 13) return null;

  try {
    const response = await fetchIsbndb(`/book/${encodeURIComponent(digits)}`);
    if (!response || !response.ok) {
      if (response && response.status !== 404) {
        console.error(`[isbndb] ISBN lookup failed: ${response.status}`);
      }
      return null;
    }

    const data: IsbndbBookResponse = await response.json();
    if (!data.book) return null;

    return normalizeIsbndbBook(data.book);
  } catch (error) {
    console.error("[isbndb] ISBN lookup error:", error);
    return null;
  }
}

/**
 * Search ISBNdb by title (optionally narrowed with author) and return the best match.
 */
export async function fetchIsbndbByTitle(
  title: string,
  authors: string[] = []
): Promise<Partial<BookDetail> | null> {
  if (!hasIsbndbApiKey()) return null;

  const trimmed = title.trim();
  if (!trimmed) return null;

  try {
    const query = encodeURIComponent(trimmed);
    const params = new URLSearchParams({
      page: "1",
      pageSize: "5",
      column: "title",
    });

    const response = await fetchIsbndb(`/books/${query}?${params.toString()}`);
    if (!response || !response.ok) {
      if (response && response.status !== 404) {
        console.error(`[isbndb] title search failed: ${response.status}`);
      }
      return null;
    }

    const data: IsbndbSearchResponse = await response.json();
    const books = data.books ?? [];
    if (books.length === 0) return null;

    const authorNeedle = (authors[0] ?? "").toLowerCase().trim();
    const match =
      (authorNeedle
        ? books.find((book) =>
            normalizeAuthors(book.authors).some((name) =>
              name.toLowerCase().includes(authorNeedle)
            )
          )
        : null) ?? books[0];

    return normalizeIsbndbBook(match);
  } catch (error) {
    console.error("[isbndb] title search error:", error);
    return null;
  }
}

/**
 * Prefer ISBNdb values for description, cover, published year, and page count
 * when present. Other fields only fill gaps.
 */
export function preferIsbndbDetailFields(
  base: BookDetail,
  isbndb: Partial<BookDetail>
): BookDetail {
  const description = isbndb.description?.trim()
    ? isbndb.description
    : base.description;
  const publishedYear =
    typeof isbndb.publishedYear === "number"
      ? isbndb.publishedYear
      : base.publishedYear;

  return {
    ...base,
    description,
    coverUrl: isbndb.coverUrl?.trim() ? isbndb.coverUrl : base.coverUrl,
    publishedYear,
    pageCount:
      typeof isbndb.pageCount === "number" ? isbndb.pageCount : base.pageCount,
    publisher: base.publisher ?? isbndb.publisher ?? null,
    language: base.language ?? isbndb.language ?? null,
    isbn: base.isbn ?? isbndb.isbn ?? null,
    genres: finalizeBookTags({
      genreEvidence: [
        { source: base.source, categories: base.genres },
        { source: "isbndb", categories: isbndb.genres ?? [] },
      ],
      title: base.title,
      description,
      publishedYear,
      source: base.source,
    }),
  };
}

/**
 * Detail-page enrichment only. Never throws — returns the original book on failure.
 */
export async function enrichBookDetailWithIsbndb(
  book: BookDetail
): Promise<BookDetail> {
  if (!hasIsbndbApiKey()) return book;

  try {
    let isbndb: Partial<BookDetail> | null = null;

    if (book.isbn) {
      isbndb = await fetchIsbndbByIsbn(book.isbn);
    }

    if (!isbndb) {
      isbndb = await fetchIsbndbByTitle(book.title, book.authors);
    }

    if (!isbndb) return book;

    return preferIsbndbDetailFields(book, isbndb);
  } catch (error) {
    console.error("[isbndb] enrichment failed:", error);
    return book;
  }
}
