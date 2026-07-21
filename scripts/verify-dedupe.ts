/**
 * Temporary verification for the shared dedupe helper.
 * Run: npx tsx scripts/verify-dedupe.ts
 */
import { finalizeSearchBooks } from "../lib/search-finalize";
import {
  dedupeBooks,
  getBookDedupeKey,
  normalizeAuthorForDedupe,
  normalizeTitleForDedupe,
  pickPreferredDuplicate,
} from "../lib/book-utils";
import type { BookSummary } from "../types/book";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  PASS ${name}`);
  } else {
    failures++;
    console.error(`  FAIL ${name}\n    expected: ${e}\n    actual:   ${a}`);
  }
}

function book(overrides: Partial<BookSummary> & { id: string }): BookSummary {
  return {
    title: "Untitled",
    authors: ["Unknown author"],
    coverUrl: null,
    description: null,
    genres: [],
    publishedYear: null,
    source: "google",
    isbn: null,
    pageCount: null,
    ...overrides,
  };
}

console.log("1. Normalization + key");
check(
  "leading article stripped",
  normalizeTitleForDedupe("The Wren in the Holly Library"),
  normalizeTitleForDedupe("Wren in the Holly Library")
);
check(
  "punctuation/case",
  normalizeTitleForDedupe("The Wren, in the Holly-Library!"),
  "wren in the holly library"
);
check("diacritics fold", normalizeTitleForDedupe("Café Brontë"), "cafe bronte");
check(
  "author punctuation/diacritics",
  normalizeAuthorForDedupe("K.A. Linde-Brontë"),
  "k a linde bronte"
);
check(
  "article-only title survives",
  normalizeTitleForDedupe("It") !== "" && normalizeTitleForDedupe("A") !== "",
  true
);

const wrenA = book({
  id: "google-wren",
  title: "The Wren in the Holly Library",
  authors: ["K.A. Linde"],
  isbn: "9781637895757",
});
const wrenB = book({
  id: "openlibrary-wren",
  title: "Wren in the Holly Library",
  authors: ["K. A. Linde"],
  isbn: "9781637895740",
  source: "openlibrary",
});
check(
  "Wren: same key despite article/ISBN diff",
  getBookDedupeKey(wrenA),
  getBookDedupeKey(wrenB)
);

console.log("2. Winner priority (description > cover > year > metadata)");
const noDesc = book({ id: "a", coverUrl: "x.jpg", publishedYear: 2024 });
const withDesc = book({ id: "b", description: "A story." });
check("description wins over cover+year", pickPreferredDuplicate(noDesc, withDesc).id, "b");

const descOnly = book({ id: "c", description: "A story." });
const descCover = book({ id: "d", description: "A story.", coverUrl: "y.jpg" });
check("cover breaks description tie", pickPreferredDuplicate(descOnly, descCover).id, "d");

const older = book({ id: "e", description: "d", coverUrl: "c", publishedYear: 2023 });
const newer = book({ id: "f", description: "d", coverUrl: "c", publishedYear: 2024 });
check("newer year breaks cover tie", pickPreferredDuplicate(older, newer).id, "f");

const sparse = book({ id: "g", description: "d", coverUrl: "c", publishedYear: 2024 });
const rich = book({
  id: "h",
  description: "d",
  coverUrl: "c",
  publishedYear: 2024,
  pageCount: 384,
  genres: ["Fantasy"],
  isbn: "9781637895757",
});
check("metadata completeness breaks year tie", pickPreferredDuplicate(sparse, rich).id, "h");

console.log("3. finalizeSearchBooks end-to-end (server path)");
const wrenRich = book({
  id: "google-wren",
  title: "The Wren in the Holly Library",
  authors: ["K.A. Linde"],
  description: "A monster-filled Manhattan fantasy.",
  publishedYear: 2024,
  isbn: "9781637895757",
});
const wrenCoverOnly = book({
  id: "openlibrary-wren",
  title: "Wren in the Holly Library",
  authors: ["K. A. Linde"],
  coverUrl: "https://covers.example/wren.jpg",
  publishedYear: 2023,
  pageCount: 384,
  isbn: "9781637895740",
  source: "openlibrary",
});
const finalized = finalizeSearchBooks([wrenRich, wrenCoverOnly]);
check("Wren editions collapse to one record", finalized.length, 1);
check("winner identity kept (description wins)", finalized[0]?.id, "google-wren");
check("cover filled from losing edition", finalized[0]?.coverUrl, "https://covers.example/wren.jpg");
check("page count filled from losing edition", finalized[0]?.pageCount, 384);
check("newest year kept", finalized[0]?.publishedYear, 2024);
check("winner ISBN kept", finalized[0]?.isbn, "9781637895757");

console.log("4. Client load-more path (same shared helper)");
const existing = finalizeSearchBooks([wrenRich]);
const loadMoreMerged = finalizeSearchBooks([...existing, wrenCoverOnly]);
check("load-more merge dedupes to one", loadMoreMerged.length, 1);
check("load-more merge fills cover", Boolean(loadMoreMerged[0]?.coverUrl), true);

console.log("5. Unknown-author safety");
const unknownA = book({
  id: "g1",
  title: "Collected Poems",
  description: "One anthology.",
});
const unknownB = book({
  id: "g2",
  title: "Collected Poems",
  description: "A different anthology.",
  source: "gutendex",
});
check(
  "same-title unknown-author books do NOT collapse",
  finalizeSearchBooks([unknownA, unknownB]).length,
  2
);
const unknownIsbn1 = book({
  id: "i1",
  title: "Collected Poems",
  description: "Same edition.",
  isbn: "9781637895757",
});
const unknownIsbn2 = book({
  id: "i2",
  title: "Collected Poems",
  coverUrl: "z.jpg",
  isbn: "978-1-63789-575-7",
  source: "openlibrary",
});
check(
  "unknown-author but matching ISBN collapses",
  finalizeSearchBooks([unknownIsbn1, unknownIsbn2]).length,
  1
);

console.log("6. Provider-level dedupeBooks agrees with shared winner logic");
const provider = dedupeBooks([noDesc, withDesc]);
check("dedupeBooks keeps two different-key books", provider.length, 2);
const providerDupes = dedupeBooks([
  book({ id: "p1", title: "The Wren in the Holly Library", authors: ["K.A. Linde"], coverUrl: "c" }),
  book({ id: "p2", title: "Wren in the Holly Library", authors: ["K.A. Linde"], description: "d" }),
]);
check("dedupeBooks collapses article variants, description wins", providerDupes.map((b) => b.id), ["p2"]);

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll checks passed.");
