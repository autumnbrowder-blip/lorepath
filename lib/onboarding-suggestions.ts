import { sourceFromBookSlug } from "@/lib/book-cache";
import { searchBooks } from "@/lib/books";
import { fetchNytBestsellers } from "@/lib/nyt-books";
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
 * Books for the first-rating prompt: NYT then curated popular-title searches.
 * Do not SELECT from ratings without book_id or rated_by — that seq-scans
 * and cancels with SQLSTATE 57014.
 */
export async function getFirstRatingSuggestions(): Promise<BookSummary[]> {
  const suggestions: BookSummary[] = [];
  const seen = new Set<string>();

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
