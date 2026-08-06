import type { BookDetail } from "@/types/book";

/**
 * Provider payloads are not always the shape their types claim. Open Library's
 * `jscmd=data` endpoint, for example, returns `publishers: [{ name }]` where the
 * editions endpoint returns plain strings. Rendering such an object throws
 * "Objects are not valid as a React child" and takes down the whole tome page,
 * so every text field is coerced before it reaches the UI.
 */
export function toDisplayText(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim() || null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const text = toDisplayText(entry);
      if (text) return text;
    }
    return null;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["name", "value", "title", "key"]) {
      const text = toDisplayText(record[key]);
      if (text) return text;
    }
  }
  return null;
}

function toDisplayTextList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    const single = toDisplayText(value);
    return single ? [single] : [];
  }
  return value
    .map((entry) => toDisplayText(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** Coerce a resolved detail record into something React can always render. */
export function normalizeBookDetailForDisplay(book: BookDetail): BookDetail {
  const authors = toDisplayTextList(book.authors);

  return {
    ...book,
    title: toDisplayText(book.title) ?? "Untitled",
    authors: authors.length > 0 ? authors : ["Unknown author"],
    genres: toDisplayTextList(book.genres),
    description: toDisplayText(book.description),
    coverUrl: toDisplayText(book.coverUrl),
    publisher: toDisplayText(book.publisher),
    language: toDisplayText(book.language),
    isbn: toDisplayText(book.isbn),
    pageCount: toFiniteNumber(book.pageCount),
    publishedYear: toFiniteNumber(book.publishedYear),
    firstPublishYear: toFiniteNumber(book.firstPublishYear),
    latestEditionYear: toFiniteNumber(book.latestEditionYear),
  };
}
