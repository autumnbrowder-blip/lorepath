import {
  isExactTitleMatch,
  normalizeTitleForDedupe,
} from "@/lib/book-utils";

export type KnownWorkEditions = {
  matchTitle: string;
  authorHint: string;
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

export function findKnownWorkEditions(
  title: string,
  authors: string[]
): KnownWorkEditions | null {
  const authorBlob = authors.join(" ").toLowerCase();
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
