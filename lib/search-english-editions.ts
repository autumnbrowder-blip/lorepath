import {
  editionLabelForBucket,
  getLanguageEditionBucket,
  isEnglishLanguage,
  titleSuggestsNonEnglish,
} from "@/lib/book-language";
import {
  authorKeysCompatible,
  getBookAuthorDedupeKey,
  getBookWorkDedupeKey,
  isExactTitleMatch,
  isMerchandiseOrCompanion,
  normalizeTitleForDedupe,
  parsePublishedYear,
} from "@/lib/book-utils";
import { searchGoogleBooks } from "@/lib/google-books";
import { fetchOpenLibrary } from "@/lib/open-library";
import { withTimeout } from "@/lib/provider-resilience";
import type { BookSummary } from "@/types/book";

/** Cap English lookups so one search cannot fan out into a provider storm. */
const MAX_ENGLISH_LOOKUPS_PER_PAGE = 3;
/** Whole-stage budget — primary results still return if this expires. */
const DEFAULT_ENGLISH_BUDGET_MS = 2800;
/** Per-candidate hard cap (Google or thin OL). */
const PER_LOOKUP_TIMEOUT_MS = 2500;

type OpenLibraryEditionEntry = {
  title?: string;
  key?: string;
  isbn_13?: string[];
  isbn_10?: string[];
  languages?: { key: string }[];
  covers?: number[];
  publish_date?: string;
  number_of_pages?: number;
};

function needsEnglishCompanion(book: BookSummary): boolean {
  return getLanguageEditionBucket(book) === "non-eng";
}

function hasEnglishSibling(
  book: BookSummary,
  books: BookSummary[]
): boolean {
  const workKey = getBookWorkDedupeKey(book);
  const authorKey = getBookAuthorDedupeKey(book);
  const titleKey = normalizeTitleForDedupe(book.title);

  return books.some((candidate) => {
    if (candidate.id === book.id) return false;
    if (getLanguageEditionBucket(candidate) !== "eng") return false;
    if (getBookWorkDedupeKey(candidate) === workKey) return true;

    const candidateAuthor = getBookAuthorDedupeKey(candidate);
    if (
      authorKey &&
      candidateAuthor &&
      authorKeysCompatible(authorKey, candidateAuthor) &&
      (normalizeTitleForDedupe(candidate.title) === titleKey ||
        titleSuggestsNonEnglish(book.title))
    ) {
      return true;
    }
    return false;
  });
}

