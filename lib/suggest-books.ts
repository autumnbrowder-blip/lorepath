import { searchGoogleBooks } from "@/lib/google-books";
import { searchOpenLibrary } from "@/lib/open-library";
import { dedupeBooks } from "@/lib/book-utils";
import {
  buildSearchSuggestions,
  findDidYouMean,
  knownCorrectionForQuery,
  type DidYouMean,
  type SearchSuggestion,
} from "@/lib/search-suggest";
import type { BookSummary } from "@/types/book";

export type SuggestBooksResult = {
  suggestions: SearchSuggestion[];
  didYouMean: DidYouMean | null;
};

const SUGGEST_CACHE_TTL_MS = 120_000;
const SUGGEST_CACHE_MAX = 60;
const suggestCache = new Map<string, { expires: number; result: SuggestBooksResult }>();

function getCachedSuggest(key: string): SuggestBooksResult | null {
  const entry = suggestCache.get(key);
  if (!entry) return null;
  if (entry.expires <= Date.now()) {
    suggestCache.delete(key);
    return null;
  }
  return entry.result;
}

function setCachedSuggest(key: string, result: SuggestBooksResult) {
  if (suggestCache.size >= SUGGEST_CACHE_MAX) {
    const first = suggestCache.keys().next().value;
    if (first) suggestCache.delete(first);
  }
  suggestCache.set(key, { expires: Date.now() + SUGGEST_CACHE_TTL_MS, result });
}

/**
 * Lightweight suggestion flood — Google + Open Library page 1 only.
 * Fast enough for debounced typeahead; not a replacement for full search.
 */
export async function suggestBooks(query: string): Promise<SuggestBooksResult> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return { suggestions: [], didYouMean: null };
  }

  const cacheKey = trimmed.toLowerCase();
  const cached = getCachedSuggest(cacheKey);
  if (cached) return cached;

  const correction = knownCorrectionForQuery(trimmed);
  const queries = [trimmed];
  if (correction && correction.query.toLowerCase() !== trimmed.toLowerCase()) {
    queries.push(correction.query);
  }

  const settled = await Promise.allSettled(
    queries.flatMap((q) => [
      searchGoogleBooks(q, 1),
      searchOpenLibrary(q, 1),
    ])
  );

  const books: BookSummary[] = [];
  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    books.push(...(result.value.books ?? []));
  }

  const unique = dedupeBooks(books);
  const suggestions = buildSearchSuggestions(trimmed, unique, 8);
  const didYouMean = findDidYouMean(trimmed, unique);
  const payload = { suggestions, didYouMean };

  if (suggestions.length > 0 || didYouMean) {
    setCachedSuggest(cacheKey, payload);
  }

  return payload;
}
