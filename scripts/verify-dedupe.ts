/**
 * Temporary verification for the shared dedupe helper.
 * Run: npx tsx scripts/verify-dedupe.ts
 */
import { pickPreferredLanguageCode } from "../lib/book-language";
import { finalizeSearchBooks } from "../lib/search-finalize";
import {
  distinctLatestEdition,
  firstPublishedHref,
  latestCoveredEditionId,
  latestEditionHref,
  resolveLatestEditionTarget,
} from "../lib/book-work";
import {
  dedupeBooks,
  getBookDedupeKey,
  normalizeAuthorForDedupe,
  normalizeTitleForDedupe,
  pickPreferredDuplicate,
  rankBrowseSearchResults,
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
  coverUrl: "https://covers.example/wren-google.jpg",
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
check("winner is the latest covered edition", finalized[0]?.id, "google-wren");
check(
  "winner keeps its own cover",
  finalized[0]?.coverUrl,
  "https://covers.example/wren-google.jpg"
);
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
  "protected merge shows the latest edition identity",
  protectedFinalize[0]?.id,
  "isbndb-other"
);
check(
  "rated edition is kept on workEditions",
  Boolean(
    protectedFinalize[0]?.workEditions?.some(
      (edition) => edition.id === "google-rated-slug"
    )
  ),
  true
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

console.log("9. Work-key collapse (Google volume reprints)");
const dune1965 = book({
  id: "google-dune-1965",
  title: "Dune",
  authors: ["Frank Herbert"],
  description:
    "The original desert-planet epic of politics, prophecy, and spice.",
  publishedYear: 1965,
});
const dune2019 = book({
  id: "google-dune-2019",
  title: "Dune",
  authors: ["Frank Herbert"],
  description:
    "A later reprint of the desert-planet epic, issued with a new cover.",
  coverUrl: "https://covers.example/dune.jpg",
  publishedYear: 2019,
});
const duneOnly = finalizeSearchBooks([dune1965, dune2019]);
const duneCard = duneOnly[0];
check("Dune reprints collapse to one card", duneOnly.length, 1);
check("latest Dune edition is the visible card", duneCard?.id, "google-dune-2019");
check("first published year is the earliest Dune year", duneCard?.firstPublishYear, 1965);
check(
  "older Dune edition is retained",
  Boolean(duneCard?.workEditions?.some((edition) => edition.id === "google-dune-1965")),
  true
);
check("first-edition link targets the 1965 record", duneCard?.firstEditionId, "google-dune-1965");
check(
  "latestEditionId differs from first published",
  duneCard?.latestEditionId,
  "google-dune-2019"
);

const olDuneWork = book({
  id: "ol-OL893414W",
  title: "Dune",
  authors: ["Frank Herbert"],
  description: "Open Library work-level record using first_publish_year as the year.",
  coverUrl: "https://covers.openlibrary.org/b/id/11481354-M.jpg",
  publishedYear: 1965,
  firstPublishYear: 1965,
  source: "openlibrary",
});
const googleDuneReprint = book({
  id: "google-dune-reprint",
  title: "Dune",
  authors: ["Frank Herbert"],
  description: "A later commercial reprint with the current cover art.",
  coverUrl: "https://books.google.com/books/content?id=dune-cover",
  publishedYear: 2019,
});
const olVsGoogle = finalizeSearchBooks([olDuneWork, googleDuneReprint]);
check("OL work + Google reprint collapse to one", olVsGoogle.length, 1);
check("Google reprint is the visible Dune card", olVsGoogle[0]?.id, "google-dune-reprint");
check(
  "visible cover is the Google reprint cover",
  olVsGoogle[0]?.coverUrl,
  "https://books.google.com/books/content?id=dune-cover"
);
check("first published year stays 1965", olVsGoogle[0]?.firstPublishYear, 1965);
check(
  "First published YEAR opens the OL 1965 record",
  olVsGoogle[0]?.firstEditionId,
  "ol-OL893414W"
);

const isbndbDune2019 = book({
  id: "isbndb-9780593099322",
  title: "Dune",
  authors: ["Frank Herbert"],
  description:
    "Set on the desert planet Arrakis, Dune is the story of the boy Paul Atreides.",
  coverUrl: "https://images.isbndb.com/covers/dune-2019.jpg",
  publishedYear: 2019,
  language: "en",
  isbn: "9780593099322",
  source: "isbndb",
});
const olDuneWorkEng = book({
  id: "ol-OL893414W",
  title: "Dune",
  authors: ["Frank Herbert"],
  description:
    "Set on the desert planet Arrakis, Dune is the story of the boy Paul Atreides.",
  coverUrl: "https://covers.openlibrary.org/b/id/11481354-M.jpg",
  publishedYear: 1965,
  firstPublishYear: 1965,
  language: "eng",
  source: "openlibrary",
});
const olDuneProtectedUnknownLang = book({
  id: "ol-OL893414W",
  title: "Dune",
  authors: ["Frank Herbert"],
  description:
    "Set on the desert planet Arrakis, Dune is the story of the boy Paul Atreides.",
  coverUrl: "https://covers.openlibrary.org/b/id/11481354-M.jpg",
  publishedYear: 1965,
  firstPublishYear: 1965,
  source: "openlibrary",
});
const duneMessiahCard = book({
  id: "ol-dune-messiah",
  title: "Dune Messiah",
  authors: ["Frank Herbert"],
  description: "The second novel in the Dune Chronicles.",
  coverUrl: "https://covers.example/messiah.jpg",
  publishedYear: 1969,
  language: "en",
  source: "openlibrary",
});
const childrenOfDuneCard = book({
  id: "google-children-of-dune",
  title: "Children of Dune",
  authors: ["Frank Herbert"],
  description:
    "The third novel in the Dune Chronicles continues Paul's story on Arrakis.",
  coverUrl: "https://covers.example/children.jpg",
  publishedYear: 1976,
  language: "en",
});
const brianHerbertDune = book({
  id: "google-brian-dune",
  title: "Dune",
  authors: ["Brian Herbert", "Kevin J. Anderson"],
  description: "A later Dune universe novel by Frank Herbert's son.",
  coverUrl: "https://covers.example/brian-dune.jpg",
  publishedYear: 2007,
  language: "en",
});
const isbndbLastFirstAuthors = book({
  ...isbndbDune2019,
  authors: ["Herbert", "Frank"],
});

check(
  "ISBNdb + OL Dune share the title+author key (language ignored)",
  getBookDedupeKey(isbndbDune2019),
  getBookDedupeKey(olDuneWorkEng)
);
check(
  "protected OL with no language still shares the Dune key",
  getBookDedupeKey(isbndbDune2019),
  getBookDedupeKey(olDuneProtectedUnknownLang)
);

const spanishDuneReprint = book({
  id: "ol-OL50732450M",
  title: "Dune",
  authors: ["Frank Herbert"],
  description: "Spanish 2024 printing that must not win latest edition.",
  coverUrl: "https://covers.openlibrary.org/b/id/spanish-dune.jpg",
  publishedYear: 2024,
  language: "es",
  source: "openlibrary",
});
const liveDunePage = finalizeSearchBooks([
  isbndbDune2019,
  olDuneWorkEng,
  spanishDuneReprint,
  duneMessiahCard,
  childrenOfDuneCard,
  brianHerbertDune,
]);
const frankHerbertDuneCards = liveDunePage.filter(
  (row) =>
    row.title.trim().toLowerCase() === "dune" &&
    /^frank herbert$/i.test(row.authors[0] ?? "")
);
check(
  "exactly one Frank Herbert Dune card (not Messiah/Children/Brian)",
  frankHerbertDuneCards.length,
  1
);
check(
  "visible Dune id is ISBNdb, not the OL work",
  frankHerbertDuneCards[0]?.id,
  "isbndb-9780593099322"
);
check(
  "visible Dune is never Spanish OL50732450M",
  liveDunePage.some((row) => row.id === "ol-OL50732450M"),
  false
);
check(
  "merged Dune keeps first published year 1965",
  frankHerbertDuneCards[0]?.firstPublishYear,
  1965
);
check(
  "merged Dune keeps newest English year 2019",
  frankHerbertDuneCards[0]?.publishedYear,
  2019
);
check(
  "Dune Messiah stays a separate card",
  liveDunePage.some((row) => row.id === "ol-dune-messiah"),
  true
);
check(
  "Children of Dune stays a separate card",
  liveDunePage.some((row) => row.id === "google-children-of-dune"),
  true
);
check(
  "Brian Herbert Dune stays a separate card",
  liveDunePage.some((row) => row.id === "google-brian-dune"),
  true
);

const lastFirstMerged = finalizeSearchBooks([
  isbndbLastFirstAuthors,
  olDuneWorkEng,
]);
check(
  "Last, First author split still collapses to one Dune",
  lastFirstMerged.filter((row) => row.title.trim().toLowerCase() === "dune")
    .length,
  1
);

const protectedOlReadd = finalizeSearchBooks([isbndbDune2019], {
  ratedIds: new Set(["ol-OL893414W"]),
  protectedBooks: [olDuneProtectedUnknownLang],
});
const protectedFrankDune = protectedOlReadd.filter(
  (row) => row.title.trim().toLowerCase() === "dune"
);
check(
  "protected OL Dune does not re-add a second card",
  protectedFrankDune.length,
  1
);
check(
  "protected merge still prefers ISBNdb over OL work id",
  protectedFrankDune[0]?.id,
  "isbndb-9780593099322"
);

const loadMoreDune = finalizeSearchBooks(
  [...finalizeSearchBooks([isbndbDune2019]), olDuneWorkEng]
);
check(
  "client load-more cannot add a second Frank Herbert Dune",
  loadMoreDune.filter((row) => row.title.trim().toLowerCase() === "dune")
    .length,
  1
);

const itKing = book({
  id: "google-it-king",
  title: "It",
  authors: ["Stephen King"],
  description:
    "A different work that shares a short title with nothing else here.",
  publishedYear: 1986,
  coverUrl: "https://covers.example/it.jpg",
});
const itOther = book({
  id: "google-it-other",
  title: "It",
  authors: ["Someone Else"],
  description: "An unrelated short-title book by a different author entirely.",
  publishedYear: 2010,
  coverUrl: "https://covers.example/it-other.jpg",
});
const shortTitles = finalizeSearchBooks([itKing, itOther]);
check(
  "short titles with different authors stay separate",
  shortTitles.length,
  2
);

console.log("10. English latest-edition picking (never Spanish Dune)");
check(
  "OL work language list prefers eng over ukr/es",
  pickPreferredLanguageCode(["ukr", "spa", "eng", "pol"]),
  "eng"
);
const spanishDune2024 = book({
  id: "ol-OL50732450M",
  title: "Dune",
  authors: ["Frank Herbert"],
  description: "Spanish 2024 printing that must not win latest edition.",
  coverUrl: "https://covers.openlibrary.org/b/id/spanish-dune.jpg",
  publishedYear: 2024,
  language: "es",
  source: "openlibrary",
});
const englishDune2019 = book({
  id: "google-dune-english-2019",
  title: "Dune",
  authors: ["Frank Herbert"],
  description: "English Ace reprint with a real cover.",
  coverUrl: "https://books.google.com/books/content?id=dune-en-2019",
  publishedYear: 2019,
  language: "en",
});
const englishGoogleNoYear = book({
  id: "google-dune-english-noyear",
  title: "Dune",
  authors: ["Frank Herbert"],
  description: "English Google edition that omitted a year.",
  coverUrl: "https://books.google.com/books/content?id=dune-en-noyear",
  language: "eng",
});
const mixedLangDune = finalizeSearchBooks([
  olDuneWork,
  spanishDune2024,
  englishDune2019,
]);
check("English + Spanish Dune collapse to one visible card", mixedLangDune.length, 1);
check(
  "visible Dune card is the English edition, not Spanish 2024",
  mixedLangDune[0]?.id,
  "google-dune-english-2019"
);
check(
  "visible Dune card language stays English",
  mixedLangDune[0]?.language === "en" || mixedLangDune[0]?.language === "eng",
  true
);
check(
  "First published YEAR still opens the 1965 work",
  mixedLangDune[0]?.firstEditionId,
  "ol-OL893414W"
);
check(
  "latestCoveredEditionId never returns Spanish OL50732450M",
  latestCoveredEditionId(olDuneWork, [
    spanishDune2024,
    englishDune2019,
  ]),
  "google-dune-english-2019"
);
check(
  "commercial English with no year beats newer Spanish OL",
  latestCoveredEditionId(olDuneWork, [
    spanishDune2024,
    englishGoogleNoYear,
  ]),
  "google-dune-english-noyear"
);
const latestTarget = resolveLatestEditionTarget(olDuneWork, [
  spanishDune2024,
  englishDune2019,
]);
check("latest edition href id is English 2019", latestTarget.id, "google-dune-english-2019");
check("latest edition year is the English year, not 2024", latestTarget.year, 2019);

const hcDune = book({
  id: "hardcover-dune-work",
  title: "Dune",
  authors: ["Frank Herbert"],
  description: "Hardcover English synopsis of Arrakis and the spice.",
  coverUrl: "https://assets.hardcover.app/covers/dune.jpg",
  publishedYear: 2019,
  language: "en",
  source: "hardcover",
  genres: ["Science Fiction", "Epic Fantasy"],
});
const hcVsSpanish = finalizeSearchBooks([
  olDuneWork,
  spanishDune2024,
  hcDune,
]);
check(
  "Hardcover English + Spanish OL collapse to one card",
  hcVsSpanish.length,
  1
);
check(
  "Hardcover English identity beats Spanish OL50732450M",
  hcVsSpanish[0]?.id,
  "hardcover-dune-work"
);
check("visible Dune source is hardcover", hcVsSpanish[0]?.source, "hardcover");
check(
  "Hardcover description wins over OL",
  hcVsSpanish[0]?.description,
  "Hardcover English synopsis of Arrakis and the spice."
);
check(
  "Hardcover cover wins over OL",
  hcVsSpanish[0]?.coverUrl,
  "https://assets.hardcover.app/covers/dune.jpg"
);
check(
  "Hardcover tags are present on the merged card",
  (hcVsSpanish[0]?.genres ?? []).some((tag) =>
    /science fiction|epic fantasy/i.test(tag)
  ),
  true
);
check(
  "First published YEAR still opens the 1965 work when Hardcover wins",
  hcVsSpanish[0]?.firstEditionId,
  "ol-OL893414W"
);
check(
  "latestCoveredEditionId may be Hardcover English when it differs from first published",
  latestCoveredEditionId(olDuneWork, [spanishDune2024, hcDune]),
  "hardcover-dune-work"
);
const hcLatest = resolveLatestEditionTarget(olDuneWork, [
  spanishDune2024,
  hcDune,
]);
check("latest edition href may be the Hardcover English id", hcLatest.id, "hardcover-dune-work");
check("latest edition href is not Spanish OL50732450M", hcLatest.id !== "ol-OL50732450M", true);

const googleDuneForHc = book({
  id: "google-dune-english-2019",
  title: "DUNE",
  authors: ["Frank Herbert"],
  description: "Google Books blurb that must not replace Hardcover copy.",
  coverUrl: "https://books.google.com/books/content?id=dune-en-2019",
  publishedYear: 2019,
  language: "en",
  genres: ["Fiction"],
});
const hcVsGoogle = finalizeSearchBooks([googleDuneForHc, hcDune]);
check("Hardcover + Google Dune stay one title+author card", hcVsGoogle.length, 1);
check(
  "visible Dune is a commercial English edition, not Spanish OL",
  hcVsGoogle[0]?.id !== "ol-OL50732450M" &&
    (hcVsGoogle[0]?.source === "hardcover" || hcVsGoogle[0]?.source === "google"),
  true
);
check("Hardcover title wins over Google", hcVsGoogle[0]?.title, "Dune");
check(
  "Hardcover description wins over Google",
  hcVsGoogle[0]?.description,
  "Hardcover English synopsis of Arrakis and the spice."
);

const noHardcoverPath = finalizeSearchBooks([
  olDuneWork,
  googleDuneReprint,
  spanishDune2024,
]);
check(
  "skip/0 Hardcover path still prefers English Google over Spanish OL",
  noHardcoverPath[0]?.id,
  "google-dune-reprint"
);
check("skip/0 path source is not hardcover", noHardcoverPath[0]?.source !== "hardcover", true);

check(
  "first published href uses firstEditionId + fy",
  firstPublishedHref("ol-OL893414W", "dune", 1965),
  "/books/ol-OL893414W?q=dune&fy=1965"
);
check(
  "latest edition href uses a different id and no fy",
  latestEditionHref("google-dune-reprint", "dune"),
  "/books/google-dune-reprint?q=dune"
);
check(
  "latest hidden when it would be the same id as first published",
  distinctLatestEdition({
    latestId: "ol-OL893414W",
    latestYear: 1965,
    firstEditionId: "ol-OL893414W",
  }),
  null
);
check(
  "latest hidden on the detail page when it is the current book",
  distinctLatestEdition({
    latestId: "google-dune-reprint",
    latestYear: 2019,
    firstEditionId: "ol-OL893414W",
    currentBookId: "google-dune-reprint",
  }),
  null
);
check(
  "latest shown on a card when it differs from first published",
  distinctLatestEdition({
    latestId: "google-dune-reprint",
    latestYear: 2019,
    firstEditionId: "ol-OL893414W",
  }),
  { id: "google-dune-reprint", year: 2019 }
);

const rankedDune = rankBrowseSearchResults(
  [
    book({
      id: "ol-messiah",
      title: "Dune Messiah",
      authors: ["Frank Herbert"],
      publishedYear: 1969,
      coverUrl: "https://covers.example/messiah.jpg",
      description: "The second book.",
    }),
    book({
      id: "google-dune-main",
      title: "Dune",
      authors: ["Frank Herbert"],
      publishedYear: 2019,
      coverUrl: "https://covers.example/dune.jpg",
      description: "The original novel.",
      language: "en",
    }),
    book({
      id: "google-brian-dune",
      title: "Dune",
      authors: ["Brian Herbert"],
      publishedYear: 2007,
      coverUrl: "https://covers.example/brian.jpg",
      description: "A later family novel.",
      language: "en",
    }),
  ],
  "dune"
);
check("exact title Dune ranks before Dune Messiah", rankedDune[0]?.title, "Dune");
check("Frank Herbert Dune ranks before Brian Herbert", rankedDune[0]?.id, "google-dune-main");
check("Dune Messiah stays in related results", rankedDune.some((b) => b.id === "ol-messiah"), true);

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll checks passed.");
