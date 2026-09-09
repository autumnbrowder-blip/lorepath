export type BookSource =
  | "google"
  | "openlibrary"
  | "gutendex"
  | "nyt"
  | "isbndb"
  | "bigbook"
  | "hardcover";

/** Label for a whole search response (may be multi-source). */
export type BookSearchSource = BookSource | "multi";

/** Edition relationship label for translated works on browse cards. */
export type BookEditionLabel = "original" | "english";

/** One physical/API edition of a grouped work. */
export type WorkEditionRef = {
  id: string;
  title: string;
  publishedYear: number | null;
  coverUrl: string | null;
  source: BookSource;
  /** Provider language when known — used to keep latest-edition English. */
  language?: string | null;
};

export type BookSummary = {
  id: string;
  title: string;
  authors: string[];
  coverUrl: string | null;
  description: string | null;
  genres: string[];
  /** Latest known edition / publication year. */
  publishedYear: number | null;
  /**
   * Earliest known publication year for the work (e.g. Open Library
   * first_publish_year). When absent, UI falls back to publishedYear.
   */
  firstPublishYear?: number | null;
  /**
   * Newest edition year when it differs from firstPublishYear.
   * When set, detail UI shows First published + Latest edition.
   * Falls back to publishedYear when absent.
   */
  latestEditionYear?: number | null;
  /**
   * Stable work identity (OL work id, leftover hardcover-* id, else title + author last name).
   * Different Google volume IDs that share this key are the same book-work.
   */
  workKey?: string;
  /** Other API records in this work group (search collapse). */
  workEditions?: WorkEditionRef[];
  /**
   * Route id of the earliest printing in this work group (cover preferred
   * when several share the first year). Used by the First published YEAR link.
   */
  firstEditionId?: string | null;
  /**
   * Newest English covered printing when it differs from firstEditionId.
   * Used by the Latest edition YEAR link. Null when there is no other id.
   */
  latestEditionId?: string | null;
  source: BookSource;
  downloadCount?: number | null;
  /** ISBN-10 or ISBN-13 when known (used for search dedupe). */
  isbn?: string | null;
  /** Page count when known. */
  pageCount?: number | null;
  /**
   * BCP-47 / ISO-ish language code when known (e.g. `en`, `eng`, `ja`, `fr`).
   * Used to keep original-language and English editions as separate cards.
   */
  language?: string | null;
  /**
   * When a work has both an original-language and English edition in results,
   * cards are labeled so English-only readers can pick the right tome.
   */
  editionLabel?: BookEditionLabel | null;
};

export type BookDetail = BookSummary & {
  publisher: string | null;
  pageCount: number | null;
  language: string | null;
  isbn: string | null;
};

/** Temporary debug payload when Google Books fails or is filtered. */
export type GoogleBooksSearchDebug = {
  message: string;
  status?: number;
};

export type BookSearchResult = {
  books: BookSummary[];
  /** All providers queried together via Promise.allSettled. */
  sources: BookSource[];
  /** Raw hit counts from each provider for this page. */
  sourceCounts: Partial<Record<BookSource, number>>;
  /** Summary label for the search (use `sources` for per-provider detail). */
  source: BookSearchSource;
  /** 1-based page that was fetched. */
  page: number;
  /** True when any provider still has another page. */
  hasMore: boolean;
  /**
   * External ids in this result page that the signed-in user has already rated.
   * Empty / omitted when logged out. Used for Inscribed badges on browse cards.
   */
  userRatedSlugs?: string[];
  /** Card id → source that supplied its description during enrichment. */
  descriptionSources?: Record<string, string>;
  /** Temporary: Google failure details (message/status) when the provider errors. */
  googleError?: GoogleBooksSearchDebug | null;
  /** Temporary: Google item count before local quality filtering. */
  googleRawCount?: number;
  /** True when every attempted catalog source timed out or rejected. */
  allSourcesTimedOut?: boolean;
  /** Soft warning (e.g. Google 429) — results from other catalogs still returned. */
  warning?: string | null;
};
