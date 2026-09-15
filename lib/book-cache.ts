import { normalizeIsbn, parsePublishedYear } from "@/lib/book-utils";
import { getSupabaseEnv, isSupabaseConfigured } from "@/lib/supabase/config";
import {
  isColumnMarkedMissing,
  isMissingColumnError,
  isNonRetryableDataApiError,
  markColumnMissing,
} from "@/lib/supabase/schema-cache";
import { createServiceRoleClient, noStoreFetch } from "@/lib/supabase/server";
import type { BookDetail, BookSource, BookSummary } from "@/types/book";
import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

export type BookDbRow = {
  slug: string;
  title: string;
  author: string | null;
  isbn: string | null;
  cover_image_url: string | null;
  description: string | null;
  published_year: number | null;
  genre: string | null;
  page_count: number | null;
};

/**
 * Production `books` columns that exist without the optional Hardcover
 * migration. Never include hardcover_cached_at here — that column 42703s
 * on hosts that have not applied 20260909_books_hardcover_cached_at.
 */
const BOOK_READ_COLUMNS =
  "id, slug, title, author, isbn, cover_image_url, description, published_year, genre, page_count";

/** Cheap local search — never `select *`, never ratings. */
const LOCAL_SEARCH_COLUMNS =
  "slug, title, author, isbn, cover_image_url, description, published_year, genre, page_count";

/** Hard cap — ILIKE %q% on a large books table must not scan dozens of rows. */
const LOCAL_SEARCH_LIMIT = 10;

/** Process-wide: after 520/525/57014, skip every books write for 15 minutes. */
const BOOKS_WRITE_COOLDOWN_MS = 15 * 60 * 1000;
let booksWriteBlockedUntil = 0;

function openBooksWriteCircuit(reason: string): void {
  booksWriteBlockedUntil = Date.now() + BOOKS_WRITE_COOLDOWN_MS;
  console.error("[book-cache] books write circuit open 15m:", reason);
}

export function isBooksWriteCircuitOpen(): boolean {
  return Date.now() < booksWriteBlockedUntil;
}

/**
 * Cloudflare 520/525 in front of PostgREST, or Postgres statement timeout 57014.
 * Match status/code first so a title containing those digits cannot trip this.
 */
export function isBooksOverloadedError(
  message: string,
  code?: string | number | null,
  status?: number | null
): boolean {
  const rawCode = code == null ? "" : String(code).trim();
  const numeric =
    typeof code === "number"
      ? code
      : typeof status === "number"
        ? status
        : /^\d+$/.test(rawCode)
          ? Number(rawCode)
          : null;
  if (numeric === 520 || numeric === 525 || numeric === 57014) return true;
  if (rawCode === "520" || rawCode === "525" || rawCode === "57014") return true;
  if (status === 520 || status === 525) return true;
  if (/\b57014\b/.test(message) || /canceling statement|statement timeout/i.test(message)) {
    return true;
  }
  if (/error code:\s*52[05]\b/i.test(message)) return true;
  if (/\b52[05]\b/.test(message) && /cloudflare|web server is down|origin is unreachable|ssl handshake/i.test(message)) {
    return true;
  }
  return false;
}

/** Open the 15-minute write circuit. Returns true when the error matched. */
export function noteBooksOverloadedError(
  message: string,
  code?: string | number | null,
  status?: number | null
): boolean {
  if (!isBooksOverloadedError(message, code, status)) return false;
  openBooksWriteCircuit(`${rawErrorLabel(code, status)} ${message}`.trim());
  return true;
}

function rawErrorLabel(
  code?: string | number | null,
  status?: number | null
): string {
  if (code != null && String(code).trim()) return String(code);
  if (status != null) return String(status);
  return "";
}

/**
 * Skip local ILIKE for bot/noise queries. Catalog search still runs.
 * "Dune" (4) is allowed; "It" (2) is skipped; "Typex" is treated as garbage.
 * Multi-token queries may include short words ("It Ends With Us").
 */
