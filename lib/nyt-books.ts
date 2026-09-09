import {
  cleanAuthors,
  cleanDescription,
  cleanTitle,
  hasRealAuthor,
  isTitleOnlyStub,
  parsePublishedYear,
} from "@/lib/book-utils";
import { parseUtf8Json } from "@/lib/utf8-json";
import { finalizeBookTags } from "@/lib/book-tags";
import { mergePreferredBookFields } from "@/lib/book-merge";
import {
  getGoogleBookByIsbn,
  searchGoogleBooks,
} from "@/lib/google-books";
import { PAGE_FETCH_TIMEOUT_MS, withTimeout } from "@/lib/provider-resilience";
import type { BookDetail, BookSummary } from "@/types/book";

const NYT_ID_PREFIX = "nyt-";
const NYT_CACHE_TTL_MS = 60 * 60 * 1000;
const NYT_ENRICH_TIMEOUT_MS = 2000;

let nytBestsellersCache: {
  expiresAt: number;
  value: NytBestsellersResult;
} | null = null;

export const NYT_BESTSELLER_LISTS = [
  {
    slug: "hardcover-fiction",
    label: "Hardcover Fiction",
    url: "https://api.nytimes.com/svc/books/v3/lists/current/hardcover-fiction.json",
  },
  {
    slug: "trade-fiction-paperback",
    label: "Trade Fiction Paperback",
    url: "https://api.nytimes.com/svc/books/v3/lists/current/trade-fiction-paperback.json",
  },
] as const;

type NytListBook = {
  title?: string;
  author?: string;
  description?: string;
  book_image?: string;
  primary_isbn13?: string;
  primary_isbn10?: string;
  created_date?: string;
};

type NytListResponse = {
  status?: string;
  results?: {
    bestsellers_date?: string;
    published_date?: string;
    books?: NytListBook[];
  };
  fault?: { faultstring?: string };
};

export type NytBestsellersResult = {
  books: BookSummary[];
  error?: string;
};

function hasNytApiKey(): boolean {
  return Boolean(process.env.NYT_BOOKS_API_KEY?.trim());
}

export function isNytId(id: string): boolean {
  return id.startsWith(NYT_ID_PREFIX);
}

export function toNytId(isbnOrKey: string): string {
  return `${NYT_ID_PREFIX}${isbnOrKey.replace(/\s+/g, "-").toLowerCase()}`;
}

export function isbnFromNytId(id: string): string | null {
  if (!isNytId(id)) return null;
  const digits = id.slice(NYT_ID_PREFIX.length).replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 13) return digits;
  return null;
}

