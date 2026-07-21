import type { BookSummary } from "@/types/book";

/**
 * BookCover API (https://bookcover.longitood.com) — keyless service that
 * resolves Goodreads cover image URLs by ISBN-13 or title + author.
 * Used only as cover enrichment/fallback; never a search source of its own.
 *
 * Contract (verified against https://github.com/w3slley/bookcover-api):
 *   GET /bookcover?isbn=<isbn13>
 *   GET /bookcover?book_title=<title>&author_name=<author>
 *   200 → { "url": "https://..." } ; 400/404/429 → { error } (JSON)
 */
const BOOKCOVER_API_URL = "https://bookcover.longitood.com/bookcover";

/** Keep this short — cover enrichment must never stall the whole search. */
const FETCH_TIMEOUT_MS = 4000;

/** Max books per search page we try to enrich with a fallback cover. */
const MAX_ENRICH_CANDIDATES = 5;

/** Max lookups in flight at once — one wave, so worst case adds one timeout. */
const CONCURRENCY = 5;

type BookcoverResponse = {
  url?: string | null;
};

function isValidCoverUrl(url: unknown): url is string {
  return (
    typeof url === "string" && /^https:\/\/[^\s]+\.(jpe?g|png|webp)/i.test(url)
  );
}

async function fetchBookcover(params: URLSearchParams): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${BOOKCOVER_API_URL}?${params.toString()}`,
      {
        headers: { Accept: "application/json" },
        // Covers are stable — cache to avoid hammering the free service.
        next: { revalidate: 86400 },
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      // 404 = no cover found; anything else is worth a log line.
      if (response.status !== 404) {
        console.warn("[bookcover] lookup failed", {
          status: response.status,
          params: params.toString(),
        });
      }
      return null;
    }

    const data = (await response.json()) as BookcoverResponse;
    return isValidCoverUrl(data.url) ? data.url : null;
  } catch (error) {
    const aborted =
      error instanceof Error &&
      (error.name === "AbortError" || /abort/i.test(error.message));
    console.warn(
      aborted
        ? `[bookcover] lookup timed out after ${FETCH_TIMEOUT_MS}ms`
        : "[bookcover] lookup error:",
      aborted ? params.toString() : error
    );
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Look up a cover by ISBN-13 (the API only supports 13-digit ISBNs). */
export async function fetchCoverByIsbn(isbn: string): Promise<string | null> {
  const digits = isbn.replace(/\D/g, "");
  if (digits.length !== 13) return null;
  return fetchBookcover(new URLSearchParams({ isbn: digits }));
}

/** Look up a cover by title + author. */
export async function fetchCoverByTitleAuthor(
  title: string,
  author: string
): Promise<string | null> {
  const bookTitle = title.trim();
  const authorName = author.trim();
  if (!bookTitle || !authorName) return null;
  return fetchBookcover(
    new URLSearchParams({ book_title: bookTitle, author_name: authorName })
  );
}

/** Best-effort cover for a book — ISBN first, then title + author. */
export async function fetchCoverForBook(
  book: Pick<BookSummary, "title" | "authors" | "isbn">
): Promise<string | null> {
  if (book.isbn) {
    const byIsbn = await fetchCoverByIsbn(book.isbn);
    if (byIsbn) return byIsbn;
  }

  const author = book.authors[0];
  if (author && author !== "Unknown author") {
    return fetchCoverByTitleAuthor(book.title, author);
  }

  return null;
}

function needsCover(book: BookSummary): boolean {
  return !book.coverUrl?.trim();
}

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<void>
): Promise<void> {
  let index = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (index < items.length) {
        const item = items[index++];
        await task(item);
      }
    }
  );
  await Promise.all(workers);
}

/**
 * Fill in missing covers on search results using the BookCover API.
 * Bounded (candidate count + concurrency + per-request timeout) so a slow or
 * down service can only delay a search by roughly one timeout window.
 * Always resolves — failures leave books unchanged.
 */
export async function enrichBooksWithCovers(
  books: BookSummary[]
): Promise<BookSummary[]> {
  const candidates = books.filter(needsCover).slice(0, MAX_ENRICH_CANDIDATES);
  if (candidates.length === 0) return books;

  const found = new Map<string, string>();

  await mapWithConcurrency(candidates, CONCURRENCY, async (book) => {
    const cover = await fetchCoverForBook(book);
    if (cover) found.set(book.id, cover);
  });

  if (found.size === 0) return books;

  console.info("[bookcover] enriched covers", {
    candidates: candidates.length,
    found: found.size,
  });

  return books.map((book) => {
    const cover = found.get(book.id);
    return cover ? { ...book, coverUrl: cover } : book;
  });
}
