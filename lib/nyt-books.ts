import {
  cleanAuthors,
  cleanDescription,
  cleanTitle,
  parsePublishedYear,
} from "@/lib/book-utils";
import { finalizeBookTags } from "@/lib/book-tags";
import type { BookDetail, BookSummary } from "@/types/book";

const NYT_ID_PREFIX = "nyt-";
const FETCH_TIMEOUT_MS = 10000;

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
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, {
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

    const data: NytListResponse = await response.json();
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

/**
 * Fetch hardcover fiction + trade paperback fiction NYT lists,
 * merge, and dedupe by id (ISBN-based when available).
 */
export async function fetchNytBestsellers(): Promise<NytBestsellersResult> {
  if (!hasNytApiKey()) {
    return {
      books: [],
      error:
        "NYT Books API key is not configured. Add NYT_BOOKS_API_KEY to .env.local.",
    };
  }

  try {
    const results = await Promise.all(
      NYT_BESTSELLER_LISTS.map((list) => fetchNytList(list.url, list.label))
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
      return {
        books: [],
        error:
          "The bestsellers archive is resting for now. Try searching below for any tome.",
      };
    }

    return { books };
  } catch (error) {
    console.error("NYT bestsellers fetch failed:", error);
    return {
      books: [],
      error:
        "The bestsellers archive is resting for now. Try searching below for any tome.",
    };
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
  if (!isNytId(id)) return null;

  const { books } = await fetchNytBestsellers();
  const match = books.find((book) => book.id === id);
  if (!match) return null;

  return nytSummaryToDetail(match, isbnFromNytId(id));
}
