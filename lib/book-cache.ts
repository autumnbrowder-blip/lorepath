import { normalizeIsbn, parsePublishedYear } from "@/lib/book-utils";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  createClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import type { BookDetail, BookSource } from "@/types/book";
import type { SupabaseClient } from "@supabase/supabase-js";

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

/** Digits-only ISBN suitable for `books.isbn` (null when missing/invalid). */
export function bookIsbnKey(isbn: string | null | undefined): string | null {
  const digits = isbn?.replace(/\D/g, "") || "";
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
    genre: book.genres[0] ?? null,
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
    genres: row.genre?.trim() ? [row.genre.trim()] : [],
    publishedYear: parsePublishedYear(row.published_year),
    source: sourceFromBookSlug(row.slug),
    isbn: row.isbn,
    publisher: null,
    pageCount: row.page_count,
    language: null,
  };
}

async function resolveCacheClient(): Promise<SupabaseClient | null> {
  if (!isSupabaseConfigured()) return null;

  const admin = createServiceRoleClient();
  if (!("error" in admin)) return admin.supabase;

  try {
    return await createClient();
  } catch {
    return null;
  }
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
    const supabase = await resolveCacheClient();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from("books")
      .select(
        "slug, title, author, isbn, cover_image_url, description, published_year, genre, page_count"
      )
      .eq("slug", trimmed)
      .maybeSingle();

    if (error || !data) return null;
    return dbBookToDetail(data as BookDbRow);
  } catch (error) {
    console.error("[book-cache] read failed:", error);
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

  if (error || !data?.id) return null;
  return data.id;
}

/**
 * Idempotent books-row write used by rating saves and detail-page cache.
 *
 * 1) Reuse slug match
 * 2) Reuse ISBN match (do not insert a second row)
 * 3) Insert: conflict on isbn when present, else slug
 * 4) On 23505 books_isbn_unique, SELECT the existing ISBN row and use it
 */
export async function ensureBookRow(
  supabase: SupabaseClient,
  externalId: string,
  book: BookDetail
): Promise<{ bookDbId: string } | { error: string }> {
  const slug = externalId.trim();
  if (!slug || !book.title?.trim()) {
    return { error: "Book not found." };
  }

  const row = bookDetailToDbRow(slug, book);
  const isbn = row.isbn;

  const existing = await findBookIdBySlugOrIsbn(supabase, { slug, isbn });
  if (existing) {
    if (isbn) {
      const { error: slugError } = await supabase
        .from("books")
        .update({ slug })
        .eq("id", existing)
        .neq("slug", slug);
      if (slugError && !isUniqueViolation(slugError.message)) {
        console.error("[book-cache] slug align failed:", slugError.message);
      }
    }
    return { bookDbId: existing };
  }

  const onConflict = isbn ? "isbn" : "slug";
  const { error: upsertError } = await supabase
    .from("books")
    .upsert(row, { onConflict });

  if (upsertError) {
    if (isIsbnUniqueViolation(upsertError.message) && isbn) {
      const byIsbn = await findBookIdBySlugOrIsbn(supabase, { isbn, slug });
      if (byIsbn) return { bookDbId: byIsbn };
    }
    if (isUniqueViolation(upsertError.message)) {
      const recovered = await findBookIdBySlugOrIsbn(supabase, { slug, isbn });
      if (recovered) return { bookDbId: recovered };
    }
    return { error: upsertError.message };
  }

  const bookDbId = await findBookIdBySlugOrIsbn(supabase, { slug, isbn });
  if (!bookDbId) {
    return {
      error:
        "Book row could not be saved or read back. Confirm SUPABASE_SERVICE_ROLE_KEY is set, then try again.",
    };
  }

  return { bookDbId };
}

/**
 * Upsert a resolved book into `books` for later detail hits.
 * Soft-fails — never throws. Reuses an existing ISBN row instead of inserting
 * a duplicate (books_isbn_unique).
 */
export async function cacheBookDetail(
  externalId: string,
  book: BookDetail
): Promise<boolean> {
  const slug = externalId.trim();
  if (!slug || !book.title?.trim() || !isSupabaseConfigured()) return false;

  try {
    const supabase = await resolveCacheClient();
    if (!supabase) return false;

    const result = await ensureBookRow(supabase, slug, book);
    if ("error" in result) {
      console.error("[book-cache] upsert failed:", result.error);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[book-cache] upsert error:", error);
    return false;
  }
}
