export type BookSource =
  | "hardcover"
  | "google"
  | "openlibrary"
  | "gutendex"
  | "nyt"
  | "isbndb";

/** Label for a whole search response (may be multi-source). */
export type BookSearchSource = BookSource | "multi";

export type BookSummary = {
  id: string;
  title: string;
  authors: string[];
  coverUrl: string | null;
  description: string | null;
  genres: string[];
  publishedYear: number | null;
  source: BookSource;
  downloadCount?: number | null;
  /** ISBN-10 or ISBN-13 when known (used for search dedupe). */
  isbn?: string | null;
  /** Page count when known (Hardcover preferred on merge). */
  pageCount?: number | null;
};

export type BookDetail = BookSummary & {
  publisher: string | null;
  pageCount: number | null;
  language: string | null;
  isbn: string | null;
};

export type BookSearchResult = {
  books: BookSummary[];
  /** All providers queried together via Promise.all. */
  sources: BookSource[];
  /** Raw hit counts from each provider for this page. */
  sourceCounts: Partial<Record<BookSource, number>>;
  /** Non-secret provider readiness (e.g. missing API tokens). */
  providerStatus?: {
    hardcover?: { configured: boolean };
  };
  /** Summary label for the search (use `sources` for per-provider detail). */
  source: BookSearchSource;
  /** 1-based page that was fetched. */
  page: number;
  /** True when any provider still has another page. */
  hasMore: boolean;
};
