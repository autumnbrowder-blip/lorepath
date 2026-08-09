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
  language?: string[];
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
const FETCH_TIMEOUT_MS = 3000;
/** Required by Open Library usage policy — set on every API request. */
export const OPEN_LIBRARY_USER_AGENT = "LorePath (support@lorepath.net)";

export async function fetchOpenLibrary(
  url: string,
  options?: { revalidate?: number; noStore?: boolean; timeoutMs?: number }
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options?.timeoutMs ?? FETCH_TIMEOUT_MS
  );
  const headers = { "User-Agent": OPEN_LIBRARY_USER_AGENT };

  try {
    return await fetch(
      url,
      options?.noStore
        ? { cache: "no-store", signal: controller.signal, headers }
        : {
            next: { revalidate: options?.revalidate ?? 3600 },
            signal: controller.signal,
            headers,
          }
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
  // Prefix must be exactly "ol-" (lowercase). Do not treat Google volume ids
  // like "E-OLEAAAQBAJ" as Open Library — they go through Google lookup.
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
        // OL search exposes first_publish_year — treat as original work year.
        firstPublishYear: parsePublishedYear(doc.first_publish_year),
        source: "openlibrary",
        isbn:
          doc.isbn?.find((value) => value.replace(/\D/g, "").length >= 10) ??
          null,
        language: doc.language?.[0]?.replace(/^\/languages\//, "") ?? null,
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
        "key,title,author_name,cover_i,first_publish_year,subject,first_sentence,isbn,language",
    });

    if (genreMode) {
      params.set("subject", toOpenLibrarySubject(query));
    } else if (authorSearch) {
      params.set("author", query.trim());
    } else {
      params.set("q", query);
    }

    /**
     * Open Library is the backbone of browse: a single slow response used to
     * empty the whole result set, so transient failures get one longer retry.
     * A successful empty response is a real answer and is not retried.
     */
    const runSearch = async (search: URLSearchParams) => {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const response = await fetchOpenLibrary(
            `https://openlibrary.org/search.json?${search.toString()}`,
            {
              noStore: true,
              timeoutMs: 3000,
            }
          );

          if (response.ok) {
            const data: OpenLibrarySearchResponse = await response.json();
            return {
              books: parseOpenLibrarySearchResponse(data),
              hasMore: page * pageSize < (data.numFound ?? 0),
            };
          }

          console.error("[open-library] search failed:", {
            query,
            status: response.status,
            attempt,
          });
          // Only 429/5xx are worth another try.
          if (response.status !== 429 && response.status < 500) return null;
        } catch (error) {
          console.error("[open-library] search error:", {
            query,
            attempt,
            message: error instanceof Error ? error.message : String(error),
          });
        }

        if (attempt === 1) {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }
      return null;
    };

    const result = await runSearch(params);
    if (result && result.books.length > 0) return result;

    // Title-shaped-like-a-name queries ("Fourth Wing", "Project Hail Mary")
    // find nothing in author mode — retry them as a plain keyword search.
    if (authorSearch) {
      const keywordParams = new URLSearchParams(params);
      keywordParams.delete("author");
      keywordParams.set("q", query);
      const keywordResult = await runSearch(keywordParams);
      if (keywordResult) return keywordResult;
    }

    return result ?? { books: [], hasMore: false };
  } catch {
    return { books: [], hasMore: false };
  }
}

