import { isExactTitleMatch } from "@/lib/book-utils";
import { getGoogleBookByIsbn, searchGoogleBooks } from "@/lib/google-books";
import {
  knownWorkMatchesQuery,
  type KnownWorkEditions,
} from "@/lib/known-editions";
import { searchOpenLibrary } from "@/lib/open-library";
import type { BookSummary } from "@/types/book";

function hasExactTitle(books: BookSummary[], title: string): boolean {
  return books.some((book) => isExactTitleMatch(title, book.title));
}

function hasKnownEdition(
  books: BookSummary[],
  entry: KnownWorkEditions
): boolean {
  const lastName =
    entry.authorHint.toLowerCase().split(/\s+/).pop() ?? "";
  return books.some(
    (book) =>
      isExactTitleMatch(entry.matchTitle, book.title) &&
      book.authors.some((author) =>
        author.toLowerCase().includes(lastName)
      )
  );
}

function detailToSummary(
  detail: Awaited<ReturnType<typeof getGoogleBookByIsbn>>
): BookSummary | null {
  if (!detail) return null;
  return {
    id: detail.id,
    title: detail.title,
    authors: detail.authors,
    coverUrl: detail.coverUrl,
    description: detail.description,
    genres: detail.genres,
    publishedYear: detail.publishedYear,
    firstPublishYear: detail.firstPublishYear ?? null,
    source: detail.source,
    isbn: detail.isbn,
    pageCount: detail.pageCount,
  };
}

async function softGooglePhrase(query: string): Promise<BookSummary[]> {
  try {
    const page = await searchGoogleBooks(query, 1);
    return page.books;
  } catch {
    return [];
  }
}

async function softIsbn(isbn: string): Promise<BookSummary | null> {
  try {
    return detailToSummary(await getGoogleBookByIsbn(isbn));
  } catch {
    return null;
  }
}

/**
 * When page-1 text search is missing a known exact title edition, pull
 * phrase/ISBN hits and merge them in. Never replaces the user's query silently.
 */
export async function fetchTitleSearchFallbacks(
  query: string,
  existing: BookSummary[]
): Promise<BookSummary[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const known = knownWorkMatchesQuery(trimmed);
  const needsKnownEdition = known != null && !hasKnownEdition(existing, known);

  // Also try a generic exact-phrase Google/OL pass when zero exact title hits
  // for any multi-word query that looks like a title (not an author name).
  const wantsPhrasePass =
    needsKnownEdition ||
    (!hasExactTitle(existing, trimmed) &&
      trimmed.split(/\s+/).length >= 2 &&
      existing.length < 3);

  if (!wantsPhrasePass && !needsKnownEdition) return [];

  const recovered: BookSummary[] = [];

  if (known) {
    const [phraseBooks, olBooks, ...isbnBooks] = await Promise.all([
      softGooglePhrase(known.googlePhrase),
      searchOpenLibrary(known.matchTitle, 1)
        .then((r) => r.books)
        .catch(() => []),
      ...known.isbns.map((isbn) => softIsbn(isbn)),
    ]);

    recovered.push(
      ...phraseBooks.filter((b) => isExactTitleMatch(known.matchTitle, b.title))
    );
    recovered.push(
      ...olBooks.filter((b) => isExactTitleMatch(known.matchTitle, b.title))
    );
    for (const book of isbnBooks) {
      if (book && isExactTitleMatch(known.matchTitle, book.title)) {
        recovered.push(book);
      }
    }

    // Author shelf as last resort — pick exact title from author results.
    if (!hasKnownEdition([...existing, ...recovered], known)) {
      const [gAuthor, olAuthor] = await Promise.all([
        softGooglePhrase(known.authorHint),
        searchOpenLibrary(known.authorHint, 1)
          .then((r) => r.books)
          .catch(() => []),
      ]);
      recovered.push(
        ...[...gAuthor, ...olAuthor].filter((b) =>
          isExactTitleMatch(known.matchTitle, b.title)
        )
      );
    }
  } else {
    // Generic: exact phrase intitle + plain OL title search
    const [phraseBooks, olBooks] = await Promise.all([
      softGooglePhrase(`intitle:"${trimmed.replace(/"/g, "")}"`),
      searchOpenLibrary(trimmed, 1)
        .then((r) => r.books)
        .catch(() => []),
    ]);
    recovered.push(
      ...phraseBooks.filter((b) => isExactTitleMatch(trimmed, b.title)),
      ...olBooks.filter((b) => isExactTitleMatch(trimmed, b.title))
    );
  }

  return recovered;
}
