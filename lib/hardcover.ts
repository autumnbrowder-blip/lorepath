import {
  cleanAuthors,
  cleanDescription,
  cleanTitle,
  isLowQualityBook,
  keepProviderSubjects,
  parsePublishedYear,
} from "@/lib/book-utils";
import type { BookDetail, BookSummary } from "@/types/book";

const HARDCOVER_API_URL = "https://api.hardcover.app/v1/graphql";
export const HARDCOVER_ID_PREFIX = "hardcover-";

/**
 * Read token from `.env.local` as `HARDCOVER_API_TOKEN` (no spaces in the name).
 * Server-only — never use `NEXT_PUBLIC_`. Strip an accidental `Bearer ` prefix.
 */
function getHardcoverToken(): string | null {
  let token = process.env.HARDCOVER_API_TOKEN?.trim();
  if (!token) return null;
  if (/^Bearer\s+/i.test(token)) {
    token = token.replace(/^Bearer\s+/i, "").trim();
  }
  return token || null;
}

type HardcoverAuthor = {
  name?: string | null;
};

type HardcoverContribution = {
  author?: HardcoverAuthor | null;
};

type HardcoverImage = {
  url?: string | null;
};

type HardcoverCachedTag = {
  tag?: string | null;
  name?: string | null;
  category?: string | null;
};

type HardcoverCachedTags =
  | HardcoverCachedTag[]
  | Record<string, HardcoverCachedTag[] | undefined>
  | null
  | undefined;

type HardcoverBook = {
  id?: number | string | null;
  title?: string | null;
  release_year?: number | null;
  pages?: number | null;
  description?: string | null;
  image?: HardcoverImage | null;
  contributions?: HardcoverContribution[] | null;
  cached_tags?: HardcoverCachedTags;
};

/** Typesense document inside `search.results.hits[].document`. */
type HardcoverSearchHit = {
  id?: number | string | null;
  title?: string | null;
  description?: string | null;
  release_year?: number | string | null;
  pages?: number | null;
  author_names?: string[] | null;
  contributions?: HardcoverContribution[] | null;
  genres?: string[] | null;
  tags?: string[] | null;
  isbns?: string[] | null;
  image?: HardcoverImage | string | null;
};

type HardcoverSearchResults = {
  hits?: { document?: HardcoverSearchHit }[];
  found?: number;
};

type HardcoverSearchResponse = {
  data?: {
    search?: {
      error?: string | null;
      ids?: Array<number | string> | null;
      /** Typesense payload — object, or occasionally a JSON string. */
      results?: HardcoverSearchResults | string | null;
    } | null;
  } | null;
  errors?: { message?: string }[] | null;
};

type HardcoverBooksResponse = {
  data?: { books?: HardcoverBook[] | null } | null;
  errors?: { message?: string }[] | null;
};

type HardcoverPkResponse = {
  data?: { books_by_pk?: HardcoverBook | null } | null;
  errors?: { message?: string }[] | null;
};

export function isHardcoverId(id: string): boolean {
  return id.startsWith(HARDCOVER_ID_PREFIX);
}

export function toHardcoverId(id: number | string): string {
  return `${HARDCOVER_ID_PREFIX}${id}`;
}

function parseHardcoverAuthors(
  contributions?: HardcoverContribution[] | null,
  authorNames?: string[] | null
): string[] {
  const fromContributions = (contributions ?? [])
    .map((entry) => entry.author?.name?.trim())
    .filter((name): name is string => Boolean(name));

  if (fromContributions.length > 0) {
    return cleanAuthors(fromContributions);
  }

  return cleanAuthors(
    (authorNames ?? []).map((name) => name.trim()).filter(Boolean)
  );
}

function flattenCachedTags(cachedTags: HardcoverCachedTags): string[] {
  if (!cachedTags) return [];

  if (Array.isArray(cachedTags)) {
    return cachedTags
      .map((tag) => tag.tag?.trim() || tag.name?.trim())
      .filter((name): name is string => Boolean(name));
  }

  // Prefer Genre bucket when present
  const genreBucket = cachedTags.Genre ?? cachedTags.genre ?? [];
  const fromGenre = genreBucket
    .map((tag) => tag.tag?.trim() || tag.name?.trim())
    .filter((name): name is string => Boolean(name));

  if (fromGenre.length > 0) return fromGenre;

  return Object.values(cachedTags)
    .flatMap((bucket) => bucket ?? [])
    .map((tag) => tag.tag?.trim() || tag.name?.trim())
    .filter((name): name is string => Boolean(name));
}

function parseHardcoverGenres(input: {
  genres?: string[] | null;
  tags?: string[] | null;
  cached_tags?: HardcoverCachedTags;
}): string[] {
  const fromSearchGenres = (input.genres ?? [])
    .map((name) => name.trim())
    .filter(Boolean);
  const fromCached = flattenCachedTags(input.cached_tags);

  return keepProviderSubjects([...fromSearchGenres, ...fromCached]);
}