/** Author names are decoration — a slow/failed author call must not fail the work. */
async function fetchAuthorName(authorKey?: string): Promise<string | null> {
  if (!authorKey) return null;

  const authorId = authorKey.split("/").pop();
  if (!authorId) return null;

  try {
    const response = await fetchOpenLibrary(
      `https://openlibrary.org/authors/${authorId}.json`,
      { revalidate: 86400 }
    );

    if (!response.ok) return null;

    const data: OpenLibraryAuthor = await response.json();
    return data.name ?? null;
  } catch (error) {
    console.error("[open-library] author lookup failed:", {
      authorId,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function getOpenLibraryBookById(
  id: string,
  options?: { timeoutMs?: number }
): Promise<BookDetail | null> {
  const workId = id.startsWith(OPEN_LIBRARY_ID_PREFIX)
    ? id.slice(OPEN_LIBRARY_ID_PREFIX.length)
    : id;

  const response = await fetchOpenLibrary(
    `https://openlibrary.org/works/${workId}.json`,
    { revalidate: 3600, timeoutMs: options?.timeoutMs }
  );

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Open Library API error: ${response.status}`);
  }

  const data: OpenLibraryWork = await response.json();
  const title = cleanTitle(data.title);
  if (!title.trim()) return null;

  const authorNames = await Promise.all(
    (data.authors ?? []).map((entry) => fetchAuthorName(entry.author?.key))
  );

  return {
    id: toOpenLibraryId(workId),
    title,
    authors: cleanAuthors(
      authorNames.filter((name): name is string => Boolean(name))
    ),
    description: parseOpenLibraryDescription(data.description),
    coverUrl: openLibraryCoverUrl(data.covers?.[0]),
    genres: [],
    publishedYear: parsePublishedYear(data.first_publish_date),
    firstPublishYear: parsePublishedYear(data.first_publish_date),
    source: "openlibrary",
    publisher: null,
    pageCount: null,
    language: null,
    isbn: null,
  };
}

/**
 * Description + cover straight off the work record, with no author lookups.
 * Search docs omit descriptions the work has, so this is the cheapest way to
 * give a search result a real synopsis. Soft-fails to null.
 */
export async function getOpenLibraryWorkBlurb(
  id: string,
  options?: { timeoutMs?: number }
): Promise<{
  description: string | null;
  coverUrl: string | null;
  publishedYear: number | null;
} | null> {
  const workId = id.startsWith(OPEN_LIBRARY_ID_PREFIX)
    ? id.slice(OPEN_LIBRARY_ID_PREFIX.length)
    : id;
  if (!/^OL\d+W$/i.test(workId)) return null;

  try {
    const response = await fetchOpenLibrary(
      `https://openlibrary.org/works/${workId}.json`,
      { revalidate: 3600, timeoutMs: options?.timeoutMs ?? 2500 }
    );
    if (!response.ok) return null;

    const data: OpenLibraryWork = await response.json();
    return {
      description: parseOpenLibraryDescription(data.description),
      coverUrl: openLibraryCoverUrl(data.covers?.[0]),
      publishedYear: parsePublishedYear(data.first_publish_date),
    };
  } catch (error) {
    console.error("[open-library] work blurb failed:", {
      id,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Resolve a work via ISBN search, then load the work detail when possible.
 * Soft-fails to null on any error.
 */
export async function getOpenLibraryBookByIsbn(
  isbn: string
): Promise<BookDetail | null> {
  const digits = isbn.replace(/\D/g, "");
  if (digits.length < 10) return null;

  try {
    const params = new URLSearchParams({
      q: `isbn:${digits}`,
      limit: "5",
      fields:
        "key,title,author_name,cover_i,first_publish_year,subject,first_sentence,isbn,language",
    });

    const response = await fetchOpenLibrary(
      `https://openlibrary.org/search.json?${params.toString()}`,
      { revalidate: 3600 }
    );
    if (!response.ok) return null;

    const data: OpenLibrarySearchResponse = await response.json();
    const books = parseOpenLibrarySearchResponse(data);
    const best = books[0];
    if (!best) return null;

    try {
      const detail = await getOpenLibraryBookById(best.id);
      if (detail) {
        return { ...detail, isbn: detail.isbn ?? best.isbn ?? digits };
      }
    } catch {
      // Fall through to search summary.
    }

    return {
      ...best,
      publisher: null,
      pageCount: best.pageCount ?? null,
      language: null,
      isbn: best.isbn ?? digits,
    };
  } catch (error) {
    console.error("[open-library] ISBN lookup failed:", error);
    return null;
  }
}

/**
 * Resolve via title (+ optional author) search. Soft-fails to null.
 */
export async function getOpenLibraryBookByTitle(
  title: string,
  authors: string[] = []
): Promise<BookDetail | null> {
  const trimmed = title.trim();
  if (!trimmed) return null;

  try {
    const author = authors[0]?.trim();
    const query = author ? `${trimmed} ${author}` : trimmed;
    const page = await searchOpenLibrary(query, 1);
    if (page.books.length === 0) return null;

    const needle = trimmed.toLowerCase();
    const ranked =
      page.books.find((book) => book.title.toLowerCase().includes(needle)) ??
      page.books[0];

    try {
      const detail = await getOpenLibraryBookById(ranked.id);
      if (detail) return detail;
    } catch {
      // Fall through to search summary.
    }

    return {
      ...ranked,
      publisher: null,
      pageCount: ranked.pageCount ?? null,
      language: null,
      isbn: ranked.isbn ?? null,
    };
  } catch (error) {
    console.error("[open-library] title lookup failed:", error);
    return null;
  }
}
