import { writeFileSync } from "fs";
import { fetchSearchProviderFlood } from "../lib/search-flood";
import { finalizeSearchBooks } from "../lib/search-finalize";
import {
  ensureKnownTranslatedEditionPair,
  knownWorkMatchesQuery,
} from "../lib/known-editions";
import { labelOriginalAndEnglishEditions } from "../lib/search-english-editions";
import { rankSearchResults } from "../lib/book-utils";

const QUERIES = [
  "Tender Is the Flesh",
  "Tender Is the Flesh Agustina Bazterrica",
  "Cadáver exquisito",
  "Fourth Wing",
  "Divine Rivals",
  "Divine Rivals Rebecca Ross",
  "For the Wolf",
  "Godkiller",
];

function hasEnglishTender(
  books: { title: string; editionLabel?: string | null }[]
) {
  return books.some(
    (b) =>
      /^tender is the flesh$/i.test(b.title.trim()) ||
      b.editionLabel === "english"
  );
}

function hasOriginalCadaver(
  books: {
    title: string;
    authors?: string[];
    editionLabel?: string | null;
  }[]
) {
  return books.some(
    (b) =>
      b.editionLabel === "original" ||
      (/cad[aá]ver exquisito/i.test(b.title) &&
        /bazterrica/i.test((b.authors ?? []).join(" ")))
  );
}

async function runQuery(q: string) {
  const flood = await fetchSearchProviderFlood({
    query: q,
    page: 1,
    genreMode: false,
    debug: true,
  });
  let books = finalizeSearchBooks(flood.books, {
    query: flood.normalized.title ?? q,
    deferQualityFilter: false,
  });
  books = labelOriginalAndEnglishEditions(books);
  books = ensureKnownTranslatedEditionPair(books, q);
  books = rankSearchResults(books, flood.normalized.title ?? q);
  books = ensureKnownTranslatedEditionPair(books, q);

  const known = knownWorkMatchesQuery(q);
  const needsPair = known?.matchTitle === "Tender Is the Flesh";
  const englishOk = !needsPair || hasEnglishTender(books);
  const originalOk = !needsPair || hasOriginalCadaver(books);
  const ok = books.length > 0 && englishOk && originalOk;

  return {
    query: q,
    known: known?.matchTitle ?? null,
    floodCount: flood.books.length,
    sourceCounts: flood.sourceCounts,
    resultCount: books.length,
    englishOk,
    originalOk,
    ok,
    top: books.slice(0, 4).map((b) => ({
      id: b.id,
      title: b.title,
      authors: b.authors,
      language: b.language ?? null,
      editionLabel: b.editionLabel ?? null,
      source: b.source,
      isbn: b.isbn ?? null,
      hasCover: Boolean(b.coverUrl),
      hasDesc: Boolean(b.description && b.description.length > 40),
    })),
  };
}

async function main() {
  const results = [];
  for (const q of QUERIES) {
    results.push(await runQuery(q));
  }
  writeFileSync("repro-acceptance-search.json", JSON.stringify(results, null, 2));
  console.log("wrote repro-acceptance-search.json");
  let failed = 0;
  for (const row of results) {
    const status = row.ok ? "OK  " : "FAIL";
    if (!row.ok) failed += 1;
    const notes = [
      row.englishOk === false ? "missing English" : null,
      row.originalOk === false ? "missing original" : null,
    ]
      .filter(Boolean)
      .join(", ");
    console.log(
      `${status} ${row.query} → ${row.resultCount} (flood ${row.floodCount})${
        notes ? ` [${notes}]` : ""
      }`
    );
  }
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  writeFileSync(
    "repro-acceptance-search.json",
    JSON.stringify({ error: String(err) }, null, 2)
  );
  process.exit(1);
});