export function isLocalIlikeNoiseQuery(query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return true;

  const compact = trimmed.replace(/[\s-]/g, "");
  if (/^\d{9}[\dXx]$|^\d{13}$/.test(compact)) return false;
  if (/^\d{4}$/.test(trimmed)) return false;

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const letters = trimmed.replace(/[^A-Za-z]/g, "");
  if (letters.length === 0) return true;

  const stripped = trimmed
    .replace(/[^A-Za-z0-9'\- ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (stripped.length < 2) return true;

  if (tokens.length >= 2) {
    return !tokens.some((token) => (token.match(/[A-Za-z]/g) ?? []).length >= 2);
  }

  const token = tokens[0] ?? "";
  if (token.length < 4) return true;
  if (/\d/.test(token) && /[A-Za-z]/.test(token)) return true;
  if (!/[aeiouy]/i.test(token)) return true;
  if (/(.)\1{3,}/.test(token)) return true;
  // Probe-like 5-letter token ending in x but not -ix (Typex yes, Helix no).
  if (token.length === 5 && /x$/i.test(token) && !/ix$/i.test(token)) return true;
  return false;
}

function isHardcoverEnabled(): boolean {
  return process.env.HARDCOVER_ENABLED === "true";
}

/** Digits-only ISBN suitable for `books.isbn` (null when missing/invalid). */
export function bookIsbnKey(isbn: string | null | undefined): string | null {
  if (typeof isbn !== "string") return null;
  const digits = isbn.replace(/\D/g, "") || "";
  if (digits.length === 10 || digits.length === 13) return digits;
  return null;
}

/**
 * ISBN values that may already exist in `books.isbn` for the same edition
 * (ISBN-10 vs ISBN-13, raw digits vs normalized ISBN-13).
 */
export function isbnLookupCandidates(
  isbn: string | null | undefined
): string[] {
  const out = new Set<string>();
  const raw = bookIsbnKey(isbn);
  if (raw) out.add(raw);
  const normalized = normalizeIsbn(isbn);
  if (normalized) out.add(normalized);
  return Array.from(out);
}

function isbnFromBookSlug(slug: string): string | null {
  const trimmed = slug.trim();
  for (const prefix of ["isbndb-", "nyt-"]) {
    if (!trimmed.toLowerCase().startsWith(prefix)) continue;
    return bookIsbnKey(trimmed.slice(prefix.length));
  }
  return bookIsbnKey(trimmed);
}

function isUniqueViolation(message: string): boolean {
  return /23505/.test(message) || /duplicate key/i.test(message);
}

function isIsbnUniqueViolation(message: string): boolean {
  return (
    isUniqueViolation(message) &&
    (/isbn/i.test(message) || /books_isbn_unique/i.test(message))
  );
}

/** Map an external route id (slug) to a `books` table upsert payload. */
export function bookDetailToDbRow(externalId: string, book: BookDetail) {
  const isbn = bookIsbnKey(book.isbn);
  return {
    slug: externalId,
    title: book.title,
    author: book.authors[0] ?? null,
    isbn,
    cover_image_url: book.coverUrl,
    description: book.description,
    published_year: book.publishedYear,
    genre: book.genres.filter(Boolean).slice(0, 5).join(", ") || null,
    page_count: book.pageCount,
  };
}

export function sourceFromBookSlug(slug: string): BookSource {
  if (slug.startsWith("ol-") || slug.startsWith("openlibrary-")) {
    return "openlibrary";
  }
  if (slug.startsWith("gutenberg-") || slug.startsWith("gutendex-")) {
    return "gutendex";
  }
  if (slug.startsWith("isbndb-")) return "isbndb";
  if (slug.startsWith("bigbook-")) return "bigbook";
  if (slug.startsWith("nyt-")) return "nyt";
  return "google";
}

export function dbBookToDetail(row: BookDbRow): BookDetail | null {
  const title = row.title?.trim();
  if (!title || !row.slug) return null;

  return {
    id: row.slug,
    title,
    authors: row.author?.trim() ? [row.author.trim()] : ["Unknown author"],
    coverUrl: row.cover_image_url,
    description: row.description,
    genres: row.genre?.trim()
      ? row.genre.split(", ").map((tag) => tag.trim()).filter(Boolean)
      : [],
    publishedYear: parsePublishedYear(row.published_year),
    source: sourceFromBookSlug(row.slug),
    isbn: row.isbn,
    publisher: null,
    pageCount: row.page_count,
    language: null,
  };
}

/**
 * Anon/user-safe SELECT client for public.books reads.
 * Falls back to service role only when the caller retries after RLS denial.
 */
function resolveBooksReadClient(): SupabaseClient | null {
  const env = getSupabaseEnv();
  if (!env) return null;
  return createSupabaseClient(env.url, env.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: noStoreFetch,
    },
  });
}

function escapeIlikeValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/"/g, "")
    .replace(/,/g, " ")
    .replace(/\(/g, " ")
    .replace(/\)/g, " ")
    .trim();
}

function isBooksSelectDenied(message: string, code?: string): boolean {
  return (
    code === "42501" ||
    /permission denied|row-level security|42501/i.test(message)
  );
}

/**
 * One ILIKE on title/author. No ratings join, no Hardcover, no HTTP catalogs.
 * Anon SELECT first; service-role only if books SELECT is locked down.
 * Never retries 520/525/57014. Noise queries never hit PostgREST.
 */
export async function searchLocalBooks(
  query: string,
  limit = LOCAL_SEARCH_LIMIT
): Promise<BookSummary[]> {
  const trimmed = query.trim();
  if (!trimmed || !isSupabaseConfigured()) return [];
  if (isLocalIlikeNoiseQuery(trimmed)) return [];

  const escaped = escapeIlikeValue(trimmed);
  if (!escaped) return [];
  const pattern = `%${escaped}%`;
  const pageSize = Math.max(1, Math.min(LOCAL_SEARCH_LIMIT, limit));

  const run = async (supabase: SupabaseClient) =>
    supabase
      .from("books")
      .select(LOCAL_SEARCH_COLUMNS)
      .or(`title.ilike."${pattern}",author.ilike."${pattern}"`)
      .limit(pageSize);

  try {
    const anon = resolveBooksReadClient();
    if (!anon) return [];

    let { data, error } = await run(anon);
    if (error && noteBooksOverloadedError(error.message ?? "", error.code)) {
      console.error("[book-cache] local search failed fast (overloaded):", {
        code: error.code,
        message: error.message,
      });
      return [];
    }
    if (error && isBooksSelectDenied(error.message ?? "", error.code)) {
      const admin = resolveBooksWriteClient();
      if (admin) {
        const retry = await run(admin);
        data = retry.data;
        error = retry.error;
      }
    }

    if (error) {
      noteBooksOverloadedError(error.message ?? "", error.code);
      if (isNonRetryableDataApiError(error.message ?? "", error.code)) {
        console.error("[book-cache] local search skipped:", {
          code: error.code,
          message: error.message,
        });
      } else {
        console.error("[book-cache] local search failed:", error.message);
      }
      return [];
    }

    return (data ?? [])
      .map((row) => dbBookToDetail(row as BookDbRow))
      .filter((book): book is BookDetail => book !== null);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status =
      error instanceof Error
        ? (error as Error & { status?: number }).status
        : undefined;
    noteBooksOverloadedError(message, undefined, status);
    console.error("[book-cache] local search failed:", message);
    return [];
  }
}

/**
 * Books upserts/reads that write a row MUST use the service-role key.
 * Never fall back to the anon/user JWT — that hits 42501 RLS on insert.
 */
function resolveBooksWriteClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  const admin = createServiceRoleClient();
  if ("error" in admin) {
    console.error("[book-cache] service role unavailable:", admin.error);
    return null;
  }
  return admin.supabase;
}

