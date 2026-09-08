import type { BookSummary } from "@/types/book";

/**
 * Hardcover.app is disabled — no GraphQL, no token read, no network.
 * HARDCOVER_API_TOKEN may still exist in Netlify; this module never uses it.
 * Env name matches Netlify: HARDCOVER_API_TOKEN (not HARDCOVER_API_KEY).
 */
export const HARDCOVER_API_TOKEN_ENV = "HARDCOVER_API_TOKEN";
const HARDCOVER_ID_PREFIX = "hardcover-";

export type HardcoverSearchError = {
  reason:
    | "missing_token"
    | "empty_query"
    | "http_error"
    | "graphql_error"
    | "timeout"
    | "empty_results"
    | "parse_error"
    | "circuit_open"
    | "disabled";
  status?: number;
  message?: string;
};

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

export type HardcoverPageResult = {
  books: BookSummary[];
  hasMore: boolean;
  error: HardcoverSearchError | null;
};

/** Always false. Does not read HARDCOVER_API_TOKEN. */
export function isHardcoverConfigured(): boolean {
  return false;
}

export function isHardcoverCircuitOpen(): boolean {
  return false;
}

/** No-op. Never reads the token or hits the network. */
export async function fetchHardcoverBook(
  _title: string,
  _authors: string[] = []
): Promise<HardcoverBook | null> {
  return null;
}

/** No-op. Never reads the token or hits the network. */
export async function searchHardcover(
  _query: string,
  _page = 1
): Promise<HardcoverPageResult> {
  return { books: [], hasMore: false, error: null };
}

export function isHardcoverId(id: string): boolean {
  return id.startsWith(HARDCOVER_ID_PREFIX);
}
