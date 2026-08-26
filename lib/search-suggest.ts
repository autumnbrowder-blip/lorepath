import {
  normalizeTitleForDedupe,
  scoreBookRelevance,
} from "@/lib/book-utils";
import {
  fuzzyLabelScore,
  normalizeSuggestText,
} from "@/lib/search-fuzzy";
import type { BookSummary } from "@/types/book";

export type SearchSuggestionKind = "title" | "author";

export type SearchSuggestion = {
  kind: SearchSuggestionKind;
  label: string;
  /** Query to run when the suggestion is chosen. */
  query: string;
};

export type DidYouMean = {
  label: string;
  query: string;
};

/** Common typo → canonical author (or title) corrections. */
const KNOWN_QUERY_CORRECTIONS: Array<{
  pattern: RegExp;
  label: string;
  query: string;
}> = [
  {
    pattern:
      /\b(buchlman|buechlman|buhlman|beuhlman|buehlmann|buchlmann)\b/i,
    label: "Christopher Buehlman",
    query: "Christopher Buehlman",
  },
  {
    pattern: /\bbuehlman\b/i,
    label: "Christopher Buehlman",
    query: "Christopher Buehlman",
  },
];

const WELL_KNOWN_AUTHORS = [
  "Christopher Buehlman",
  "Sarah J. Maas",
  "Rebecca Yarros",
  "Brandon Sanderson",
  "George R. R. Martin",
  "J. R. R. Tolkien",
  "Leigh Bardugo",
  "Madeline Miller",
  "Andy Weir",
  "Emily St. John Mandel",
];

const WELL_KNOWN_TITLES = [
  "Between Two Fires",
  "Fourth Wing",
  "A Court of Thorns and Roses",
  "The Name of the Wind",
  "Project Hail Mary",
  "The Priory of the Orange Tree",
];

export function knownCorrectionForQuery(query: string): DidYouMean | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  for (const entry of KNOWN_QUERY_CORRECTIONS) {
    if (entry.pattern.test(trimmed)) {
      const same =
        normalizeSuggestText(trimmed) === normalizeSuggestText(entry.query);
      if (same) return null;
      return { label: entry.label, query: entry.query };
    }
  }
  return null;
}

/**
 * Build title/author autocomplete rows from a pool of books + well-known names.
 */
export function buildSearchSuggestions(
  query: string,
  books: BookSummary[],
  limit = 8
): SearchSuggestion[] {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  type Scored = SearchSuggestion & { score: number };
  const scored: Scored[] = [];
  const seen = new Set<string>();

  const consider = (kind: SearchSuggestionKind, label: string) => {
    const clean = label.replace(/\s+/g, " ").trim();
    if (!clean || clean.toLowerCase() === "unknown author") return;
    const key = `${kind}:${normalizeSuggestText(clean)}`;
    if (seen.has(key)) return;
    const score = fuzzyLabelScore(trimmed, clean);
    if (score < 16) return;
    seen.add(key);
    scored.push({ kind, label: clean, query: clean, score });
  };

  for (const book of books) {
    consider("title", book.title);
    for (const author of book.authors) consider("author", author);
  }

  for (const author of WELL_KNOWN_AUTHORS) consider("author", author);
  for (const title of WELL_KNOWN_TITLES) consider("title", title);

  const known = knownCorrectionForQuery(trimmed);
  if (known) {
    const key = `author:${normalizeSuggestText(known.label)}`;
    if (!seen.has(key)) {
      seen.add(key);
      scored.push({
        kind: "author",
        label: known.label,
        query: known.query,
        score: 120,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  return scored.slice(0, limit).map(({ kind, label, query: q }) => ({
    kind,
    label,
    query: q,
  }));
}

/**
 * Pick a strong alternate when the typed query looks like a typo.
 * Never silently replaces the query — callers display "Did you mean".
 */
export function findDidYouMean(
  query: string,
  books: BookSummary[]
): DidYouMean | null {
  const trimmed = query.trim();
  if (trimmed.length < 2) return null;

  const known = knownCorrectionForQuery(trimmed);
  if (known) return known;

  const exactTop = books.length
    ? Math.max(...books.slice(0, 8).map((b) => scoreBookRelevance(b, trimmed)))
    : -999;

  type Candidate = DidYouMean & { score: number };
  const candidates: Candidate[] = [];

  for (const book of books.slice(0, 40)) {
    const titleScore = fuzzyLabelScore(trimmed, book.title);
    if (titleScore >= 40) {
      candidates.push({
        label: book.title,
        query: book.title,
        score: titleScore + 5,
      });
    }
    for (const author of book.authors) {
      const authorScore = fuzzyLabelScore(trimmed, author);
      if (authorScore >= 36) {
        candidates.push({
          label: author,
          query: author,
          score: authorScore + 8,
        });
      }
      const parts = author.split(/\s+/).filter(Boolean);
      const last = parts[parts.length - 1];
      if (last && parts.length > 1) {
        const lastScore = fuzzyLabelScore(trimmed, last);
        if (lastScore >= 34) {
          candidates.push({
            label: author,
            query: author,
            score: lastScore + 12,
          });
        }
      }
    }
  }

  for (const author of WELL_KNOWN_AUTHORS) {
    const score = fuzzyLabelScore(trimmed, author);
    if (score >= 34) {
      candidates.push({ label: author, query: author, score: score + 6 });
    }
  }
  for (const title of WELL_KNOWN_TITLES) {
    const score = fuzzyLabelScore(trimmed, title);
    if (score >= 40) {
      candidates.push({ label: title, query: title, score });
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  if (normalizeSuggestText(best.query) === normalizeSuggestText(trimmed)) {
    return null;
  }

  const queryLooksExact =
    exactTop >= 40 &&
    books.slice(0, 5).some((book) => {
      const title = normalizeTitleForDedupe(book.title);
      const q = normalizeSuggestText(trimmed);
      return (
        title.includes(q) ||
        book.authors.some((a) => normalizeSuggestText(a).includes(q))
      );
    });

  if (queryLooksExact && best.score < 70) return null;
  if (exactTop >= 55 && best.score < 80) return null;
  if (best.score < 36) return null;

  return { label: best.label, query: best.query };
}
