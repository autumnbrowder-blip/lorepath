import {
  isExactTitleMatch,
  normalizeIsbn,
  normalizeTitleForDedupe,
} from "@/lib/book-utils";
import type { BookSummary } from "@/types/book";

export type KnownWorkEditions = {
  matchTitle: string;
  /** Alternate titles (translations, original-language titles). */
  altTitles?: string[];
  authorHint: string;
  /**
   * Canonical work ids (Open Library route ids) that must map to this catalog
   * entry even when cache title/author formatting drifts.
   */
  workIds?: string[];
  /** Original / first publication year for the work. */
  firstPublishYear: number;
  /**
   * Latest popular reprint year when known. Used when live ISBN APIs are
   * unavailable so detail still shows First published + Latest edition.
   */
  latestEditionYear: number;
  /**
   * Known edition ISBNs — prefer recent popular English reprints first so
   * search recovery and enrichment find a usable English edition quickly.
   */
  isbns: string[];
  /** Optional original-language edition ISBNs (kept separate from English). */
  originalLanguageIsbns?: string[];
  /** Google phrase query used by search fallback. */
  googlePhrase: string;
  /** BCP language of the original work when not English. */
  originalLanguage?: string;
};

/**
 * Popular works that must never vanish from search when providers flake.
 * Keep focused on high-traffic titles; recovery uses these ISBNs/phrases.
 */
export const KNOWN_WORK_EDITIONS: KnownWorkEditions[] = [
  {
    matchTitle: "Between Two Fires",
    authorHint: "Christopher Buehlman",
    workIds: ["ol-OL19329975W", "OL19329975W"],
    firstPublishYear: 2012,
    latestEditionYear: 2026,
    isbns: [
      "9781250439215",
      "9781250439208",
      "9780425256909",
      "9781937007867",
    ],
    googlePhrase: 'intitle:"Between Two Fires" inauthor:Buehlman',
  },
  {
    matchTitle: "Tender Is the Flesh",
    altTitles: ["Cadaver exquisito", "Cadáver exquisito"],
    authorHint: "Agustina Bazterrica",
    firstPublishYear: 2017,
    latestEditionYear: 2020,
    // English Scribner editions first.
    isbns: ["9781982150938", "9781982150921", "9781982150945"],
    originalLanguageIsbns: ["9788426405722", "9788426406835"],
    googlePhrase: 'intitle:"Tender Is the Flesh" inauthor:Bazterrica',
    originalLanguage: "es",
  },
  {
    matchTitle: "Fourth Wing",
    authorHint: "Rebecca Yarros",
    firstPublishYear: 2023,
    latestEditionYear: 2023,
    isbns: ["9781649374042", "9781649374172", "9780349437019"],
    googlePhrase: 'intitle:"Fourth Wing" inauthor:Yarros',
  },
  {
    matchTitle: "Divine Rivals",
    authorHint: "Rebecca Ross",
    firstPublishYear: 2023,
    latestEditionYear: 2023,
    isbns: ["9781250857439", "9781250857446", "9781250909817"],
    googlePhrase: 'intitle:"Divine Rivals" inauthor:Ross',
  },
  {
    matchTitle: "For the Wolf",
    authorHint: "Hannah Whitten",
    firstPublishYear: 2021,
    latestEditionYear: 2021,
    isbns: ["9780316212311", "9780316212304", "9780356516363"],
    googlePhrase: 'intitle:"For the Wolf" inauthor:Whitten',
  },
  {
    matchTitle: "Godkiller",
    authorHint: "Hannah Kaner",
    firstPublishYear: 2023,
    latestEditionYear: 2023,
    isbns: ["9780008521462", "9780008521493", "9780063211490"],
    googlePhrase: 'intitle:"Godkiller" inauthor:Kaner',
  },
  {
    matchTitle: "Ruthless Vows",
    authorHint: "Rebecca Ross",
    firstPublishYear: 2023,
    latestEditionYear: 2023,
    isbns: ["9781250857453", "9781250857460"],
    googlePhrase: 'intitle:"Ruthless Vows" inauthor:Ross',
  },
];

