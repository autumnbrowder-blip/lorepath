import { sourceFromBookSlug } from "@/lib/book-slug";
import { normalizeIsbn, parsePublishedYear } from "@/lib/book-utils";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  isColumnMarkedMissing,
  isMissingColumnError,
  isNonRetryableDataApiError,
  isPermissionDeniedError,
  markColumnMissing,
} from "@/lib/supabase/schema-cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { BookDetail } from "@/types/book";
import { type SupabaseClient } from "@supabase/supabase-js";

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

/**
 * Process-wide: after two 5xx from any public.books REST call, skip every
 * books REST request (read and write) for 15 minutes.
 */
const BOOKS_REST_COOLDOWN_MS = 15 * 60 * 1000;
const BOOKS_5XX_TRIP = 2;
let booksRestBlockedUntil = 0;
let books5xxHits = 0;
/** After 401/403/42501, never hit public.books again in this process. */
let booksAuthBlocked = false;

/** Emergency kill switch: no public.books REST (select/insert/upsert). */
export function isBooksRestDisabled(): boolean {
  return process.env.DISABLE_BOOKS_REST === "true";
}

function openBooksRestCircuit(reason: string): void {
  booksRestBlockedUntil = Date.now() + BOOKS_REST_COOLDOWN_MS;
  books5xxHits = 0;
  console.error("[book-cache] books REST circuit open 15m:", reason);
}

export function isBooksRestCircuitOpen(): boolean {
  return booksAuthBlocked || Date.now() < booksRestBlockedUntil;
}

/** @deprecated Use isBooksRestCircuitOpen — writes and reads share one circuit. */
export function isBooksWriteCircuitOpen(): boolean {
  return isBooksRestCircuitOpen();
}

/**
 * HTTP 5xx, Cloudflare 520/525, or Postgres 57014 from PostgREST.
 * Match status/code first so a title containing those digits cannot trip this.
 */
export function isBooksOverloadedError(
  message: string,
  code?: string | number | null,
  status?: number | null
): boolean {
  const asNum = (value: string | number | null | undefined): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && /^\d+$/.test(value.trim())) {
      return Number(value.trim());
    }
    return null;
  };
  for (const n of [asNum(status), asNum(code)]) {
    if (n != null && n >= 500 && n <= 599) return true;
  }
  const rawCode = code == null ? "" : String(code).trim();
  if (rawCode === "57014") return true;
  if (/\b57014\b/.test(message) || /canceling statement|statement timeout/i.test(message)) {
    return true;
  }
  if (/error code:\s*5\d\d\b/i.test(message)) return true;
  if (/\b52[05]\b/.test(message) && /cloudflare|web server is down|origin is unreachable|ssl handshake/i.test(message)) {
    return true;
  }
  return false;
}

/** Count a 5xx. On the second hit, open the 15-minute REST circuit. */
export function noteBooksOverloadedError(
  message: string,
  code?: string | number | null,
  status?: number | null
): boolean {
  if (!isBooksOverloadedError(message, code, status)) return false;
  if (isBooksRestCircuitOpen()) return true;
  books5xxHits += 1;
  if (books5xxHits >= BOOKS_5XX_TRIP) {
    openBooksRestCircuit(
      `${rawErrorLabel(code, status)} ${message}`.trim() || "5xx"
    );
  }
  return true;
}

export function isBooksAuthDeniedError(
  message: string,
  code?: string | number | null,
  status?: number | null
): boolean {
  const raw = code == null ? "" : String(code).trim();
  const numeric =
    typeof status === "number"
      ? status
      : typeof code === "number"
        ? code
        : /^\d+$/.test(raw)
          ? Number(raw)
          : null;
  if (numeric === 401 || numeric === 403) return true;
  if (raw === "401" || raw === "403" || raw === "42501") return true;
  return isPermissionDeniedError(message, raw || undefined);
}