function parsePageCount(pages?: number | null): number | null {
  if (typeof pages === "number" && Number.isFinite(pages) && pages > 0) {
    return Math.round(pages);
  }
  return null;
}

function parseCoverUrl(
  image?: HardcoverImage | string | null
): string | null {
  if (typeof image === "string") {
    const raw = image.trim();
    return raw ? raw.replace("http://", "https://") : null;
  }
  const raw = image?.url?.trim();
  return raw ? raw.replace("http://", "https://") : null;
}

function parseIsbn(isbns?: string[] | null): string | null {
  if (!isbns?.length) return null;
  const isbn13 = isbns.find((value) => value.replace(/\D/g, "").length === 13);
  const isbn10 = isbns.find((value) => value.replace(/\D/g, "").length === 10);
  return isbn13 || isbn10 || isbns[0] || null;
}

/** Normalize a Hardcover book row into LorePath BookSummary. */
export function parseHardcoverBook(book: HardcoverBook): BookSummary | null {
  if (book.id == null || !book.title?.trim()) return null;

  const summary: BookSummary = {
    id: toHardcoverId(book.id),
    title: cleanTitle(book.title),
    authors: parseHardcoverAuthors(book.contributions),
    coverUrl: parseCoverUrl(book.image),
    description: cleanDescription(book.description),
    genres: parseHardcoverGenres({ cached_tags: book.cached_tags }),
    publishedYear: parsePublishedYear(book.release_year),
    source: "hardcover",
    isbn: null,
    pageCount: parsePageCount(book.pages),
  };

  if (isLowQualityBook(summary)) return null;
  if (!summary.description?.trim() || !summary.coverUrl?.trim()) return null;
  return summary;
}

function parseHardcoverSearchHit(hit: HardcoverSearchHit): BookSummary | null {
  if (hit.id == null || !hit.title?.trim()) return null;

  // Only genre labels — ignore mood/style `tags` from Typesense (noisy).
  const summary: BookSummary = {
    id: toHardcoverId(hit.id),
    title: cleanTitle(hit.title),
    authors: parseHardcoverAuthors(hit.contributions, hit.author_names),
    coverUrl: parseCoverUrl(hit.image),
    description: cleanDescription(hit.description),
    genres: parseHardcoverGenres({
      genres: hit.genres,
    }),
    publishedYear: parsePublishedYear(hit.release_year),
    source: "hardcover",
    isbn: parseIsbn(hit.isbns),
    pageCount: parsePageCount(hit.pages),
  };

  if (isLowQualityBook(summary)) return null;
  if (!summary.description?.trim() || !summary.coverUrl?.trim()) return null;
  return summary;
}

export function parseHardcoverBookDetail(
  book: HardcoverBook
): BookDetail | null {
  const summary = parseHardcoverBook(book);
  if (!summary) return null;

  return {
    ...summary,
    publisher: null,
    pageCount: summary.pageCount ?? null,
    language: null,
    isbn: summary.isbn ?? null,
  };
}