async function fetchNyt(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PAGE_FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, {
      cache: "force-cache",
      next: { revalidate: 3600 },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function parseNytAuthors(author?: string): string[] {
  if (!author?.trim()) return ["Unknown author"];
  return cleanAuthors(
    author
      .split(/\s+and\s+/i)
      .flatMap((part) => part.split(","))
      .map((part) => part.trim())
      .filter(Boolean)
  );
}

function bookKey(book: NytListBook): string {
  const isbn =
    book.primary_isbn13?.replace(/\D/g, "") ||
    book.primary_isbn10?.replace(/\D/g, "");
  if (isbn) return isbn;
  const title = (book.title ?? "untitled").toLowerCase().replace(/\s+/g, "-");
  const author = (book.author ?? "unknown").toLowerCase().replace(/\s+/g, "-");
  return `${title}--${author}`.slice(0, 80);
}

export function parseNytListBook(
  book: NytListBook,
  listLabel: string,
  listPublishedDate?: string
): BookSummary | null {
  if (!book.title?.trim()) return null;

  const title = cleanTitle(book.title);
  const description = cleanDescription(book.description) ?? null;
  const cover = book.book_image?.trim()
    ? book.book_image.trim().replace("http://", "https://")
    : null;

  return {
    id: toNytId(bookKey(book)),
    title,
    authors: parseNytAuthors(book.author),
    coverUrl: cover,
    description,
    genres: finalizeBookTags({
      genreEvidence: [
        {
          source: "google",
          categories: /nonfiction|non-fiction/i.test(listLabel)
            ? ["Nonfiction"]
            : ["General Fiction"],
        },
      ],
      title,
      description,
      maxTags: 1,
    }),
    publishedYear: parsePublishedYear(listPublishedDate ?? book.created_date),
    source: "nyt",
  };
}

async function fetchNytList(
  listUrl: string,
  listLabel: string
): Promise<BookSummary[]> {
  if (!hasNytApiKey()) return [];

  try {
    const url = new URL(listUrl);
    url.searchParams.set("api-key", process.env.NYT_BOOKS_API_KEY!.trim());

    const response = await fetchNyt(url.toString());
    if (!response.ok) {
      console.error(`NYT Books API error (${listLabel}): ${response.status}`);
      return [];
    }

    const data: NytListResponse = await parseUtf8Json(response);
    if (data.fault?.faultstring) {
      console.error(`NYT Books API fault (${listLabel}):`, data.fault.faultstring);
      return [];
    }

    const books = data.results?.books;
    if (!books?.length) return [];

    const published =
      data.results?.published_date ?? data.results?.bestsellers_date;

    return books
      .map((book) => parseNytListBook(book, listLabel, published))
      .filter((book): book is BookSummary => book !== null);
  } catch (error) {
    console.error(`NYT Books API unavailable (${listLabel}):`, error);
    return [];
  }
}

function nytNeedsEnrichment(book: BookSummary): boolean {
  return !hasRealAuthor(book) || !book.coverUrl?.trim();
}

function googleSummaryFromDetail(
  detail: Awaited<ReturnType<typeof getGoogleBookByIsbn>>
): BookSummary | null {
  if (!detail) return null;
  return {
    id: detail.id,
    title: detail.title,
    authors: detail.authors,
    coverUrl: detail.coverUrl,
    description: detail.description,
    genres: detail.genres,
    publishedYear: detail.publishedYear,
    firstPublishYear: detail.firstPublishYear ?? null,
    source: detail.source,
    isbn: detail.isbn,
    pageCount: detail.pageCount,
  };
}

async function googleMatchForNyt(
  book: BookSummary
): Promise<BookSummary | null> {
  const isbn = isbnFromNytId(book.id);
  if (isbn) {
    try {
      const byIsbn = await withTimeout(
        getGoogleBookByIsbn(isbn),
        NYT_ENRICH_TIMEOUT_MS,
        "nyt-google-isbn"
      );
      const summary = googleSummaryFromDetail(byIsbn);
      if (summary && (hasRealAuthor(summary) || summary.coverUrl?.trim())) {
        return summary;
      }
    } catch {
      // Soft-fail — title search still runs.
    }
  }

  const title = book.title.replace(/"/g, "").trim();
  if (!title) return null;
  const author = hasRealAuthor(book)
    ? book.authors.find(
        (name) => name.trim() && name.toLowerCase() !== "unknown author"
      )
    : null;
  const query = author
    ? `intitle:"${title}" inauthor:"${author.replace(/"/g, "")}"`
    : `intitle:"${title}"`;

  try {
    const page = await withTimeout(
      searchGoogleBooks(query, 1),
      NYT_ENRICH_TIMEOUT_MS,
      "nyt-google-title"
    );
    const match =
      page.books.find(
        (candidate) =>
          candidate.title.trim().toLowerCase() === title.toLowerCase() &&
          (hasRealAuthor(candidate) || candidate.coverUrl?.trim())
      ) ??
      page.books.find(
        (candidate) => hasRealAuthor(candidate) || candidate.coverUrl?.trim()
      );
    return match ?? null;
  } catch {
    return null;
  }
}

async function enrichOneNytBook(book: BookSummary): Promise<BookSummary> {
  if (!nytNeedsEnrichment(book)) return book;
  const google = await googleMatchForNyt(book);
  if (!google) return book;
  return {
    ...mergePreferredBookFields(book, book, google),
    id: book.id,
    source: book.source,
  };
}

async function enrichNytBestsellers(
  books: BookSummary[]
): Promise<BookSummary[]> {
  const indexes = books
    .map((book, index) => ({ book, index }))
    .filter(({ book }) => nytNeedsEnrichment(book));
  if (indexes.length === 0) {
    return books.filter((book) => !isTitleOnlyStub(book));
  }

  const settled = await Promise.allSettled(
    indexes.map(({ book }) => enrichOneNytBook(book))
  );
  const next = [...books];
  indexes.forEach((item, i) => {
    const result = settled[i];
    if (result?.status === "fulfilled") {
      next[item.index] = result.value;
    }
  });
  return next.filter((book) => !isTitleOnlyStub(book));
}

/**
 * Fetch hardcover fiction + trade paperback fiction NYT lists,
 * merge, and dedupe by id (ISBN-based when available).
 */
export async function fetchNytBestsellers(): Promise<NytBestsellersResult> {
  if (!hasNytApiKey()) {
    // Optional source — Browse/search still work; bestsellers section stays hidden.
    console.warn(
      "NYT Books API key is not configured. Set NYT_BOOKS_API_KEY in .env.local (local) or your host’s env vars (e.g. Netlify). Get a free key at https://developer.nytimes.com/"
    );
    return { books: [] };
  }

  const now = Date.now();
  if (nytBestsellersCache && nytBestsellersCache.expiresAt > now) {
    return nytBestsellersCache.value;
  }

  try {
    const results = await withTimeout(
      Promise.all(
        NYT_BESTSELLER_LISTS.map((list) => fetchNytList(list.url, list.label))
      ),
      Math.max(1000, PAGE_FETCH_TIMEOUT_MS - NYT_ENRICH_TIMEOUT_MS),
      "nyt-bestsellers"
    );

    const seen = new Set<string>();
    const books: BookSummary[] = [];

    for (const listBooks of results) {
      for (const book of listBooks) {
        if (seen.has(book.id)) continue;
        seen.add(book.id);
        books.push(book);
      }
    }

    if (books.length === 0) {
      const empty: NytBestsellersResult = {
        books: [],
        error:
          "The bestsellers archive is resting for now. Try searching below for any tome.",
      };
      nytBestsellersCache = {
        expiresAt: now + NYT_CACHE_TTL_MS,
        value: empty,
      };
      return empty;
    }

    const enriched = await enrichNytBestsellers(books);
    const value: NytBestsellersResult = { books: enriched };
    nytBestsellersCache = {
      expiresAt: now + NYT_CACHE_TTL_MS,
      value,
    };
    return value;
  } catch (error) {
    console.error("NYT bestsellers fetch failed:", error);
    const failed: NytBestsellersResult = {
      books: [],
      error:
        "The bestsellers archive is resting for now. Try searching below for any tome.",
    };
    nytBestsellersCache = {
      expiresAt: now + NYT_CACHE_TTL_MS,
      value: failed,
    };
    return failed;
  }
}

export function nytSummaryToDetail(
  book: BookSummary,
  isbn?: string | null
): BookDetail {
  return {
    ...book,
    publisher: null,
    pageCount: null,
    language: "en",
    isbn: isbn ?? isbnFromNytId(book.id),
  };
}

/** Resolve a NYT book id from current list metadata (detail-page fallback). */
export async function getNytBookById(id: string): Promise<BookDetail | null> {
  try {
    if (!isNytId(id)) return null;

    const { books } = await fetchNytBestsellers();
    const match = books.find((book) => book.id === id);
    if (!match) return null;

    return nytSummaryToDetail(match, isbnFromNytId(id));
  } catch (error) {
    console.error(
      "[book-detail]",
      id,
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}
