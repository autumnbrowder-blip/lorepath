import { CANONICAL_TAGS, type CanonicalTag } from "@/lib/book-tags";
import { sortByPublishedYearDesc } from "@/lib/book-utils";
import type { BookSummary } from "@/types/book";

export type BookSearchMode = "text" | "genre";

export type SearchBooksOptions = {
  mode?: BookSearchMode;
};

const CANONICAL_SET = new Set<string>(
  CANONICAL_TAGS.map((tag) => tag.toLowerCase())
);

export const GENRE_PAGE_SIZE = 40;

/** Prefer searching the parent family when browsing a sub-genre. */
function googleSubjectFor(tag: CanonicalTag): string {
  switch (tag) {
    case "Grimdark":
    case "Dark Fantasy":
      return 'subject:"Dark Fantasy" OR subject:Grimdark OR subject:Fantasy';
    case "Epic Fantasy":
      return 'subject:"Epic Fantasy" OR subject:"High Fantasy" OR subject:Fantasy';
    case "Romantic Fantasy":
      return 'subject:"Fantasy Romance" OR subject:Romantasy OR subject:Fantasy';
    case "Urban Fantasy":
      return 'subject:"Urban Fantasy" OR subject:Fantasy';
    case "Space Opera":
      return 'subject:"Space Opera" OR subject:"Science Fiction"';
    case "Cyberpunk":
      return 'subject:Cyberpunk OR subject:"Science Fiction"';
    case "Dystopian":
      return 'subject:Dystopian OR subject:"Science Fiction"';
    case "Psychological Thriller":
      return 'subject:"Psychological Thriller" OR subject:Thriller';
    case "Fantasy":
      return "subject:Fantasy";
    case "Science Fiction":
      return 'subject:"Science Fiction"';
    case "Horror":
      return "subject:Horror";
    case "Romance":
      return "subject:Romance";
    case "Mystery":
      return "subject:Mystery";
    case "Thriller":
      return "subject:Thriller";
    case "Historical Fiction":
      return 'subject:"Historical Fiction"';
    case "Adventure":
      return 'subject:Adventure OR subject:"Action & Adventure"';
    case "Fiction":
      return "subject:Fiction";
    case "Nonfiction":
      return 'subject:Nonfiction OR subject:"Non-fiction"';
    case "Young Adult":
      return 'subject:"Young Adult Fiction" OR subject:"Young Adult"';
    default:
      return `subject:${tag}`;
  }
}

const GOOGLE_SUBJECT_QUERY = Object.fromEntries(
  CANONICAL_TAGS.map((tag) => [tag, googleSubjectFor(tag)])
) as Record<CanonicalTag, string>;

const OPEN_LIBRARY_SUBJECT = Object.fromEntries(
  CANONICAL_TAGS.map((tag) => [
    tag,
    tag.toLowerCase().replace(/\s+/g, "_"),
  ])
) as Record<CanonicalTag, string>;

const GUTENDEX_TOPIC = Object.fromEntries(
  CANONICAL_TAGS.map((tag) => [tag, tag.toLowerCase()])
) as Record<CanonicalTag, string>;

export function isGenreSearchMode(mode?: string | null): boolean {
  return mode === "genre";
}

export function isCanonicalGenreTag(value: string): value is CanonicalTag {
  return CANONICAL_SET.has(value.trim().toLowerCase());
}

export function normalizeGenreQuery(value: string): string {
  const trimmed = value.trim();
  const match = CANONICAL_TAGS.find(
    (tag) => tag.toLowerCase() === trimmed.toLowerCase()
  );
  return match ?? trimmed;
}

export function toGoogleSubjectQuery(genre: string): string {
  const normalized = normalizeGenreQuery(genre);
  if (normalized in GOOGLE_SUBJECT_QUERY) {
    return GOOGLE_SUBJECT_QUERY[normalized as CanonicalTag];
  }
  return `subject:${normalized}`;
}

/** Open Library subject for genre *search* only — never used as book tags. */
export function toOpenLibrarySubject(genre: string): string {
  const normalized = normalizeGenreQuery(genre);
  if (normalized in OPEN_LIBRARY_SUBJECT) {
    return OPEN_LIBRARY_SUBJECT[normalized as CanonicalTag];
  }
  return normalized.toLowerCase().replace(/\s+/g, "_");
}

/** Gutendex topic for genre *search* only — never used as book tags. */
export function toGutendexTopic(genre: string): string {
  const normalized = normalizeGenreQuery(genre);
  if (normalized in GUTENDEX_TOPIC) {
    return GUTENDEX_TOPIC[normalized as CanonicalTag];
  }
  return normalized.toLowerCase();
}

export function preferMatchingGenreTags(
  books: BookSummary[],
  genre: string
): BookSummary[] {
  const target = normalizeGenreQuery(genre).toLowerCase();
  const matched: BookSummary[] = [];
  const rest: BookSummary[] = [];

  for (const book of books) {
    if (book.genres.some((tag) => tag.toLowerCase() === target)) {
      matched.push(book);
    } else {
      rest.push(book);
    }
  }

  return [
    ...sortByPublishedYearDesc(matched),
    ...sortByPublishedYearDesc(rest),
  ];
}