function normalizeSearchResults(
  results: HardcoverSearchResults | string | null | undefined
): HardcoverSearchResults | null {
  if (!results) return null;
  if (typeof results === "string") {
    try {
      const parsed = JSON.parse(results) as HardcoverSearchResults;
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }
  if (typeof results === "object") return results;
  return null;
}

function extractSearchHits(
  payload: HardcoverSearchResponse
): HardcoverSearchHit[] {
  const results = normalizeSearchResults(payload.data?.search?.results);
  const hits = results?.hits;
  if (!Array.isArray(hits)) return [];
  return hits
    .map((hit) => hit.document)
    .filter((doc): doc is HardcoverSearchHit => Boolean(doc));
}

function extractSearchIds(payload: HardcoverSearchResponse): number[] {
  const raw = payload.data?.search?.ids ?? [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0);
}

const BOOK_FIELDS = `
  id
  title
  release_year
  pages
  description
  image { url }
  contributions { author { name } }
  cached_tags
`;

/**
 * Search Hardcover.app via the official Typesense `search` query.
 * Searches title + author_names (and ISBNs / series / alt titles).
 * Quality gate: only return rows with both a description and a cover.
 *
 * Important: `_ilike` / `_like` filters are disabled by Hardcover and return errors.
 */
export async function searchHardcover(query: string): Promise<BookSummary[]> {
  const trimmed = query.trim();
  const token = getHardcoverToken();

  if (!trimmed) {
    console.warn("[Hardcover] searchHardcover skipped: empty query");
    return [];
  }

  if (!token) {
    console.error(
      "[Hardcover] HARDCOVER_API_TOKEN is missing. Add it to .env.local with no spaces in the name."
    );
    return [];
  }

  console.info("[Hardcover] searchHardcover start", { query: trimmed });

  try {
    const response = await fetch(HARDCOVER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: `
          query SearchBooks($query: String!) {
            search(
              query: $query,
              query_type: "Book",
              per_page: 20,
              page: 1,
              fields: "title,author_names,isbns,series_names,alternative_titles",
              weights: "5,3,5,1,1"
            ) {
              error
              ids
              results
            }
          }
        `,
        variables: { query: trimmed },
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error("[Hardcover] HTTP error:", {
        status: response.status,
        statusText: response.statusText,
        body: body.slice(0, 500),
      });
      return [];
    }

    const payload = (await response.json()) as HardcoverSearchResponse;

    if (payload.errors?.length) {
      console.error("[Hardcover] GraphQL errors:", payload.errors);
      return [];
    }

    const searchError = payload.data?.search?.error;
    if (searchError) {
      console.error("[Hardcover] search.error:", searchError);
      return [];
    }

    const ids = extractSearchIds(payload);
    const hits = extractSearchHits(payload);
    let books = hits
      .map(parseHardcoverSearchHit)
      .filter((book): book is BookSummary => book !== null);

    // Hydrate from books-by-id when Typesense hits are missing/incomplete.
    // Important: if `results.hits` fails to parse but `ids` is populated,
    // we must still hydrate — otherwise search always returns [].
    if (ids.length > 0 && books.length < ids.length) {
      console.info("[Hardcover] hydrating for missing desc/cover", {
        ids: ids.length,
        hits: hits.length,
        completeHits: books.length,
      });
      const hydrated = await fetchHardcoverBooksByIds(ids.slice(0, 20), token);
      if (hydrated.length > 0) {
        const byId = new Map(books.map((book) => [book.id, book] as const));
        for (const book of hydrated) {
          if (!byId.has(book.id)) byId.set(book.id, book);
        }
        // Preserve Typesense ranking
        books = ids
          .map((id) => byId.get(toHardcoverId(id)))
          .filter((book): book is BookSummary => Boolean(book));
      }
    }

    // Hard quality gate: description + cover required
    books = books.filter(
      (book) =>
        Boolean(book.description?.trim()) && Boolean(book.coverUrl?.trim())
    );

    console.info("[Hardcover] searchHardcover done", {
      query: trimmed,
      ids: ids.length,
      hits: hits.length,
      books: books.length,
      sample: books.slice(0, 5).map((book) => ({
        title: book.title,
        authors: book.authors,
        year: book.publishedYear,
        genres: book.genres,
      })),
    });

    return books;
  } catch (error) {
    console.error("[Hardcover] search failed:", error);
    return [];
  }
}

async function fetchHardcoverBooksByIds(
  ids: number[],
  token: string
): Promise<BookSummary[]> {
  try {
    const response = await fetch(HARDCOVER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: `
          query BooksByIds($ids: [Int!]!) {
            books(where: { id: { _in: $ids } }, limit: 20) {
              ${BOOK_FIELDS}
            }
          }
        `,
        variables: { ids },
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      console.error("[Hardcover] hydrate HTTP error:", response.status);
      return [];
    }

    const payload = (await response.json()) as HardcoverBooksResponse;
    if (payload.errors?.length) {
      console.error("[Hardcover] hydrate GraphQL errors:", payload.errors);
      return [];
    }

    const byId = new Map(
      (payload.data?.books ?? [])
        .map(parseHardcoverBook)
        .filter((book): book is BookSummary => book !== null)
        .map((book) => [book.id, book] as const)
    );

    return ids
      .map((id) => byId.get(toHardcoverId(id)))
      .filter((book): book is BookSummary => Boolean(book));
  } catch (error) {
    console.error("[Hardcover] hydrate failed:", error);
    return [];
  }
}

/** Fetch a single Hardcover book by LorePath id (`hardcover-{id}`). */
export async function getHardcoverBookById(
  id: string
): Promise<BookDetail | null> {
  if (!isHardcoverId(id)) return null;

  const token = getHardcoverToken();
  if (!token) {
    console.error("[Hardcover] HARDCOVER_API_TOKEN is missing for getById");
    return null;
  }

  const numericId = Number(id.slice(HARDCOVER_ID_PREFIX.length));
  if (!Number.isFinite(numericId)) return null;

  try {
    const response = await fetch(HARDCOVER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: `
          query GetBook($id: Int!) {
            books_by_pk(id: $id) {
              ${BOOK_FIELDS}
            }
          }
        `,
        variables: { id: numericId },
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      console.error("[Hardcover] getById HTTP error:", response.status);
      return null;
    }

    const payload = (await response.json()) as HardcoverPkResponse;
    if (payload.errors?.length) {
      console.error("[Hardcover] getById GraphQL errors:", payload.errors);
    }

    const book = payload.data?.books_by_pk;
    if (!book) return null;
    return parseHardcoverBookDetail(book);
  } catch (error) {
    console.error("[Hardcover] getById failed:", error);
    return null;
  }
}
