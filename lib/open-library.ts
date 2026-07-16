import {
  cleanAuthors,
  cleanDescription,
  cleanTitle,
  isLowQualityBook,
  isAuthorQuery,
  parsePublishedYear,
} from "@/lib/book-utils";
import {
  GENRE_PAGE_SIZE,
  isGenreSearchMode,
  toOpenLibrarySubject,
  type SearchBooksOptions,
} from "@/lib/genre-search";
import type { BookDetail, BookSummary } from "@/types/book";

type OpenLibrarySearchDoc = {
  key?: string;
  title?: string;
  author_name?: string[];
  cover_i?: number;
  first_publish_year?: number;
  subject?: string[];
  first_sentence?: string[];
  isbn?: string[];
};

type OpenLibrarySearchResponse = {
  numFound?: number;
  docs?: OpenLibrarySearchDoc[];
};

const OPEN_LIBRARY_PAGE_SIZE = 20;

export type OpenLibraryPageResult = {
  books: BookSummary[];
  hasMore: boolean;
};

type OpenLibraryWork = {
  title?: string;
  description?: string | { value?: string };
  subjects?: string[];
  first_publish_date?: string;
  authors?: { author?: { key?: string } }[];
  covers?: number[];
};

type OpenLibraryAuthor = {
  name?: string;
};

const OPEN_LIBRARY_ID_PREFIX = "ol-";
const FETCH_TIMEOUT_MS = 8000;

async function fetchOpenLibrary(
  url: string,
  options?: { revalidate?: number; noStore?: boolean }
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(
      url,
      options?.noStore
        ? { cache: "no-store", signal: controller.signal }
        : { next: { revalidate: options?.revalidate ?? 3600 }, signal: controller.signal }
    );
  } finally {
    clearTimeout(timeout);
  }
}

function openLibraryCoverUrl(coverId?: number): string | null {
  if (!coverId) return null;
  return `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`;
}

function parseOpenLibraryDescription(
  description?: string | { value?: string },
  firstSentence?: string[]
): string | null {
  if (description) {
    if (typeof description === "string") {
      return cleanDescription(description);
    }
    return cleanDescription(description.value);
  }

  if (firstSentence?.[0]) {
    return cleanDescription(firstSentence[0]);
  }

  return null;
}

function workIdFromKey(key?: string): string | null {
  if (!key) return null;
  const match = key.match(/OL\d+W/);
  return match?.[0] ?? null;
}

export function isOpenLibraryId(id: string): boolean {
  return id.startsWith(OPEN_LIBRARY_ID_PREFIX);
}

export function toOpenLibraryId(workId: string): string {
  return `${OPEN_LIBRARY_ID_PREFIX}${workId}`;
}

export function parseOpenLibrarySearchResponse(
  data: OpenLibrarySearchResponse
): BookSummary[] {
  if (!data.docs) return [];

  return data.docs
    .map((doc): BookSummary | null => {
      const workId = workIdFromKey(doc.key);
      if (!workId || !doc.title) return null;

      return {
        id: toOpenLibraryId(workId),
        title: cleanTitle(doc.title),
        authors: cleanAuthors(doc.author_name ?? []),
        coverUrl: openLibraryCoverUrl(doc.cover_i),
        description: parseOpenLibraryDescription(undefined, doc.first_sentence),
        genres: [],
        publishedYear: parsePublishedYear(doc.first_publish_year),
        source: "openlibrary",
        isbn:
          doc.isbn?.find((value) => value.replace(/\D/g, "").length >= 10) ??
          null,
      };
    })
    .filter((book): book is BookSummary => book !== null)
    .filter((book) => !isLowQualityBook(book));
}

export async function searchOpenLibrary(
  query: string,
  page = 1,
  options?: SearchBooksOptions
): Promise<OpenLibraryPageResult> {
  try {
    const genreMode = isGenreSearchMode(options?.mode);
    const pageSize = genreMode ? GENRE_PAGE_SIZE : OPEN_LIBRARY_PAGE_SIZE;
    const authorSearch = !genreMode && isAuthorQuery(query);
    const params = new URLSearchParams({
      limit: String(pageSize),
      page: String(Math.max(1, page)),
      fields:
        "key,title,author_name,cover_i,first_publish_year,subject,first_sentence,isbn",
    });

    if (genreMode) {
      params.set("subject", toOpenLibrarySubject(query));
    } else if (authorSearch) {
      params.set("author", query.trim());
    } else {
      params.set("q", query);
    }

    const response = await fetchOpenLibrary(
      `https://openlibrary.org/search.json?${params.toString()}`,
      { noStore: true }
    );

    if (!response.ok) {
      return { books: [], hasMore: false };
    }

    const data: OpenLibrarySearchResponse = await response.json();
    const books = parseOpenLibrarySearchResponse(data);
    const numFound = data.numFound ?? 0;
    const hasMore = page * pageSize < numFound;

    return { books, hasMore };
  } catch {
    return { books: [], hasMore: false };
  }
}

async function fetchAuthorName(authorKey?: string): Promise<string | null> {
  if (!authorKey) return null;

  const authorId = authorKey.split("/").pop();
  if (!authorId) return null;

  const response = await fetchOpenLibrary(
    `https://openlibrary.org/authors/${authorId}.json`,
    { revalidate: 86400 }
  );

  if (!response.ok) return null;

  const data: OpenLibraryAuthor = await response.json();
  return data.name ?? null;
}

export async function getOpenLibraryBookById(
  id: string
): Promise<BookDetail | null> {
  const workId = id.startsWith(OPEN_LIBRARY_ID_PREFIX)
    ? id.slice(OPEN_LIBRARY_ID_PREFIX.length)
    : id;

  const response = await fetchOpenLibrary(
    `https://openlibrary.org/works/${workId}.json`,
    { revalidate: 3600 }
  );

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Open Library API error: ${response.status}`);
  }

  const data: OpenLibraryWork = await response.json();
  const authorNames = await Promise.all(
    (data.authors ?? []).map((entry) => fetchAuthorName(entry.author?.key))
  );

  return {
    id: toOpenLibraryId(workId),
    title: cleanTitle(data.title),
    authors: cleanAuthors(
      authorNames.filter((name): name is string => Boolean(name))
    ),
    description: parseOpenLibraryDescription(data.description),
    coverUrl: openLibraryCoverUrl(data.covers?.[0]),
    genres: [],
    publishedYear: parsePublishedYear(data.first_publish_date),
    source: "openlibrary",
    publisher: null,
    pageCount: null,
    language: null,
    isbn: null,
  };
}