function normalizeWorkId(id: string | null | undefined): string {
  return (id ?? "").trim().toLowerCase();
}

function isbnSet(entry: KnownWorkEditions): Set<string> {
  return new Set(
    [...entry.isbns, ...(entry.originalLanguageIsbns ?? [])]
      .map((isbn) => normalizeIsbn(isbn))
      .filter((isbn): isbn is string => Boolean(isbn))
  );
}

function titlesFor(entry: KnownWorkEditions): string[] {
  return [entry.matchTitle, ...(entry.altTitles ?? [])];
}

/**
 * Resolve a known-work catalog entry from detail/search identity signals.
 * Match order: work id → ISBN → exact title + author last name.
 */
export function findKnownWorkEditions(
  title: string,
  authors: string[],
  options?: { id?: string | null; isbn?: string | null }
): KnownWorkEditions | null {
  const workId = normalizeWorkId(options?.id);
  const bookIsbn = normalizeIsbn(options?.isbn ?? null);
  const authorBlob = authors.join(" ").toLowerCase();

  for (const entry of KNOWN_WORK_EDITIONS) {
    if (
      workId &&
      entry.workIds?.some((id) => normalizeWorkId(id) === workId)
    ) {
      return entry;
    }
  }

  if (bookIsbn) {
    for (const entry of KNOWN_WORK_EDITIONS) {
      if (isbnSet(entry).has(bookIsbn)) return entry;
    }
  }

  for (const entry of KNOWN_WORK_EDITIONS) {
    const titleHit = titlesFor(entry).some((candidate) =>
      isExactTitleMatch(candidate, title)
    );
    if (!titleHit) continue;
    const lastName =
      entry.authorHint.toLowerCase().split(/\s+/).pop() ??
      entry.authorHint.toLowerCase();
    if (!authorBlob.includes(lastName)) continue;
    return entry;
  }

  return null;
}

/**
 * Match a user search query to a known work (title-only or title+author).
 */
export function knownWorkMatchesQuery(query: string): KnownWorkEditions | null {
  const normalized = normalizeTitleForDedupe(query);
  if (!normalized) return null;

  for (const entry of KNOWN_WORK_EDITIONS) {
    for (const title of titlesFor(entry)) {
      const titleKey = normalizeTitleForDedupe(title);
      if (!titleKey) continue;
      if (normalized === titleKey) return entry;
      // "Tender Is the Flesh Agustina Bazterrica"
      if (normalized.startsWith(`${titleKey} `)) return entry;
      if (normalized.includes(titleKey) && titleKey.length >= 8) return entry;
    }
  }
  return null;
}

/** Popular reprint ISBNs only (skip older edition ISBNs used for identity). */
export function getPopularReprintIsbns(entry: KnownWorkEditions): string[] {
  // First two entries are ordered as newest popular reprints in the catalog.
  return entry.isbns.slice(0, 2);
}

function authorMatchesHint(authors: string[], authorHint: string): boolean {
  const blob = authors.join(" ").toLowerCase();
  const last =
    authorHint.toLowerCase().split(/\s+/).pop() ?? authorHint.toLowerCase();
  return blob.includes(last);
}

/** Catalog card for a known work's English or original-language edition. */
export function knownWorkCatalogSeed(
  entry: KnownWorkEditions,
  kind: "english" | "original"
): BookSummary {
  if (kind === "original") {
    const isbn = (entry.originalLanguageIsbns?.[0] ?? entry.isbns[0]!).replace(
      /\D/g,
      ""
    );
    const alt = entry.altTitles?.[0] ?? entry.matchTitle;
    return {
      id: `isbndb-${isbn}`,
      title: alt,
      authors: [entry.authorHint],
      coverUrl: `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`,
      description: null,
      genres: [],
      publishedYear: entry.firstPublishYear,
      firstPublishYear: entry.firstPublishYear,
      source: "isbndb",
      isbn,
      language: entry.originalLanguage || "es",
      editionLabel: "original",
    };
  }

  const isbn = entry.isbns[0]!.replace(/\D/g, "");
  return {
    id: `isbndb-${isbn}`,
    title: entry.matchTitle,
    authors: [entry.authorHint],
    coverUrl: `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`,
    description: null,
    genres: [],
    publishedYear: entry.latestEditionYear,
    firstPublishYear: entry.firstPublishYear,
    source: "isbndb",
    isbn,
    language: "en",
    editionLabel: entry.originalLanguage ? "english" : null,
  };
}

