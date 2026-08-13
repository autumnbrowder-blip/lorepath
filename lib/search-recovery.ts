import { getGoogleBookByIsbn, searchGoogleBooks } from "@/lib/google-books";
import {
  knownWorkCatalogSeed,
  knownWorkMatchesQuery,
  type KnownWorkEditions,
} from "@/lib/known-editions";
import { getOpenLibraryBookByIsbn, searchOpenLibrary } from "@/lib/open-library";
import { withTimeout } from "@/lib/provider-resilience";
import { isExactTitleMatch } from "@/lib/book-utils";
import type { BookDetail, BookSummary } from "@/types/book";

function detailToSummary(detail: BookDetail): BookSummary {
  return {
    id: detail.id,
    title: detail.title,
    authors: detail.authors,
    coverUrl: detail.coverUrl,
    description: detail.description,
    genres: detail.genres,
    publishedYear: detail.publishedYear,
    firstPublishYear: detail.firstPublishYear ?? null,
    latestEditionYear: detail.latestEditionYear ?? null,
    source: detail.source,
    isbn: detail.isbn,
    pageCount: detail.pageCount,
    language: detail.language,
  };
}

async function softGoogleIsbn(isbn: string): Promise<BookSummary | null> {
  try {
    const detail = await withTimeout(
      getGoogleBookByIsbn(isbn),
      2000,
      `google-isbn:${isbn}`
    );
    return detail ? detailToSummary(detail) : null;
  } catch {
    return null;
  }
}

async function softOlIsbn(isbn: string): Promise<BookSummary | null> {
  try {
    const detail = await withTimeout(
      getOpenLibraryBookByIsbn(isbn),
      2000,
      `ol-isbn:${isbn}`
    );
    return detail ? detailToSummary(detail) : null;
  } catch {
    return null;
  }
}

async function softGooglePhrase(query: string): Promise<BookSummary[]> {
  try {
    const page = await withTimeout(
      searchGoogleBooks(query, 1, { pageSize: 10 }),
      2000,
      "google-phrase-recovery"
    );
    return page.books;
  } catch {
    return [];
  }
}

async function softOlTitle(query: string): Promise<BookSummary[]> {
  try {
    const page = await withTimeout(
      searchOpenLibrary(query, 1),
      2000,
      "ol-title-recovery"
    );
    return page.books;
  } catch {
    return [];
  }
}

function matchesKnownTitle(
  book: BookSummary,
  entry: KnownWorkEditions
): boolean {
  const titles = [entry.matchTitle, ...(entry.altTitles ?? [])];
  return titles.some((title) => isExactTitleMatch(title, book.title));
}

function hasPreferredEnglishTitle(
  books: BookSummary[],
  entry: KnownWorkEditions
): boolean {
  return books.some((book) => isExactTitleMatch(entry.matchTitle, book.title));
}

/**
 * Guaranteed recovery for popular titles. Ensures English editions of known
 * translated works appear even when Google is 429'd and only a foreign-language
 * OL hit survived the flood.
 */
export async function recoverPopularTitleHits(
  query: string,
  existing: BookSummary[],
  options?: { debug?: boolean }
): Promise<BookSummary[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const known = knownWorkMatchesQuery(trimmed);
  const recovered: BookSummary[] = [];
  const seen = new Set(existing.map((book) => book.id));

  function push(book: BookSummary | null | undefined) {
    if (!book?.title?.trim()) return;
    if (seen.has(book.id)) return;
    seen.add(book.id);
    recovered.push(book);
  }

  if (known) {
    const needsEnglish = !hasPreferredEnglishTitle(
      [...existing, ...recovered],
      known
    );
    const needsOriginal =
      Boolean(known.originalLanguage) &&
      !existing.some(
        (book) =>
          (known.altTitles ?? []).some((alt) =>
            isExactTitleMatch(alt, book.title)
          ) || book.editionLabel === "original"
      );

    // Live lookups first (best metadata), then catalog seeds as guarantees.
    if (needsEnglish || needsOriginal || existing.length === 0) {
      const englishIsbns = known.isbns.slice(0, 2);
      const originalIsbns = (known.originalLanguageIsbns ?? []).slice(0, 1);

      const settled = await Promise.allSettled([
        softGooglePhrase(known.googlePhrase),
        softOlTitle(known.matchTitle),
        ...(known.altTitles ?? []).slice(0, 1).map((title) => softOlTitle(title)),
        ...englishIsbns.map(async (isbn) => ({
          book: (await softGoogleIsbn(isbn)) ?? (await softOlIsbn(isbn)),
          kind: "english" as const,
        })),
        ...originalIsbns.map(async (isbn) => ({
          book: (await softGoogleIsbn(isbn)) ?? (await softOlIsbn(isbn)),
          kind: "original" as const,
        })),
      ]);

      for (const result of settled) {
        if (result.status !== "fulfilled") continue;
        const value = result.value;
        if (Array.isArray(value)) {
          for (const book of value) {
            if (matchesKnownTitle(book, known)) push(book);
          }
        } else if (value && "book" in value && value.book) {
          push({
            ...value.book,
            language:
              value.kind === "original"
                ? value.book.language || known.originalLanguage || "es"
                : value.book.language || "en",
            editionLabel:
              value.kind === "original"
                ? "original"
                : known.originalLanguage
                  ? "english"
                  : value.book.editionLabel,
          });
        }
      }
    }

    // Catalog seeds — never optional for known works missing English/original.
    if (!hasPreferredEnglishTitle([...existing, ...recovered], known)) {
      push(knownWorkCatalogSeed(known, "english"));
    }
    if (
      known.originalLanguage &&
      !([...existing, ...recovered] as BookSummary[]).some(
        (book) =>
          book.editionLabel === "original" ||
          (known.altTitles ?? []).some((alt) =>
            isExactTitleMatch(alt, book.title)
          )
      )
    ) {
      push(knownWorkCatalogSeed(known, "original"));
    }
  } else if (existing.length === 0 && trimmed.split(/\s+/).length >= 2) {
    const plain = trimmed.replace(/"/g, "");
    const settled = await Promise.allSettled([
      softGooglePhrase(`intitle:"${plain}"`),
      softOlTitle(plain),
    ]);
    for (const result of settled) {
      if (result.status !== "fulfilled") continue;
      for (const book of result.value) {
        if (isExactTitleMatch(plain, book.title)) push(book);
      }
    }
  }

  if (options?.debug) {
    console.info("[searchRecovery]", {
      query: trimmed,
      known: known?.matchTitle ?? null,
      recovered: recovered.length,
      titles: recovered.slice(0, 6).map((book) => ({
        t: book.title,
        label: book.editionLabel,
        id: book.id,
      })),
    });
  }

  return recovered;
}
