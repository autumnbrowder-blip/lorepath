import type { BookSummary } from "@/types/book";

/** Canonical buckets used for edition-aware dedupe. */
export type LanguageEditionBucket = "eng" | "non-eng" | "unknown";

const ENGLISH_CODES = new Set([
  "en",
  "eng",
  "en-us",
  "en-gb",
  "en-ca",
  "en-au",
  "english",
]);

/**
 * Normalize provider language tags to a short lowercase code.
 * Accepts `en`, `eng`, `/languages/eng`, `en-US`, etc.
 */
export function normalizeLanguageCode(
  language: string | null | undefined
): string | null {
  if (!language?.trim()) return null;
  let raw = language.trim().toLowerCase();
  const slash = raw.lastIndexOf("/");
  if (slash >= 0) raw = raw.slice(slash + 1);
  raw = raw.replace(/_/g, "-");
  if (!raw) return null;
  return raw;
}

export function isEnglishLanguage(
  language: string | null | undefined
): boolean {
  const code = normalizeLanguageCode(language);
  if (!code) return false;
  if (ENGLISH_CODES.has(code)) return true;
  // en-XX regional tags
  return code === "en" || code.startsWith("en-");
}

/**
 * Titles with non-Latin scripts are almost never English editions —
 * useful when providers omit language on search cards.
 */
export function titleSuggestsNonEnglish(title: string | null | undefined): boolean {
  if (!title?.trim()) return false;
  // CJK, Cyrillic, Arabic, Hebrew, Thai, Hangul, etc.
  return /[\u0400-\u04FF\u0600-\u06FF\u0590-\u05FF\u0E00-\u0E7F\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/.test(
    title
  );
}

export function getLanguageEditionBucket(
  book: Pick<BookSummary, "language" | "title">
): LanguageEditionBucket {
  if (isEnglishLanguage(book.language)) return "eng";
  const code = normalizeLanguageCode(book.language);
  if (code) return "non-eng";
  if (titleSuggestsNonEnglish(book.title)) return "non-eng";
  return "unknown";
}

/**
 * True when two records should stay as separate edition cards
 * (English vs original / other language). Unknown may still merge.
 */
export function shouldKeepAsSeparateLanguageEditions(
  a: Pick<BookSummary, "language" | "title">,
  b: Pick<BookSummary, "language" | "title">
): boolean {
  const bucketA = getLanguageEditionBucket(a);
  const bucketB = getLanguageEditionBucket(b);
  if (bucketA === "unknown" || bucketB === "unknown") return false;
  return bucketA !== bucketB;
}

export function editionLabelForBucket(
  bucket: LanguageEditionBucket
): "original" | "english" | null {
  if (bucket === "eng") return "english";
  if (bucket === "non-eng") return "original";
  return null;
}
