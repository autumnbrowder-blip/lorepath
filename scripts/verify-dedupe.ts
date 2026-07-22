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

console.log("2. Winner priority (rated > description > cover > year > metadata)");
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

console.log("7. Real-world ISBNdb Wren / Sandworms cases (empirical repro)");
const wrenPlain = "wren in the holly library";
check(
  "marketing tail stripped (Sunday Times)",
  normalizeTitleForDedupe(
    "The Wren in the Holly Library The No. 1 Sunday Times Bestseller and start of an addictive Urban Romantasy Series"
  ),
  wrenPlain
);
check(
  "exclusive edition fluff stripped",
  normalizeTitleForDedupe("The Wren in the Holly Library Exclusive Edition"),
  wrenPlain
);
check(
  "parenthesized series label stripped",
  normalizeTitleForDedupe(
    "The Wren in the Holly Library (The Oak and Holly Cycle)"
  ),
  wrenPlain
);
check(
  "deluxe limited edition (parens + fluff)",
  normalizeTitleForDedupe(
    "The Wren in the Holly Library (Deluxe Limited Edition)"
  ),
  wrenPlain
);
check(
  "House of Dragons marketing does NOT collapse into Wren",
  normalizeTitleForDedupe(
    "House of Dragons From the number one Sunday Times bestselling author of The Wren in the Holly Library"
  ),
  "house of dragons"
);

const wrenEditions = finalizeSearchBooks([
  book({
    id: "isbndb-plain",
    title: "The Wren in the Holly Library",
    authors: ["K. A. Linde"],
    description: "A fantasy.",
    isbn: "9781035044863",
    source: "isbndb",
  }),
  book({
    id: "isbndb-exclusive",
    title: "The Wren in the Holly Library Exclusive Edition",
    authors: ["K. A. Linde"],
    coverUrl: "https://covers.example/exclusive.jpg",
    isbn: "9781035051946",
    source: "isbndb",
  }),
  book({
    id: "isbndb-marketing",
    title:
      "The Wren in the Holly Library The No. 1 Sunday Times Bestseller and start of an addictive Urban Romantasy Series",
    authors: ["K. A. Linde"],
    description: "A longer fantasy blurb with more detail.",
    isbn: "9781035044870",
    source: "isbndb",
  }),
  book({
    id: "isbndb-series",
    title: "The Wren in the Holly Library (The Oak and Holly Cycle)",
    authors: ["K. A. Linde"],
    isbn: "9798212889636",
    coverUrl: "https://covers.example/series.jpg",
    source: "isbndb",
  }),
]);
check("Wren ISBNdb edition variants collapse to one", wrenEditions.length, 1);
check(
  "Wren survivor keeps plain short title",
  wrenEditions[0]?.title,
  "The Wren in the Holly Library"
);

const sandworms = finalizeSearchBooks([
  book({
    id: "TeZJPgAACAAJ",
    title: "Sandworms of Dune",
    authors: ["Kevin J. Anderson", "Brian Herbert"],
    description: "Google edition.",
    coverUrl: "g.jpg",
    isbn: "9780340837528",
  }),
  book({
    id: "isbndb-9781429917964",
    title: "Sandworms of Dune",
    authors: ["Brian Herbert", "Kevin J. Anderson"],
    description: "ISBNdb edition with more text here.",
    coverUrl: "i.jpg",
    isbn: "9781429917964",
    source: "isbndb",
  }),
]);
check(
  "Sandworms: co-author order swap collapses to one",
  sandworms.length,
  1
);
check(
  "Sandworms keys match across author order",
  getBookDedupeKey(
    book({
      id: "a",
      title: "Sandworms of Dune",
      authors: ["Kevin J. Anderson", "Brian Herbert"],
    })
  ),
  getBookDedupeKey(
    book({
      id: "b",
      title: "Sandworms of Dune",
      authors: ["Brian Herbert", "Kevin J. Anderson"],
    })
  )
);

console.log("8. Rated books win identity + stay protected");
const ratedApi = book({
  id: "google-rated-slug",
  title: "The Wren in the Holly Library",
  authors: ["K.A. Linde"],
  description: "Short.",
  publishedYear: 2023,
});
const richerUnrated = book({
  id: "isbndb-other",
  title: "Wren in the Holly Library",
  authors: ["K. A. Linde"],
  description: "A much longer description from ISBNdb.",
  coverUrl: "https://covers.example/wren.jpg",
  publishedYear: 2024,
  isbn: "9781035044863",
  source: "isbndb",
});
const ratedWins = pickPreferredDuplicate(richerUnrated, ratedApi, {
  ratedIds: new Set(["google-rated-slug"]),
});
check("rated id wins over richer unrated metadata", ratedWins.id, "google-rated-slug");

const protectedFinalize = finalizeSearchBooks([richerUnrated], {
  ratedIds: new Set(["google-rated-slug"]),
  protectedBooks: [ratedApi],
  debug: false,
});
check("protected rated book forced into results", protectedFinalize.length, 1);
check(
  "protected rated book keeps DB identity",
  protectedFinalize[0]?.id,
  "google-rated-slug"
);
check(
  "protected rated book still merges richer cover",
  Boolean(protectedFinalize[0]?.coverUrl),
  true
);

const coverOnlyRated = book({
  id: "user-rated-cover-only",
  title: "Obscure Rated Novella",
  authors: ["Jane Doe"],
  coverUrl: "https://covers.example/obscure.jpg",
  publishedYear: 2021,
});
const completeUnrelated = book({
  id: "other-complete",
  title: "Completely Different Book",
  authors: ["Someone Else"],
  description: "Has both fields.",
  coverUrl: "https://covers.example/other.jpg",
  publishedYear: 2022,
});
const forcedObscure = finalizeSearchBooks([completeUnrelated], {
  ratedIds: new Set(["user-rated-cover-only"]),
  protectedBooks: [coverOnlyRated],
  debug: false,
});
check(
  "cover-only rated book survives when other results are complete",
  forcedObscure.some((b) => b.id === "user-rated-cover-only"),
  true
);

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll checks passed.");
