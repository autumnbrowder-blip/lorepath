import { cleanDescription, parsePublishedYear } from "@/lib/book-utils";
import type { BookSummary } from "@/types/book";

/**
 * Optional Hardcover.app browse search + enrichment (GraphQL, token-gated).
 * Soft-fails when HARDCOVER_API_TOKEN is unset — other providers still return.
 */
const HARDCOVER_ENDPOINT = "https://api.hardcover.app/v1/graphql";
const FETCH_TIMEOUT_MS = 3000;
const HARDCOVER_ID_PREFIX = "hardcover-";

const SEARCH_QUERY = `query LorePathSearch($query: String!, $page: Int!) {
  search(query: $query, query_type: "Book", per_page: 8, page: $page) {
    results
  }
}`;

export type HardcoverBook = {
  id: string;
  title: string;
  authors: string[];
  description: string | null;
  coverUrl: string | null;
  publishedYear: number | null;
  pageCount: number | null;
  genres: string[];
  isbns: string[];
};

export function isHardcoverConfigured(): boolean {
  return Boolean(process.env.HARDCOVER_API_TOKEN?.trim());
}

function hardcoverBearerToken(): string | null {
  const raw = process.env.HARDCOVER_API_TOKEN?.trim();
  if (!raw) return null;
  return raw.replace(/^bearer\s+/i, "").trim() || null;
}

function textList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === "string") return entry.trim();
      if (entry && typeof entry === "object") {
        const name = (entry as { name?: unknown }).name;
        if (typeof name === "string") return name.trim();
      }
      return "";
    })
    .filter(Boolean);
}

/** Search results arrive as Typesense hits, sometimes JSON-encoded. */
function readHits(results: unknown): Record<string, unknown>[] {
  let parsed = results;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }
  if (!parsed || typeof parsed !== "object") return [];
  const hits = (parsed as { hits?: unknown }).hits;
  if (!Array.isArray(hits)) return [];

  return hits
    .map((hit) => {
      if (!hit || typeof hit !== "object") return null;
      const document = (hit as { document?: unknown }).document;
      const record = (document ?? hit) as Record<string, unknown>;
      return typeof record === "object" ? record : null;
    })
    .filter((hit): hit is Record<string, unknown> => hit !== null);
}

function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function hardcoverRecordId(
  hit: Record<string, unknown>,
  title: string,
  isbnDigits: string
): string {
  const raw = hit.id ?? hit.book_id ?? hit.work_id;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return String(raw);
  }
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim().replace(/\s+/g, "-").slice(0, 64);
  }
  return isbnDigits || slugifyTitle(title) || "work";
}

function toHardcoverBook(hit: Record<string, unknown>): HardcoverBook | null {
  const title = typeof hit.title === "string" ? hit.title.trim() : "";
  if (!title) return null;

  const image = hit.image as { url?: unknown } | undefined;
  const coverUrl =
    typeof image?.url === "string" && image.url.trim() ? image.url.trim() : null;
  const isbns = textList(hit.isbns);
  const isbnDigits =
    isbns.find((value) => value.replace(/\D/g, "").length >= 10)?.replace(
      /\D/g,
      ""
    ) ?? "";

  return {
    id: `${HARDCOVER_ID_PREFIX}${hardcoverRecordId(hit, title, isbnDigits)}`,
    title,
    authors: textList(hit.author_names ?? hit.contributions),
    description: cleanDescription(
      typeof hit.description === "string" ? hit.description : null
    ),
    coverUrl,
    publishedYear: parsePublishedYear(
      (hit.release_year as number | undefined) ??
        (typeof hit.release_date === "string" ? hit.release_date : null)
    ),
    pageCount: typeof hit.pages === "number" ? hit.pages : null,
    genres: textList(hit.genres),
    isbns,
  };
}

/**
 * Live Hardcover search for this query only. Never reuses another q's payload.
 */