/**
 * Prefer a previously resolved `books` row by external slug.
 * Soft-fails to null on any error (never blocks page load).
 */
export async function getCachedBookBySlug(
  slug: string
): Promise<BookDetail | null> {
  const trimmed = slug.trim();
  if (!trimmed || !isSupabaseConfigured()) return null;

  try {
    const supabase = resolveBooksWriteClient();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from("books")
      .select(BOOK_READ_COLUMNS)
      .eq("slug", trimmed)
      .maybeSingle();

    if (error) {
      const message = error.message ?? "";
      noteBooksOverloadedError(message, error.code);
      if (isNonRetryableDataApiError(message, error.code)) {
        console.error("[book-cache] read skipped:", {
          code: error.code,
          message,
        });
      }
      return null;
    }
    if (!data) return null;
    return dbBookToDetail(data as BookDbRow);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status =
      error instanceof Error
        ? (error as Error & { status?: number }).status
        : undefined;
    noteBooksOverloadedError(message, undefined, status);
    console.error("[book-cache] read failed:", message);
    console.error("[book-detail]", trimmed, message);
    return null;
  }
}

export async function findBookIdBySlugOrIsbn(
  supabase: SupabaseClient,
  options: { slug?: string | null; isbn?: string | null }
): Promise<string | null> {
  const slug = options.slug?.trim() || "";
  if (slug) {
    const { data, error } = await supabase
      .from("books")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (error && noteBooksOverloadedError(error.message ?? "", error.code)) {
      return null;
    }
    if (!error && data?.id) return data.id;
  }

  const candidates = [
    ...isbnLookupCandidates(options.isbn),
    ...isbnLookupCandidates(isbnFromBookSlug(slug)),
  ].filter((value, index, list) => list.indexOf(value) === index);

  if (candidates.length === 0) return null;

  const { data, error } = await supabase
    .from("books")
    .select("id")
    .in("isbn", candidates)
    .limit(1)
    .maybeSingle();

  if (error) {
    noteBooksOverloadedError(error.message ?? "", error.code);
    return null;
  }
  if (!data?.id) return null;
  return data.id;
}

const BOOKS_CIRCUIT_ERROR =
  "Books catalog is temporarily unavailable. Try again in a few minutes.";

/**
 * Idempotent books-row write used only by rating saves.
 *
 * Always upsert on slug so we never insert a second row for the same slug
 * (books_slug_unique). After the write, SELECT id WHERE slug = $slug and
 * use that id for ratings. On 23505 (e.g. books_isbn_unique), recover the
 * existing row instead of inserting another. Never retries 520/525/57014.
 */
export async function ensureBookRow(
  _supabase: SupabaseClient,
  externalId: string,
  book: BookDetail
): Promise<{ bookDbId: string } | { error: string }> {
  const slug = externalId.trim();
  if (!slug || !book.title?.trim()) {
    return { error: "Book not found." };
  }

  if (isBooksWriteCircuitOpen()) {
    return { error: BOOKS_CIRCUIT_ERROR };
  }

  const supabase = resolveBooksWriteClient();
  if (!supabase) {
    return {
      error:
        "Book row could not be saved. Confirm SUPABASE_SERVICE_ROLE_KEY is set, then try again.",
    };
  }

  const bookRow = bookDetailToDbRow(slug, book);
  const { error: upsertError } = await supabase
    .from("books")
    .upsert(bookRow, { onConflict: "slug" });

  if (upsertError && noteBooksOverloadedError(upsertError.message, upsertError.code)) {
    return { error: BOOKS_CIRCUIT_ERROR };
  }

  const { data: slugRow, error: slugReadError } = await supabase
    .from("books")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (slugReadError && noteBooksOverloadedError(slugReadError.message, slugReadError.code)) {
    return { error: BOOKS_CIRCUIT_ERROR };
  }
  if (slugRow?.id) {
    return { bookDbId: slugRow.id };
  }

  if (upsertError) {
    if (isIsbnUniqueViolation(upsertError.message) && bookRow.isbn) {
      const byIsbn = await findBookIdBySlugOrIsbn(supabase, {
        isbn: bookRow.isbn,
        slug,
      });
      if (byIsbn) return { bookDbId: byIsbn };
    }
    if (isUniqueViolation(upsertError.message)) {
      const recovered = await findBookIdBySlugOrIsbn(supabase, {
        slug,
        isbn: bookRow.isbn,
      });
      if (recovered) return { bookDbId: recovered };
    }
    return { error: upsertError.message };
  }

  return {
    error:
      "Book row could not be saved or read back. Confirm SUPABASE_SERVICE_ROLE_KEY is set, then try again.",
  };
}