function buildEnglishEditionQuery(book: BookSummary): string {
  const title = book.title.replace(/"/g, "").trim();
  const author = book.authors[0]?.replace(/"/g, "").trim();
  const nonLatin = titleSuggestsNonEnglish(title);

  if (author && author.toLowerCase() !== "unknown author") {
    if (nonLatin) {
      return `inauthor:"${author}"`;
    }
    return `intitle:"${title}" inauthor:"${author}"`;
  }
  return nonLatin ? title : `intitle:"${title}"`;
}

function asEnglishSummary(book: BookSummary): BookSummary {
  return {
    ...book,
    language: book.language?.trim() || "en",
    editionLabel: "english",
  };
}

function pickBestEnglishHit(
  original: BookSummary,
  hits: BookSummary[]
): BookSummary | null {
  const titleKey = normalizeTitleForDedupe(original.title);
  const authorKey = getBookAuthorDedupeKey(original);
  const nonLatinOriginal = titleSuggestsNonEnglish(original.title);

  const ranked = hits
    .filter((hit) => {
      if (isMerchandiseOrCompanion(hit)) return false;
      if (hit.id === original.id) return false;
      if (
        hit.language &&
        !isEnglishLanguage(hit.language) &&
        getLanguageEditionBucket(hit) === "non-eng"
      ) {
        return false;
      }
      return true;
    })
    .map((hit) => {
      let score = 0;
      if (isEnglishLanguage(hit.language)) score += 8;
      if (normalizeTitleForDedupe(hit.title) === titleKey) score += 10;
      else if (isExactTitleMatch(original.title, hit.title)) score += 6;
      else if (nonLatinOriginal && !titleSuggestsNonEnglish(hit.title)) {
        score += 4;
      }
      const hitAuthor = getBookAuthorDedupeKey(hit);
      if (
        authorKey &&
        hitAuthor &&
        authorKeysCompatible(authorKey, hitAuthor)
      ) {
        score += 8;
      }
      if (hit.description && hit.description.trim().length >= 40) score += 3;
      if (hit.coverUrl?.trim()) score += 2;
      if (hit.isbn) score += 1;
      return { hit, score };
    })
    .filter(({ score }) => score >= (nonLatinOriginal ? 12 : 10))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0]?.hit;
  return best ? asEnglishSummary(best) : null;
}

/**
 * Lightweight OL editions probe — builds a thin English card from the first
 * English edition. No follow-up Google ISBN round-trip (that belongs on detail).
 */
async function findEnglishViaOpenLibraryWorkThin(
  book: BookSummary
): Promise<BookSummary | null> {
  if (!/^ol-/i.test(book.id)) return null;
  const workId = book.id.replace(/^ol-/i, "").trim();
  if (!/^OL\d+W$/i.test(workId)) return null;

  const response = await fetchOpenLibrary(
    `https://openlibrary.org/works/${workId}/editions.json?limit=12`,
    { revalidate: 86400, timeoutMs: PER_LOOKUP_TIMEOUT_MS }
  );
  if (!response.ok) return null;

  const data: { entries?: OpenLibraryEditionEntry[] } = await response.json();
  const entry = (data.entries ?? []).find((candidate) =>
    (candidate.languages ?? []).some((language) =>
      /\/languages\/eng$/i.test(language.key)
    )
  );
  if (!entry) return null;

  const isbn =
    entry.isbn_13?.find((value) => value.replace(/\D/g, "").length >= 10) ??
    entry.isbn_10?.find((value) => value.replace(/\D/g, "").length >= 10) ??
    null;
  const editionKey = entry.key?.replace(/^\/books\//, "") ?? null;
  if (!editionKey && !entry.title && !isbn) return null;

  const coverId = entry.covers?.find((id) => id > 0);

  return asEnglishSummary({
    id: editionKey
      ? `ol-${editionKey}`
      : isbn
        ? `isbndb-${isbn.replace(/\D/g, "")}`
        : `${book.id}-en`,
    title: entry.title?.trim() || book.title,
    authors: book.authors,
    coverUrl: coverId
      ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`
      : null,
    description: null,
    genres: book.genres,
    publishedYear: parsePublishedYear(entry.publish_date),
    source: editionKey ? "openlibrary" : "isbndb",
    isbn,
    pageCount: entry.number_of_pages ?? null,
    language: "en",
  });
}

async function findEnglishViaGoogle(
  book: BookSummary
): Promise<BookSummary | null> {
  const query = buildEnglishEditionQuery(book);
  const result = await searchGoogleBooks(query, 1, {
    langRestrict: "en",
    pageSize: 5,
  });
  return pickBestEnglishHit(book, result.books);
}

/**
 * Resolve one English companion with a hard per-candidate timeout.
 * Google and thin OL run in parallel; first usable hit wins.
 */
async function resolveEnglishEdition(
  original: BookSummary
): Promise<BookSummary | null> {
  const tasks: Promise<BookSummary | null>[] = [
    findEnglishViaGoogle(original).catch(() => null),
  ];
  if (/^ol-/i.test(original.id)) {
    tasks.push(findEnglishViaOpenLibraryWorkThin(original).catch(() => null));
  }

  const settled = await Promise.allSettled(tasks);
  const hits = settled
    .filter(
      (result): result is PromiseFulfilledResult<BookSummary | null> =>
        result.status === "fulfilled"
    )
    .map((result) => result.value)
    .filter((hit): hit is BookSummary => Boolean(hit));

  if (hits.length === 0) return null;

  // Prefer Google metadata (usually has description/cover) over thin OL.
  const googleHit = hits.find((hit) => hit.source === "google");
  return googleHit ?? hits[0] ?? null;
}

/**
 * Label original + English cards when both appear for the same work.
 * Leaves unlabeled singles alone.
 */
export function labelOriginalAndEnglishEditions(
  books: BookSummary[]
): BookSummary[] {
  const byWork = new Map<string, BookSummary[]>();

  for (const book of books) {
    const key = getBookWorkDedupeKey(book);
    const list = byWork.get(key) ?? [];
    list.push(book);
    byWork.set(key, list);
  }

  const labeledIds = new Map<string, "original" | "english">();

  for (const group of Array.from(byWork.values())) {
    const hasEng = group.some(
      (b: BookSummary) => getLanguageEditionBucket(b) === "eng"
    );
    const hasOrig = group.some(
      (b: BookSummary) => getLanguageEditionBucket(b) === "non-eng"
    );
    if (!hasEng || !hasOrig) continue;

    for (const book of group) {
      const label = editionLabelForBucket(getLanguageEditionBucket(book));
      if (label) labeledIds.set(book.id, label);
    }
  }

  if (labeledIds.size === 0) return books;

  return books.map((book) => {
    const label = labeledIds.get(book.id);
    if (!label) return book;
    return { ...book, editionLabel: label };
  });
}

export type AttachEnglishEditionsOptions = {
  debug?: boolean;
  /** Whole-stage budget in ms (default 2800). */
  budgetMs?: number;
};

/**
 * For non-English search hits only, try to find a matching English edition and
 * return BOTH. Never replaces the original. Soft-fails on timeout so primary
 * search results still return.
 */
export async function attachEnglishEditions(
  books: BookSummary[],
  options?: AttachEnglishEditionsOptions
): Promise<BookSummary[]> {
  const budgetMs = options?.budgetMs ?? DEFAULT_ENGLISH_BUDGET_MS;

  const run = async (): Promise<BookSummary[]> => {
    const candidates = books.filter(
      (book) => needsEnglishCompanion(book) && !hasEnglishSibling(book, books)
    );

    if (candidates.length === 0) {
      return labelOriginalAndEnglishEditions(books);
    }

    const lookups = candidates.slice(0, MAX_ENGLISH_LOOKUPS_PER_PAGE);
    const englishExtras: BookSummary[] = [];
    const pairedOriginalIds = new Set<string>();
    const seenIds = new Set(books.map((book) => book.id));
    const seenIsbns = new Set(
      books
        .map((book) => book.isbn?.replace(/\D/g, "") ?? "")
        .filter((isbn) => isbn.length >= 10)
    );

    const settled = await Promise.allSettled(
      lookups.map(async (original) => {
        const english = await withTimeout(
          resolveEnglishEdition(original),
          PER_LOOKUP_TIMEOUT_MS,
          `english-edition:${original.id}`
        ).catch(() => null);

        if (!english) return null;
        return { originalId: original.id, english };
      })
    );

    for (const result of settled) {
      if (result.status !== "fulfilled" || !result.value) continue;
      const { originalId, english } = result.value;
      if (seenIds.has(english.id)) continue;
      const isbnDigits = english.isbn?.replace(/\D/g, "") ?? "";
      if (isbnDigits.length >= 10 && seenIsbns.has(isbnDigits)) continue;

      seenIds.add(english.id);
      if (isbnDigits.length >= 10) seenIsbns.add(isbnDigits);
      englishExtras.push(english);
      pairedOriginalIds.add(originalId);
    }

    if (options?.debug && englishExtras.length > 0) {
      console.info("[attachEnglishEditions] added English editions", {
        originalsChecked: lookups.length,
        englishAdded: englishExtras.length,
        ids: englishExtras.map((book) => book.id),
      });
    }

    const withOriginalLabels = books.map((book) => {
      if (pairedOriginalIds.has(book.id)) {
        return { ...book, editionLabel: "original" as const };
      }
      return book;
    });

    return labelOriginalAndEnglishEditions([
      ...withOriginalLabels,
      ...englishExtras,
    ]);
  };

  try {
    return await withTimeout(run(), budgetMs, "attachEnglishEditions");
  } catch (error) {
    if (options?.debug) {
      console.info("[attachEnglishEditions] budget exceeded — keeping primary", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    // Primary results still win; labels for any existing eng/non-eng pairs only.
    return labelOriginalAndEnglishEditions(books);
  }
}
