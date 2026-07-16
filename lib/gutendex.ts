import {
  cleanAuthors,
  cleanDescription,
  cleanTitle,
  isLowQualityBook,
  parsePublishedYear,
} from "@/lib/book-utils";
import {
  isGenreSearchMode,
  toGutendexTopic,
  type SearchBooksOptions,
} from "@/lib/genre-search";
import type { BookSummary } from "@/types/book";

const GUTENDEX_ID_PREFIX = "gutenberg-";
const FETCH_TIMEOUT_MS = 8000;

type GutendexAuthor = {
  name?: string;
};

type GutendexBook = {
  id?: number;
  title?: string;
  authors?: GutendexAuthor[];
  subjects?: string[];
  bookshelves?: string[];
  formats?: Record<string, string>;
  download_count?: number;
};

type GutendexSearchResponse = {
  next?: string | null;
  results?: GutendexBook[];
};

export type GutendexPageResult = {
  books: BookSummary[];
  hasMore: boolean;
};

export function isGutendexId(id: string): boolean {
  return id.startsWith(GUTENDEX_ID_PREFIX);
}

export function toGutendexId(gutenbergId: number): string {
  return `${GUTENDEX_ID_PREFIX}${gutenbergId}`;
}

function normalizeGutendexAuthor(name: string): string {
  const trimmed = name.trim();
  const match = trimmed.match(/^([^,]+),\s*(.+)$/);
  if (match) {
    return `${match[2].trim()} ${match[1].trim()}`;
  }
  return trimmed;
}

function parseGutendexAuthors(authors?: GutendexAuthor[]): string[] {
  const names = (authors ?? [])
    .map((author) => author.name?.trim())
    .filter((name): name is string => Boolean(name))
    .map(normalizeGutendexAuthor);

  return cleanAuthors(names);
}

function parseGutendexCover(formats?: Record<string, string>): string | null {
  const jpeg = formats?.["image/jpeg"];
  if (!jpeg) return null;
  return jpeg.replace("http://", "https://");
}

function parseGutendexGenres(_book: GutendexBook): string[] {
  // Gutendex subjects are noisy for genre tagging — ignore here.
  // finalizeBookTags may still infer from title / description.
  return [];
}

/** Best-effort year from Gutendex subjects/bookshelves (API has no publish year). */
function parseGutendexPublishedYear(book: GutendexBook): number | null {
  const texts = [...(book.subjects ?? []), ...(book.bookshelves ?? [])];
  let best: number | null = null;

  for (const text of texts) {
    const year = parsePublishedYear(text);
    if (year == null) continue;
    if (best == null || year > best) best = year;
  }

  return best;
}

/** Gutendex has no blurb field — build a short description from subjects. */
function parseGutendexDescription(book: GutendexBook): string | null {
  const subjects = (book.subjects ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 5);
  if (subjects.length === 0) return null;
  return cleanDescription(subjects.join(". "));
}

export function parseGutendexSearchResponse(
  data: GutendexSearchResponse
): BookSummary[] {
  if (!data.results) return [];

  return data.results
    .map((book): BookSummary | null => {
      if (!book.id || !book.title) return null;

      return {
        id: toGutendexId(book.id),
        title: cleanTitle(book.title),
        authors: parseGutendexAuthors(book.authors),
        coverUrl: parseGutendexCover(book.formats),
        description: parseGutendexDescription(book),
        genres: parseGutendexGenres(book),
        publishedYear: parseGutendexPublishedYear(book),
        source: "gutendex",
        downloadCount: book.download_count ?? null,
      };
    })
    .filter((book): book is BookSummary => book !== null)
    .filter((book) => !isLowQualityBook(book));
}

export async function searchGutendex(
  query: string,
  page = 1,
  options?: SearchBooksOptions
): Promise<GutendexPageResult> {
  try {
    const genreMode = isGenreSearchMode(options?.mode);
    const params = new URLSearchParams({
      page: String(Math.max(1, page)),
    });

    if (genreMode) {
      params.set("topic", toGutendexTopic(query));
    } else {
      params.set("search", query.trim());
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(
        `https://gutendex.com/books/?${params.toString()}`,
        { cache: "no-store", signal: controller.signal }
      );

      if (!response.ok) return { books: [], hasMore: false };

      const data: GutendexSearchResponse = await response.json();
      return {
        books: parseGutendexSearchResponse(data),
        hasMore: Boolean(data.next),
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return { books: [], hasMore: false };
  }
}