/**
 * Formerly upserted browse/detail hits into public.books. That path flooded
 * PostgREST with POST ?on_conflict=slug. Search, grid, and detail views are
 * read-only against books; only rating submit may insert a row.
 */
export async function cacheBookDetail(
  _externalId: string,
  _book: BookDetail
): Promise<boolean> {
  return false;
}

const HARDCOVER_CACHED_AT_COLUMN = "hardcover_cached_at";
const HARDCOVER_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type HardcoverRowCache = {
  title: string | null;
  description: string | null;
  coverUrl: string | null;
  tags: string[];
  year: number | null;
  cachedAt: number;
  empty: boolean;
};

function tagsFromGenre(genre: string | null | undefined): string[] {
  if (!genre?.trim()) return [];
  return genre
    .split(", ")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 5);
}

function isHardcoverColumnMissing(message: string): boolean {
  return isMissingColumnError(message, HARDCOVER_CACHED_AT_COLUMN);
}

/**
 * Read a 7-day Hardcover overlay from the existing books row.
 * No-op unless HARDCOVER_ENABLED=true (does not select hardcover_cached_at).
 * Missing column / 57014 / any error → null (caller uses Google/OL).
 */
export async function readHardcoverRowCache(
  slug: string,
  isbn?: string | null
): Promise<HardcoverRowCache | null> {
  const trimmed = slug.trim();
  if (!trimmed || !isSupabaseConfigured()) return null;
  if (!isHardcoverEnabled()) return null;
  if (isColumnMarkedMissing("books", HARDCOVER_CACHED_AT_COLUMN)) return null;

  try {
    const supabase = resolveBooksWriteClient();
    if (!supabase) return null;

    const select = `${BOOK_READ_COLUMNS}, hardcover_cached_at`;

    const { data, error } = await supabase
      .from("books")
      .select(select)
      .eq("slug", trimmed)
      .maybeSingle();

    if (error) {
      const message = error.message ?? "";
      if (isHardcoverColumnMissing(message)) {
        markColumnMissing("books", HARDCOVER_CACHED_AT_COLUMN);
        return null;
      }
      noteBooksOverloadedError(message, error.code);
      if (isNonRetryableDataApiError(message, error.code)) {
        console.error("[book-cache] hardcover read skipped:", {
          code: error.code,
          message,
        });
      }
      return null;
    }

    let row = data as
      | (BookDbRow & { hardcover_cached_at?: string | null })
      | null;

    if (!row) {
      const candidates = isbnLookupCandidates(isbn);
      if (candidates.length === 0) return null;
      const byIsbn = await supabase
        .from("books")
        .select(select)
        .in("isbn", candidates)
        .limit(1)
        .maybeSingle();
      if (byIsbn.error) {
        if (isHardcoverColumnMissing(byIsbn.error.message ?? "")) {
          markColumnMissing("books", HARDCOVER_CACHED_AT_COLUMN);
        }
        noteBooksOverloadedError(byIsbn.error.message ?? "", byIsbn.error.code);
        return null;
      }
      row = byIsbn.data as (BookDbRow & { hardcover_cached_at?: string | null }) | null;
    }

    const cachedAtRaw = row?.hardcover_cached_at;
    if (!row || !cachedAtRaw) return null;
    const cachedAt = Date.parse(cachedAtRaw);
    if (!Number.isFinite(cachedAt)) return null;
    if (Date.now() - cachedAt >= HARDCOVER_CACHE_TTL_MS) return null;

    return {
      title: row.title ?? null,
      description: row.description,
      coverUrl: row.cover_image_url,
      tags: tagsFromGenre(row.genre),
      year: parsePublishedYear(row.published_year),
      cachedAt,
      empty: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status =
      error instanceof Error
        ? (error as Error & { status?: number }).status
        : undefined;
    noteBooksOverloadedError(message, undefined, status);
    if (isHardcoverColumnMissing(message)) {
      markColumnMissing("books", HARDCOVER_CACHED_AT_COLUMN);
    }
    console.error("[book-cache] hardcover read failed:", message);
    console.error("[book-detail]", trimmed, message);
    return null;
  }
}

/**
 * Stamp hardcover_cached_at (and winning tags) on an existing books row.
 * No-op unless HARDCOVER_ENABLED=true. Never selects/updates the cache
 * column when the flag is off. Never inserts. Missing column / 57014 → skip.
 */
export async function persistHardcoverCache(
  slug: string,
  isbn: string | null,
  record: HardcoverRowCache
): Promise<void> {
  const trimmed = slug.trim();
  if (!trimmed || record.empty || !isSupabaseConfigured()) return;
  if (!isHardcoverEnabled()) return;
  if (isBooksWriteCircuitOpen()) return;

  try {
    const supabase = resolveBooksWriteClient();
    if (!supabase) return;

    const fields: Record<string, unknown> = {};
    if (record.tags.length > 0) {
      fields.genre = record.tags.slice(0, 5).join(", ");
    }
    const withTimestamp = isColumnMarkedMissing("books", HARDCOVER_CACHED_AT_COLUMN)
      ? fields
      : {
          ...fields,
          hardcover_cached_at: new Date(record.cachedAt).toISOString(),
        };

    if (Object.keys(withTimestamp).length === 0) return;

    const apply = async (payload: Record<string, unknown>) => {
      const bySlug = await supabase.from("books").update(payload).eq("slug", trimmed);
      if (!bySlug.error) return bySlug;
      if (noteBooksOverloadedError(bySlug.error.message ?? "", bySlug.error.code)) {
        return bySlug;
      }
      const candidates = isbnLookupCandidates(isbn);
      if (candidates.length === 0) return bySlug;
      return supabase.from("books").update(payload).in("isbn", candidates);
    };

    const { error } = await apply(withTimestamp);

    if (error && noteBooksOverloadedError(error.message ?? "", error.code)) {
      console.error("[book-cache] hardcover write skipped (overloaded):", {
        code: error.code,
        message: error.message,
      });
      return;
    }

    if (error && isHardcoverColumnMissing(error.message ?? "")) {
      markColumnMissing("books", HARDCOVER_CACHED_AT_COLUMN);
      if (Object.keys(fields).length === 0) return;
      const retry = await apply(fields);
      if (retry.error) {
        noteBooksOverloadedError(retry.error.message ?? "", retry.error.code);
        console.error("[book-cache] hardcover write skipped:", retry.error.message);
      }
      return;
    }

    if (error && isNonRetryableDataApiError(error.message ?? "", error.code)) {
      console.error("[book-cache] hardcover write skipped:", {
        code: error.code,
        message: error.message,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status =
      error instanceof Error
        ? (error as Error & { status?: number }).status
        : undefined;
    noteBooksOverloadedError(message, undefined, status);
    if (isHardcoverColumnMissing(message)) {
      markColumnMissing("books", HARDCOVER_CACHED_AT_COLUMN);
    }
    console.error("[book-cache] hardcover write failed:", error);
    console.error("[book-detail]", trimmed, message);
  }
}
