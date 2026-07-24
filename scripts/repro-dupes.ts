/**
 * Empirical duplicate repro: runs the real provider pipeline the same way
 * lib/books.ts#searchBooks does, then reports any finalized results that
 * still look like duplicates (same normalized title, or same dedupe key).
 * Run: npx tsx --env-file=.env.local scripts/repro-dupes.ts
 */
import { searchBigBook } from "../lib/big-book";
import { searchGoogleBooks } from "../lib/google-books";
import { searchGutendex } from "../lib/gutendex";
import { searchIsbndb } from "../lib/isbndb";
import { searchOpenLibrary } from "../lib/open-library";
import { finalizeSearchBooks } from "../lib/search-finalize";
import {
  getBookDedupeKey,
  getBookIsbnKey,
  normalizeTitleForDedupe,
} from "../lib/book-utils";
import type { BookSummary } from "../types/book";

function summarize(b: BookSummary) {
  return {
    id: b.id,
    source: b.source,
    title: b.title,
    authors: b.authors,
    isbn: b.isbn ?? null,
    isbnKey: getBookIsbnKey(b),
    year: b.publishedYear,
    hasDesc: Boolean(b.description?.trim()),
    hasCover: Boolean(b.coverUrl?.trim()),
    dedupeKey: getBookDedupeKey(b),
  };
}

async function fetchPage(query: string, page: number): Promise<BookSummary[]> {
  const settled = await Promise.allSettled([
    searchGoogleBooks(query, page),
    searchOpenLibrary(query, page),
    searchGutendex(query, page),
    searchIsbndb(query, page),
    searchBigBook(query, page),
  ]);
  const books: BookSummary[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") books.push(...result.value.books);
    else console.error("  provider rejected:", String(result.reason).slice(0, 200));
  }
  return books;
}

function reportDuplicates(label: string, books: BookSummary[]) {
  const byTitle = new Map<string, BookSummary[]>();
  for (const b of books) {
    const t = normalizeTitleForDedupe(b.title);
    byTitle.set(t, [...(byTitle.get(t) ?? []), b]);
  }
  let dupeGroups = 0;
  for (const [t, group] of Array.from(byTitle.entries())) {
    if (group.length < 2) continue;
    dupeGroups++;
    console.log(`  DUPLICATE normalized title "${t}" (${group.length} records):`);
    for (const b of group) console.log("   ", JSON.stringify(summarize(b)));
  }
  console.log(
    `  ${label}: ${books.length} results, ${dupeGroups} same-title group(s)`
  );
  console.log("  full list:");
  for (const b of books) {
    console.log(
      `    [${b.source}] "${b.title}" — ${b.authors.join("; ")} (key: ${getBookDedupeKey(b)})`
    );
  }
  console.log("");
}

async function run(query: string) {
  console.log(`=== query: "${query}" ===`);
  const page1 = await fetchPage(query, 1);
  const finalized1 = finalizeSearchBooks(page1);
  reportDuplicates("page 1 finalized", finalized1);

  // Client Load More path: finalize(existing + incoming page 2)
  const page2 = await fetchPage(query, 2);
  const merged = finalizeSearchBooks([...finalized1, ...page2]);
  reportDuplicates("after load-more merge", merged);
}

const queries = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["The Wren in the Holly Library", "wren holly library", "dune", "fourth wing"];

async function main() {
  for (const q of queries) {
    await run(q);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
