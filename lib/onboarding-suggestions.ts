import { sourceFromBookSlug } from "@/lib/book-cache";
import { searchBooks } from "@/lib/books";
import { fetchNytBestsellers } from "@/lib/nyt-books";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServiceRoleClient, createClient } from "@/lib/supabase/server";
import type { BookSource, BookSummary } from "@/types/book";

const SUGGESTION_LIMIT = 6;

/** Popular titles as soft fallback when community / NYT shelves are quiet. */
const CURATED_QUERIES = [
  "fourth wing",
  "dune frank herbert",
  "a court of thorns and roses",
  "the hobbit",
  "red rising pierce brown",
  "the name of the wind",
];

function asSummary(book: {
  id: string;
  title: string;
  authors: string[];
  coverUrl: string | null;
  genres?: string[];
  publishedYear?: number | null;
  source?: BookSource;
  isbn?: string | null;
}): BookSummary | null {
  const title = book.title?.trim();
  if (!title) return null;
  return {
    id: book.id,
    title,
    authors: book.authors.filter(Boolean),
    coverUrl: book.coverUrl,
    description: null,
    genres: book.genres ?? [],
    publishedYear: book.publishedYear ?? null,
    source: book.source ?? sourceFromBookSlug(book.id),
    isbn: book.isbn ?? null,
  };
}

function pushUnique(
  into: BookSummary[],
  book: BookSummary | null,
  seen: Set<string>
) {
  if (!book?.title?.trim()) return;
  const key = book.id.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  into.push(book);
}

/**
 * Prefer books that already have community marks in our archive.
 * Soft-fails to [] — never throws.
 */
async function loadCommunityRatedBooks(): Promise<BookSummary[]> {
  if (!isSupabaseConfigured()) return [];

  try {
    const admin = createServiceRoleClient();
    const supabase =
      "error" in admin ? await createClient() : admin.supabase;

    const { data, error } = await supabase
      .from("ratings")
      .select(
        `
        book_id,
        books (
          slug,
          title,
          author,
          cover_image_url,
          genre
        )
      `
      )
      .limit(200);

    if (error || !data?.length) return [];

    const counts = new Map<
      string,
      { count: number; book: BookSummary }
    >();

    for (const row of data) {
      const raw = Array.isArray(row.books) ? row.books[0] : row.books;
      if (!raw || typeof raw !== "object") continue;
      const slug = typeof raw.slug === "string" ? raw.slug.trim() : "";
      const title = typeof raw.title === "string" ? raw.title.trim() : "";
      if (!slug || !title) continue;

      const author =
        typeof raw.author === "string" && raw.author.trim()
          ? raw.author.trim()
          : "";
      const summary = asSummary({
        id: slug,
        title,
        authors: author ? [author] : [],
        coverUrl:
          typeof raw.cover_image_url === "string"
            ? raw.cover_image_url
            : null,
        genres:
          typeof raw.genre === "string" && raw.genre.trim()
            ? [raw.genre.trim()]
            : [],
      });
      if (!summary) continue;

      const prev = counts.get(slug);
      if (prev) {
        prev.count += 1;
      } else {
        counts.set(slug, { count: 1, book: summary });
      }
    }

    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .map((entry) => entry.book)
      .slice(0, SUGGESTION_LIMIT);
  } catch {
    return [];
  }
}

async function loadCuratedSearchBooks(
  needed: number,
  seen: Set<string>
): Promise<BookSummary[]> {
  if (needed <= 0) return [];

  const found: BookSummary[] = [];

  await Promise.all(
    CURATED_QUERIES.map(async (query) => {
      if (found.length >= needed) return;
      try {
        const result = await searchBooks(query, 1);
        const first = result.books.find((book) => book.title?.trim());
        if (!first) return;
        const summary = asSummary(first);
        if (!summary || seen.has(summary.id.toLowerCase())) return;
        if (found.length >= needed) return;
        seen.add(summary.id.toLowerCase());
        found.push(summary);
      } catch {
        // Soft-fail per title.
      }
    })
  );

  return found.slice(0, needed);
}

/**
 * Books for the first-rating prompt: community-rated first, then NYT,
 * then curated popular-title searches. Always soft-fails.
 */
export async function getFirstRatingSuggestions(): Promise<BookSummary[]> {
  const suggestions: BookSummary[] = [];
  const seen = new Set<string>();

  try {
    const community = await loadCommunityRatedBooks();
    for (const book of community) {
      pushUnique(suggestions, book, seen);
      if (suggestions.length >= SUGGESTION_LIMIT) return suggestions;
    }
  } catch {
    // continue to fallbacks
  }

  try {
    const nyt = await fetchNytBestsellers();
    for (const book of nyt.books ?? []) {
      pushUnique(suggestions, asSummary(book), seen);
      if (suggestions.length >= SUGGESTION_LIMIT) return suggestions;
    }
  } catch {
    // continue to curated
  }

  try {
    const curated = await loadCuratedSearchBooks(
      SUGGESTION_LIMIT - suggestions.length,
      seen
    );
    for (const book of curated) {
      pushUnique(suggestions, book, seen);
      if (suggestions.length >= SUGGESTION_LIMIT) break;
    }
  } catch {
    // leave whatever we have
  }

  return suggestions;
}