/** 401/403/42501 — do not retry this request or any later books REST call. */
export function noteBooksAuthDeniedError(
  message: string,
  code?: string | number | null,
  status?: number | null
): boolean {
  if (!isBooksAuthDeniedError(message, code, status)) return false;
  if (!booksAuthBlocked) {
    booksAuthBlocked = true;
    console.error("[book-cache] books REST stopped after 401/403/42501:", {
      code,
      status,
      message,
    });
  }
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

/** Map an external route id (slug) to a books row shape (read/legacy). */
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

export { sourceFromBookSlug } from "@/lib/book-slug";

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

function noteBooksRestFailure(
  message: string,
  code?: string | number | null,
  status?: number | null
): boolean {
  if (noteBooksAuthDeniedError(message, code, status)) return true;
  return noteBooksOverloadedError(message, code, status);
}

function isUniqueViolation(message: string): boolean {
  return /23505/.test(message) || /duplicate key/i.test(message);
}

export async function findBookIdBySlugOrIsbn(
  supabase: SupabaseClient,
  options: {
    slug?: string | null;
    isbn?: string | null;
    /** Rating submit may look up (and then insert) while DISABLE_BOOKS_REST=true. */
    forRatingSubmit?: boolean;
  }
): Promise<string | null> {
  if (!options.forRatingSubmit) {
    if (isBooksRestDisabled()) return null;
    if (isBooksRestCircuitOpen()) return null;
  }
  const slug = options.slug?.trim() || "";
  if (slug) {
    const { data, error } = await supabase
      .from("books")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (error) {
      noteBooksRestFailure(error.message ?? "", error.code);
      return null;
    }
    if (data?.id) return data.id;
  }

  const candidates = [
    ...isbnLookupCandidates(options.isbn),
    ...isbnLookupCandidates(isbnFromBookSlug(slug)),
  ].filter((value, index, list) => list.indexOf(value) === index);

  if (candidates.length === 0) return null;
  if (!options.forRatingSubmit && isBooksRestCircuitOpen()) return null;

  const { data, error } = await supabase
    .from("books")
    .select("id")
    .in("isbn", candidates)
    .limit(1)
    .maybeSingle();

  if (error) {
    noteBooksRestFailure(error.message ?? "", error.code);
    return null;
  }
  if (!data?.id) return null;
  return data.id;
}

/**
 * Resolve a public.books id for rating submit only.
 * Look up by slug or ISBN; if missing, INSERT one row (service-role).
 * Never upsert from search/browse/page load. No retry loop.
 */
export async function ensureBookRow(
  supabase: SupabaseClient,
  externalId: string,
  book: BookDetail
): Promise<{ bookDbId: string } | { error: string }> {
  const slug = externalId.trim();
  if (!slug || !book.title?.trim()) {
    return { error: "Book details are missing; cannot start a catalog row." };
  }

  const writeClient = resolveBooksWriteClient() ?? supabase;

  const existing = await findBookIdBySlugOrIsbn(writeClient, {
    slug,
    isbn: book.isbn,
    forRatingSubmit: true,
  });
  if (existing) return { bookDbId: existing };

  const bookRow = bookDetailToDbRow(slug, book);
  const { data, error } = await writeClient
    .from("books")
    .insert(bookRow)
    .select("id")
    .maybeSingle();

  if (!error && data?.id) {
    return { bookDbId: data.id };
  }

  if (error) {
    noteBooksRestFailure(error.message ?? "", error.code);
    if (isUniqueViolation(error.message ?? "")) {
      const recovered = await findBookIdBySlugOrIsbn(writeClient, {
        slug,
        isbn: bookRow.isbn,
        forRatingSubmit: true,
      });
      if (recovered) return { bookDbId: recovered };
    }
    return {
      error:
        error.message?.trim() ||
        "Could not create a catalog row for this book.",
    };
  }

  const reread = await findBookIdBySlugOrIsbn(writeClient, {
    slug,
    isbn: book.isbn,
    forRatingSubmit: true,
  });
  if (reread) return { bookDbId: reread };

  return { error: "Could not create a catalog row for this book." };
}

/**
 * Formerly upserted browse/detail hits into public.books. Search, grid,
 * and detail never INSERT/UPSERT public.books — only rating submit may.
 */
export async function cacheBookDetail(
  _externalId: string,
  _book: BookDetail
): Promise<boolean> {
  if (isBooksRestDisabled()) return false;
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
  if (isBooksRestDisabled()) return null;
  if (isBooksRestCircuitOpen()) return null;
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
      noteBooksRestFailure(message, error.code);
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
      if (isBooksRestCircuitOpen()) return null;
      const candidates = isbnLookupCandidates(isbn);
      if (candidates.length === 0) return null;
      const byIsbn = await supabase
        .from("books")
        .select(select)
        .in("isbn", candidates)
        .limit(1)
        .maybeSingle();
      if (byIsbn.error) {
        const isbnMessage = byIsbn.error.message ?? "";
        if (isHardcoverColumnMissing(isbnMessage)) {
          markColumnMissing("books", HARDCOVER_CACHED_AT_COLUMN);
        }
        noteBooksRestFailure(isbnMessage, byIsbn.error.code);
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
    noteBooksRestFailure(message, undefined, status);
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
  _slug: string,
  _isbn: string | null,
  _record: HardcoverRowCache
): Promise<void> {
  // Not a rating submit — never PATCH/POST public.books.
  if (isBooksRestDisabled()) return;
  return;
}
