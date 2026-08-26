import type { BookSummary } from "@/types/book";

export function normalizeSuggestText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

/** 0–1 similarity from edit distance (1 = identical). */
export function stringSimilarity(a: string, b: string): number {
  const left = normalizeSuggestText(a);
  const right = normalizeSuggestText(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const maxLen = Math.max(left.length, right.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(left, right) / maxLen;
}

/**
 * Best fuzzy score of query against a candidate label.
 * Rewards prefixes, includes, and close edit-distance token matches
 * (e.g. "buchlman" ≈ "buehlman", "buchl" ≈ "buehlman").
 */
export function fuzzyLabelScore(query: string, label: string): number {
  const q = normalizeSuggestText(query);
  const l = normalizeSuggestText(label);
  if (!q || !l) return 0;
  if (q === l) return 100;
  if (l.startsWith(q)) return 90 + Math.min(q.length, 10);
  if (l.includes(q)) return 70 + Math.min(q.length, 10);

  const qTokens = q.split(/\s+/).filter(Boolean);
  const lTokens = l.split(/\s+/).filter(Boolean);
  let score = 0;

  for (const qt of qTokens) {
    let best = 0;
    for (const lt of lTokens) {
      if (lt === qt) {
        best = Math.max(best, 28);
        continue;
      }
      if (lt.startsWith(qt) && qt.length >= 2) {
        best = Math.max(best, 22 + Math.min(qt.length, 6));
        continue;
      }
      if (qt.startsWith(lt) && lt.length >= 3) {
        best = Math.max(best, 16);
        continue;
      }
      // Partial typo of a longer token: "buchl" ≈ head of "buehlman"
      if (lt.length >= qt.length && qt.length >= 3) {
        const head = lt.slice(0, qt.length);
        const headSim = stringSimilarity(qt, head);
        if (headSim >= 0.7) {
          best = Math.max(best, Math.round(headSim * 24));
          continue;
        }
      }
      const sim = stringSimilarity(qt, lt);
      if (
        sim >= 0.78 ||
        (qt.length >= 4 &&
          sim >= 0.65 &&
          Math.abs(qt.length - lt.length) <= 3)
      ) {
        best = Math.max(best, Math.round(sim * 26));
      }
    }
    score += best;
  }

  const whole = stringSimilarity(q, l);
  if (whole >= 0.72) score += Math.round(whole * 20);

  return score;
}

/** Extra relevance from fuzzy title/author token matches (typo tolerance). */
export function fuzzyRelevanceBoost(book: BookSummary, query: string): number {
  const q = normalizeSuggestText(query);
  if (!q || q.length < 3) return 0;

  let boost = 0;
  const titleScore = fuzzyLabelScore(query, book.title);
  if (titleScore >= 40) boost += Math.min(24, Math.round(titleScore * 0.35));
  else if (titleScore >= 28) boost += 8;

  for (const author of book.authors) {
    const authorScore = fuzzyLabelScore(query, author);
    if (authorScore >= 36) {
      boost += Math.min(28, Math.round(authorScore * 0.4));
      break;
    }
    const last = author.split(/\s+/).filter(Boolean).pop() ?? "";
    if (last && fuzzyLabelScore(query, last) >= 34) {
      boost += 18;
      break;
    }
  }

  return boost;
}
