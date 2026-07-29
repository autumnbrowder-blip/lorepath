import { parsePublishedYear } from "@/lib/book-utils";
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

/** Map an external route id (slug) to a `books` table upsert payload. */
export function bookDetailToDbRow(externalId: string, book: BookDetail) {
  const isbn = book.isbn?.replace(/\D/g, "") || null;
  return {
    slug: externalId,
    title: book.title,
    author: book.authors[0] ?? null,
    isbn: isbn && (isbn.length === 10 || isbn.length === 13) ? isbn : null,
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

/**
 * Upsert a resolved book into `books` for later detail hits.
 * Soft-fails — never throws. ISBN unique conflicts retry without isbn.
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

    const row = bookDetailToDbRow(slug, book);
    const { error } = await supabase
      .from("books")
      .upsert(row, { onConflict: "slug" });

    if (!error) return true;

    // Another book may already own this ISBN — keep the slug cache without it.
    if (row.isbn && /isbn|23505|unique/i.test(error.message)) {
      const { error: retryError } = await supabase
        .from("books")
        .upsert({ ...row, isbn: null }, { onConflict: "slug" });
      if (!retryError) return true;
      console.error("[book-cache] upsert retry failed:", retryError.message);
      return false;
    }

    console.error("[book-cache] upsert failed:", error.message);
    return false;
  } catch (error) {
    console.error("[book-cache] upsert error:", error);
    return false;
  }
}