async function runHardcoverSearch(
  query: string,
  page = 1
): Promise<HardcoverBook[]> {
  const token = hardcoverBearerToken();
  const trimmed = query.trim();
  if (!token || !trimmed) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const pageNumber = Math.max(1, page);

  try {
    const response = await fetch(HARDCOVER_ENDPOINT, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: SEARCH_QUERY,
        variables: {
          query: trimmed.slice(0, 150),
          page: pageNumber,
        },
      }),
    });

    if (!response.ok) {
      console.error("[hardcover] search failed:", {
        status: response.status,
        query: trimmed,
        page: pageNumber,
      });
      return [];
    }

    const payload = (await response.json()) as {
      data?: { search?: { results?: unknown } };
      errors?: { message?: string }[];
    };

    if (payload.errors?.length) {
      console.error("[hardcover] search returned errors:", {
        query: trimmed,
        page: pageNumber,
        message: payload.errors[0]?.message,
      });
      return [];
    }

    return readHits(payload.data?.search?.results)
      .map((hit) => toHardcoverBook(hit))
      .filter((book): book is HardcoverBook => book !== null);
  } catch (error) {
    console.error("[hardcover] search error:", {
      query: trimmed,
      page: pageNumber,
      message: error instanceof Error ? error.message : String(error),
    });
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeForCompare(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Best Hardcover match for a known title (+ author when available). */
export async function fetchHardcoverBook(
  title: string,
  authors: string[] = []
): Promise<HardcoverBook | null> {
  if (!isHardcoverConfigured()) return null;

  const author = authors.find(
    (name) => name && name.toLowerCase() !== "unknown author"
  );
  const results = await runHardcoverSearch(
    author ? `${title} ${author}` : title,
    1
  );
  if (results.length === 0) return null;

  const wantedTitle = normalizeForCompare(title);
  const wantedAuthor = author ? normalizeForCompare(author) : null;

  const exact = results.find((book) => {
    if (normalizeForCompare(book.title) !== wantedTitle) return false;
    if (!wantedAuthor) return true;
    return book.authors.some((name) =>
      normalizeForCompare(name).includes(wantedAuthor)
    );
  });

  return (
    exact ??
    results.find((book) => normalizeForCompare(book.title) === wantedTitle) ??
    null
  );
}

function toBookSummary(book: HardcoverBook): BookSummary {
  const isbn =
    book.isbns.find((value) => value.replace(/\D/g, "").length >= 10) ?? null;
  const isbnDigits = isbn?.replace(/\D/g, "") ?? "";

  return {
    id: book.id,
    title: book.title,
    authors: book.authors.length > 0 ? book.authors : ["Unknown author"],
    coverUrl: book.coverUrl,
    description: book.description,
    genres: book.genres,
    publishedYear: book.publishedYear,
    source: "hardcover",
    isbn: isbnDigits || isbn,
    pageCount: book.pageCount,
    language: "en",
  };
}

export type HardcoverPageResult = {
  books: BookSummary[];
  hasMore: boolean;
};

/**
 * Browse flood search via Hardcover Typesense.
 * Missing HARDCOVER_API_TOKEN → empty page so Google/OL/Gutendex still return.
 */
export async function searchHardcover(
  query: string,
  page = 1
): Promise<HardcoverPageResult> {
  if (!isHardcoverConfigured() || !query.trim()) {
    return { books: [], hasMore: false };
  }

  // Skip Google-structured operators — Hardcover wants natural language.
  const cleaned = query
    .replace(/\bintitle:|"|inauthor:/gi, " ")
    .replace(/\bisbn:\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return { books: [], hasMore: false };

  const hits = await runHardcoverSearch(cleaned, page);
  const books = hits
    .map((hit) => toBookSummary(hit))
    .filter((book) => Boolean(book.title?.trim()))
    .map((book) => ({ ...book, genres: [...book.genres] }));

  return { books, hasMore: false };
}

export function isHardcoverId(id: string): boolean {
  return id.startsWith(HARDCOVER_ID_PREFIX);
}
