import {
  isFinishedRead,
  selectImportCandidates,
  type GoodreadsCsvRow,
} from "@/lib/goodreads-csv";
import {
  getBookDedupeKey,
  getBookIsbnKey,
  normalizeAuthorForDedupe,
  normalizeIsbn,
  normalizeTitleForDedupe,
  rankSearchResults,
} from "@/lib/book-utils";
import { searchBooks } from "@/lib/books";
import { getGoogleBookByIsbn, RateLimitError } from "@/lib/google-books";
import {
  getOpenLibraryBookByIsbn,
  getOpenLibraryBookByTitle,
} from "@/lib/open-library";
import type { BookSummary } from "@/types/book";

export type ImportMatchMethod = "isbn" | "title_author";

export type MatchedImportBook = {
  book: BookSummary;
  csvTitle: string;
  csvAuthor: string;
  shelfLabel: string | null;
  dateRead: string | null;
  alreadyRated: boolean;
  matchMethod: ImportMatchMethod;
};

export type UnmatchedImportBook = {
  title: string;
  author: string;
  shelfLabel: string | null;
  dateRead: string | null;
};

export type GoodreadsMatchResult = {
  matched: MatchedImportBook[];
  unmatched: UnmatchedImportBook[];
  stats: {
    csvRows: number;
    candidates: number;
    matched: number;
    unmatched: number;
    alreadyRated: number;
    preferredReadShelf: boolean;
    capped: boolean;
  };
};

const MAX_MATCH_ATTEMPTS = 50;
const MAX_MATCHED = 50;
const CONCURRENCY = 3;

function shelfLabelFor(row: GoodreadsCsvRow): string | null {
  const exclusive = row.exclusiveShelf?.trim();
  if (exclusive) {
    if (exclusive.toLowerCase() === "read") return "Read";
    return exclusive;
  }
  const shelves = row.bookshelves?.trim();
  return shelves || null;
}

function pickIsbn(row: GoodreadsCsvRow): string | null {
  return normalizeIsbn(row.isbn13) ?? normalizeIsbn(row.isbn);
}

/** Strip "Last, First" → "First Last" when Goodreads used Author l-f style. */
function authorForSearch(author: string): string {
  const trimmed = author.trim();
  if (!trimmed.includes(",")) return trimmed;
  const [last, ...rest] = trimmed.split(",");
  const first = rest.join(",").trim();
  if (first && last.trim()) return `${first} ${last.trim()}`.replace(/\s+/g, " ");
  return trimmed;
}

function titlesLookAlike(csvTitle: string, bookTitle: string): boolean {
  const a = normalizeTitleForDedupe(csvTitle);
  const b = normalizeTitleForDedupe(bookTitle);
  if (!a || !b) return false;
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
}

function authorsLookAlike(csvAuthor: string, bookAuthors: string[]): boolean {
  const csvKey = normalizeAuthorForDedupe(authorForSearch(csvAuthor));
  if (!csvKey) return true; // unknown author — don't block
  return bookAuthors.some((name) => {
    const key = normalizeAuthorForDedupe(name);
    if (!key) return false;
    return key === csvKey || key.includes(csvKey) || csvKey.includes(key);
  });
}

async function resolveByIsbn(isbn: string): Promise<BookSummary | null> {
  try {
    const google = await getGoogleBookByIsbn(isbn);
    if (google) return google;
  } catch (err) {
    if (!(err instanceof RateLimitError)) {
      // Soft-fail — try Open Library next
    }
  }

  try {
    const ol = await getOpenLibraryBookByIsbn(isbn);
    if (ol) return ol;
  } catch {
    // Soft-fail
  }

  return null;
}

async function resolveByTitleAuthor(
  title: string,
  author: string
): Promise<BookSummary | null> {
  const searchAuthor = authorForSearch(author);

  try {
    const ol = await getOpenLibraryBookByTitle(
      title,
      searchAuthor && searchAuthor !== "Unknown author" ? [searchAuthor] : []
    );
    if (
      ol &&
      titlesLookAlike(title, ol.title) &&
      authorsLookAlike(author, ol.authors)
    ) {
      return ol;
    }
  } catch {
    // Soft-fail into searchBooks
  }

  const query = [title, searchAuthor !== "Unknown author" ? searchAuthor : ""]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (!query) return null;

  try {
    const result = await searchBooks(query, 1);
    const ranked = rankSearchResults(result.books, query);
    const best = ranked.find(
      (book) =>
        titlesLookAlike(title, book.title) &&
        authorsLookAlike(author, book.authors)
    );
    return best ?? null;
  } catch {
    return null;
  }
}

async function matchRow(row: GoodreadsCsvRow): Promise<{
  book: BookSummary | null;
  method: ImportMatchMethod | null;
}> {
  const isbn = pickIsbn(row);
  if (isbn) {
    const byIsbn = await resolveByIsbn(isbn);
    if (byIsbn) return { book: byIsbn, method: "isbn" };
  }

  const byTitle = await resolveByTitleAuthor(row.title, row.author);
  if (byTitle) return { book: byTitle, method: "title_author" };

  return { book: null, method: null };
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

export async function matchGoodreadsRows(
  rows: GoodreadsCsvRow[],
  ratedSlugs: Set<string>,
  ratedIsbns: Set<string> = new Set()
): Promise<GoodreadsMatchResult> {
  const { candidates, preferredReadShelf } = selectImportCandidates(rows);
  const capped = candidates.length > MAX_MATCH_ATTEMPTS;
  const toMatch = candidates.slice(0, MAX_MATCH_ATTEMPTS);

  const settled = await mapPool(toMatch, CONCURRENCY, async (row) => {
    const { book, method } = await matchRow(row);
    return { row, book, method };
  });

  const matched: MatchedImportBook[] = [];
  const unmatched: UnmatchedImportBook[] = [];
  const seenKeys = new Set<string>();

  for (const item of settled) {
    const label = shelfLabelFor(item.row);

    if (!item.book || !item.method) {
      unmatched.push({
        title: item.row.title,
        author: item.row.author,
        shelfLabel: label,
        dateRead: item.row.dateRead,
      });
      continue;
    }

    const dedupeKey =
      getBookIsbnKey(item.book) ?? getBookDedupeKey(item.book);
    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);

    const isbnKey = getBookIsbnKey(item.book);
    const alreadyRated =
      ratedSlugs.has(item.book.id) ||
      (isbnKey != null && ratedIsbns.has(isbnKey));

    matched.push({
      book: item.book,
      csvTitle: item.row.title,
      csvAuthor: item.row.author,
      shelfLabel: preferredReadShelf
        ? isFinishedRead(item.row)
          ? "Read"
          : label
        : label,
      dateRead: item.row.dateRead,
      alreadyRated,
      matchMethod: item.method,
    });

    if (matched.length >= MAX_MATCHED) break;
  }

  // Remaining candidates beyond cap that weren't attempted → unmatched note
  // is implied by stats.capped; don't flood unmatched with unprocessed rows.

  // Sort: not-yet-rated first, then already marked
  matched.sort((a, b) => Number(a.alreadyRated) - Number(b.alreadyRated));

  return {
    matched,
    unmatched,
    stats: {
      csvRows: rows.length,
      candidates: candidates.length,
      matched: matched.length,
      unmatched: unmatched.length,
      alreadyRated: matched.filter((m) => m.alreadyRated).length,
      preferredReadShelf,
      capped,
    },
  };
}
