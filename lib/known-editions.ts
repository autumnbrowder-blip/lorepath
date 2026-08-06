import {
  isExactTitleMatch,
  normalizeIsbn,
  normalizeTitleForDedupe,
} from "@/lib/book-utils";

export type KnownWorkEditions = {
  matchTitle: string;
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
   * Known edition ISBNs — prefer recent popular reprints first so enrichment
   * finds the latest year quickly.
   */
  isbns: string[];
  /** Google phrase query used by search fallback. */
  googlePhrase: string;
};

/**
 * Small catalog of works where edition years matter for detail display.
 * Keep this list short — prefer live provider data when it already has both years.
 */
export const KNOWN_WORK_EDITIONS: KnownWorkEditions[] = [
  {
    matchTitle: "Between Two Fires",
    authorHint: "Christopher Buehlman",
    workIds: ["ol-OL19329975W", "OL19329975W"],
    firstPublishYear: 2012,
    // Tor Nightfire popular reprint (ISBN 9781250439208 / 9781250439215).
    latestEditionYear: 2026,
    // Tor Nightfire 2026 reprints first, then earlier Ace/Night Shade editions.
    isbns: [
      "9781250439215",
      "9781250439208",
      "9780425256909",
      "9781937007867",
    ],
    googlePhrase: 'intitle:"Between Two Fires" inauthor:Buehlman',
  },
];

function normalizeWorkId(id: string | null | undefined): string {
  return (id ?? "").trim().toLowerCase();
}

function isbnSet(entry: KnownWorkEditions): Set<string> {
  return new Set(
    entry.isbns
      .map((isbn) => normalizeIsbn(isbn))
      .filter((isbn): isbn is string => Boolean(isbn))
  );
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
    if (!isExactTitleMatch(entry.matchTitle, title)) continue;
    const lastName =
      entry.authorHint.toLowerCase().split(/\s+/).pop() ??
      entry.authorHint.toLowerCase();
    if (!authorBlob.includes(lastName)) continue;
    return entry;
  }

  return null;
}

export function knownWorkMatchesQuery(query: string): KnownWorkEditions | null {
  const normalized = normalizeTitleForDedupe(query);
  for (const entry of KNOWN_WORK_EDITIONS) {
    if (normalizeTitleForDedupe(entry.matchTitle) === normalized) {
      return entry;
    }
  }
  return null;
}

/** Popular reprint ISBNs only (skip older edition ISBNs used for identity). */
export function getPopularReprintIsbns(entry: KnownWorkEditions): string[] {
  // First two entries are ordered as newest popular reprints in the catalog.
  return entry.isbns.slice(0, 2);
}
