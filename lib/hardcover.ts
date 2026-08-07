import { cleanDescription, parsePublishedYear } from "@/lib/book-utils";

/**
 * Optional Hardcover.app enrichment source (GraphQL, token-gated).
 * Everything here is a no-op unless HARDCOVER_API_TOKEN is set, so the search
 * pipeline can always call it without checking configuration first.
 */
const HARDCOVER_ENDPOINT = "https://api.hardcover.app/v1/graphql";
const FETCH_TIMEOUT_MS = 3500;

const SEARCH_QUERY = `query LorePathSearch($query: String!) {
  search(query: $query, query_type: "Book", per_page: 5, page: 1) {
    results
  }
}`;

export type HardcoverBook = {
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

function authorizationHeader(token: string): string {
  return /^bearer\s/i.test(token) ? token : `Bearer ${token}`;
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

function toHardcoverBook(hit: Record<string, unknown>): HardcoverBook | null {
  const title = typeof hit.title === "string" ? hit.title.trim() : "";
  if (!title) return null;

  const image = hit.image as { url?: unknown } | undefined;
  const coverUrl =
    typeof image?.url === "string" && image.url.trim() ? image.url.trim() : null;

  return {
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
    isbns: textList(hit.isbns),
  };
}

async function runHardcoverSearch(query: string): Promise<HardcoverBook[]> {
  const token = process.env.HARDCOVER_API_TOKEN?.trim();
  if (!token || !query.trim()) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(HARDCOVER_ENDPOINT, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: authorizationHeader(token),
      },
      body: JSON.stringify({
        query: SEARCH_QUERY,
        variables: { query: query.trim().slice(0, 150) },
      }),
    });

    if (!response.ok) {
      console.error("[hardcover] search failed:", {
        status: response.status,
        query,
      });
      return [];
    }

    const payload = (await response.json()) as {
      data?: { search?: { results?: unknown } };
      errors?: { message?: string }[];
    };

    if (payload.errors?.length) {
      console.error("[hardcover] search returned errors:", {
        query,
        message: payload.errors[0]?.message,
      });
      return [];
    }

    return readHits(payload.data?.search?.results)
      .map((hit) => toHardcoverBook(hit))
      .filter((book): book is HardcoverBook => book !== null);
  } catch (error) {
    console.error("[hardcover] search error:", {
      query,
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
    author ? `${title} ${author}` : title
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

  return exact ?? results.find((book) => normalizeForCompare(book.title) === wantedTitle) ?? null;
}
