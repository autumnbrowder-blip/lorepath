/**
 * Verify Between Two Fires title-search fix.
 * Run: npx tsx --env-file=.env.local scripts/probe-btf-verify.ts
 */
import { writeFileSync } from "fs";
import { searchGoogleBooks } from "../lib/google-books";
import { searchOpenLibrary } from "../lib/open-library";
import { searchGutendex } from "../lib/gutendex";
import { searchBigBook, isBigBookConfigured } from "../lib/big-book";
import { finalizeSearchBooks } from "../lib/search-finalize";
import {
  isAuthorQuery,
  isExactTitleMatch,
  rankSearchResults,
} from "../lib/book-utils";
import { fetchTitleSearchFallbacks } from "../lib/search-title-fallback";
import type { BookSummary } from "../types/book";

const Q = "Between Two Fires";

function top(books: BookSummary[], n = 5) {
  return books.slice(0, n).map((b, i) => ({
    rank: i + 1,
    title: b.title,
    authors: b.authors,
    source: b.source,
    exact: isExactTitleMatch(Q, b.title),
    id: b.id,
  }));
}

async function main() {
  const lines: string[] = [];
  const log = (x: unknown) => {
    const s = typeof x === "string" ? x : JSON.stringify(x, null, 2);
    lines.push(s);
    console.log(s);
  };

  log("=== CONFIRMATIONS ===");
  log({
    "isAuthorQuery(Between Two Fires)": isAuthorQuery(Q),
    "isAuthorQuery(Christopher Buehlman)": isAuthorQuery("Christopher Buehlman"),
    "isAuthorQuery(Buehlman)": isAuthorQuery("Buehlman"),
    expect_BTF_false: isAuthorQuery(Q) === false,
  });

  const [g, ol, gu, bb] = await Promise.allSettled([
    searchGoogleBooks(Q, 1),
    searchOpenLibrary(Q, 1),
    searchGutendex(Q, 1),
    isBigBookConfigured()
      ? searchBigBook(Q, 1)
      : Promise.resolve({ books: [] as BookSummary[], hasMore: false }),
  ]);

  const googleBooks = g.status === "fulfilled" ? g.value.books : [];
  const olBooks = ol.status === "fulfilled" ? ol.value.books : [];
  const guBooks = gu.status === "fulfilled" ? gu.value.books : [];
  const bbBooks =
    bb.status === "fulfilled"
      ? (bb.value as { books: BookSummary[] }).books
      : [];

  const sourceCounts = {
    google: googleBooks.length,
    openlibrary: olBooks.length,
    gutendex: guBooks.length,
    ...(isBigBookConfigured() || bbBooks.length > 0
      ? { bigbook: bbBooks.length }
      : {}),
  };

  log("\n=== sourceCounts (provider raw for q=Between Two Fires) ===");
  log({
    sourceCounts,
    googleError: g.status === "fulfilled" ? g.value.error : String(g.reason),
    googleUsesTitleNotAuthor:
      g.status === "fulfilled" &&
      // If we got Buehlman or any Between Two Fires, title search worked
      (googleBooks.some((b) => isExactTitleMatch(Q, b.title)) ||
        googleBooks.length === 0),
    olExactBuehlman: olBooks.filter(
      (b) =>
        isExactTitleMatch(Q, b.title) &&
        b.authors.some((a) => /buehlman/i.test(a))
    ).map((b) => ({ title: b.title, authors: b.authors, id: b.id })),
  });

  const raw = [...olBooks, ...googleBooks, ...guBooks, ...bbBooks];
  let finalized = finalizeSearchBooks(raw, { query: Q, debug: true });
  const fallback = await fetchTitleSearchFallbacks(Q, finalized);
  if (fallback.length) {
    finalized = finalizeSearchBooks([...finalized, ...fallback], { query: Q });
  }
  const ranked = rankSearchResults(finalized, Q);

  log("\n=== Pipeline ===");
  log({
    raw: raw.length,
    fallbackHits: fallback.length,
    finalized: finalized.length,
    top5: top(ranked, 5),
    buehlmanOnPage1: ranked.slice(0, 10).some(
      (b) =>
        isExactTitleMatch(Q, b.title) &&
        b.authors.some((a) => /buehlman/i.test(a))
    ),
    buehlmanRank:
      ranked.findIndex(
        (b) =>
          isExactTitleMatch(Q, b.title) &&
          b.authors.some((a) => /buehlman/i.test(a))
      ) + 1 || null,
  });

  writeFileSync("scripts/probe-btf-verify-out.txt", lines.join("\n"), "utf8");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
