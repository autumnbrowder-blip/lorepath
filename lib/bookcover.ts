import { enrichBooksWithCovers as enrichFromResolver } from "@/lib/cover-resolve";
import type { BookSummary } from "@/types/book";

/**
 * Search-result cover backfill.
 * Uses the shared cover resolver (provider → OL ISBN → OL OLID) with no
 * network calls, so enrichment cannot stall Browse when a provider is slow.
 */
export async function enrichBooksWithCovers(
  books: BookSummary[]
): Promise<BookSummary[]> {
  return enrichFromResolver(books);
}