function bookMatchesKnownTitle(
  book: BookSummary,
  title: string,
  authorHint: string
): boolean {
  return (
    isExactTitleMatch(title, book.title) &&
    authorMatchesHint(book.authors, authorHint)
  );
}

/**
 * Hard guarantee: when a known translated work is on the shelf, BOTH the
 * original-language card and the English translation card are present.
 * Never replaces one with the other.
 */
export function ensureKnownTranslatedEditionPair(
  books: BookSummary[],
  query: string
): BookSummary[] {
  const known =
    knownWorkMatchesQuery(query) ??
    books
      .map((book) =>
        findKnownWorkEditions(book.title, book.authors, {
          id: book.id,
          isbn: book.isbn,
        })
      )
      .find((entry) => entry?.originalLanguage) ??
    null;

  if (!known?.originalLanguage) {
    return applyKnownWorkEditionLabels(books, query);
  }

  const next = [...books];
  const hasEnglish = next.some((book) =>
    bookMatchesKnownTitle(book, known.matchTitle, known.authorHint)
  );
  const hasOriginal = next.some((book) =>
    (known.altTitles ?? []).some((alt) =>
      bookMatchesKnownTitle(book, alt, known.authorHint)
    )
  );

  if (!hasEnglish) {
    next.unshift(knownWorkCatalogSeed(known, "english"));
  }
  if (!hasOriginal) {
    next.push(knownWorkCatalogSeed(known, "original"));
  }

  const labeled = applyKnownWorkEditionLabels(next, query);

  const englishIdx = labeled.findIndex((book) =>
    bookMatchesKnownTitle(book, known.matchTitle, known.authorHint)
  );
  const originalIdx = labeled.findIndex((book) =>
    (known.altTitles ?? []).some((alt) =>
      bookMatchesKnownTitle(book, alt, known.authorHint)
    )
  );
  if (englishIdx < 0 || originalIdx < 0) return labeled;

  const english = labeled[englishIdx]!;
  const original = labeled[originalIdx]!;
  const rest = labeled.filter(
    (_, idx) => idx !== englishIdx && idx !== originalIdx
  );

  // Prefer the edition that matches how the user searched.
  const queryKey = normalizeTitleForDedupe(query);
  const preferEnglish =
    queryKey === normalizeTitleForDedupe(known.matchTitle) ||
    queryKey.startsWith(`${normalizeTitleForDedupe(known.matchTitle)} `);

  return preferEnglish
    ? [english, original, ...rest]
    : [original, english, ...rest];
}

/**
 * For known translated works, label English + original edition cards by title
 * (not provider language metadata, which is often wrong/missing).
 */
export function applyKnownWorkEditionLabels(
  books: BookSummary[],
  query: string
): BookSummary[] {
  // Prefer query match; also label when cards themselves are known translations.
  const knownFromQuery = knownWorkMatchesQuery(query);

  return books.map((book) => {
    const known =
      knownFromQuery ??
      findKnownWorkEditions(book.title, book.authors, {
        id: book.id,
        isbn: book.isbn,
      });
    if (!known?.originalLanguage) return book;

    if (bookMatchesKnownTitle(book, known.matchTitle, known.authorHint)) {
      return {
        ...book,
        language: "en",
        editionLabel: "english",
      };
    }

    const isAlt = (known.altTitles ?? []).some((alt) =>
      bookMatchesKnownTitle(book, alt, known.authorHint)
    );
    if (isAlt) {
      return {
        ...book,
        language: known.originalLanguage,
        editionLabel: "original",
      };
    }

    return book;
  });
}
