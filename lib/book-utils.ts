import { cleanRawSubjects, normalizeBookTags } from "@/lib/book-tags";
import type { BookSource, BookSummary } from "@/types/book";

export function dedupeStrings(items: string[]): string[] {
  const seen = new Set<string>();

  return items
    .map((item) => item.trim())
    .filter((item) => {
      if (!item) return false;
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function cleanAuthors(authors: string[]): string[] {
  const cleaned = dedupeStrings(
    authors.map((author) => author.replace(/\s+/g, " ").trim())
  );
  return cleaned.length > 0 ? cleaned : ["Unknown author"];
}

/**
 * Keep raw Google / ISBNdb subjects for source-aware finalizeBookTags.
 * Open Library / Gutendex should pass [] instead of calling this.
 */
export function keepProviderSubjects(categories: string[]): string[] {
  return cleanRawSubjects(categories);
}

/** Map raw API categories into the controlled tag vocabulary (legacy helper). */
export function normalizeGenres(categories: string[]): string[] {
  return normalizeBookTags(categories);
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Stub shown only when a book survives with no synopsis from any source. */
export const PLACEHOLDER_DESCRIPTION = "No description available.";

const PLACEHOLDER_DESCRIPTION_PATTERN =
  /^(n\/?a|none|null|undefined|unknown|tbd|-+|\.+|no\s+(description|synopsis|summary|blurb)(\s+(is\s+)?(available|provided|found))?|(description|synopsis|summary)\s+(is\s+)?(not\s+available|unavailable|coming\s+soon|to\s+follow))\.?$/i;

/**
 * Provider filler that means "we have nothing" — never store or display it as
 * a real synopsis, and never let it block enrichment from another source.
 */
export function isPlaceholderDescription(
  description?: string | null
): boolean {
  const text = description?.trim() ?? "";
  if (!text) return true;
  return PLACEHOLDER_DESCRIPTION_PATTERN.test(text);
}

export function cleanDescription(description?: string | null): string | null {
  if (!description) return null;
  const cleaned = stripHtml(description);
  if (!cleaned) return null;
  // Drop provider placeholders at the parse boundary so downstream code can
  // treat "has a description" as "has real text".
  return isPlaceholderDescription(cleaned) ? null : cleaned;
}

/** True when this record carries a synopsis worth showing on a card. */
export function hasRealDescription(
  book: Pick<BookSummary, "description">
): boolean {
  return (
    !isPlaceholderDescription(book.description) &&
    !isWeakDescription(book.description)
  );
}

export function cleanTitle(title?: string | null): string {
  return title?.replace(/\s+/g, " ").trim() || "Untitled";
}

/** Detect queries that look like an author name (e.g. "John Gwynne"). */
export function isAuthorQuery(query: string): boolean {
  const trimmed = query.trim();
  const words = trimmed.split(/\s+/);

  if (words.length < 2 || words.length > 4) return false;
  if (/\d/.test(trimmed)) return false;
  if (!/^[a-zA-Z\s.'-]+$/.test(trimmed)) return false;

  // Title function/content words — "Between Two Fires" must NOT become inauthor:.
  const notAuthorTerms =
    /^(the|a|an|and|of|or|to|in|on|at|by|for|from|with|without|into|onto|upon|over|under|between|among|against|across|through|before|after|during|about|above|below|book|books|novel|novels|series|story|stories|tale|tales|problem|body|three|two|four|five|six|seven|eight|nine|ten|hunger|games|game|fire|fires|catching|mockingjay|harry|potter|ring|rings|king|queen|lord|dark|city|house|world|war|star|night|day|last|first|secret|letter|sun|moon|wind|sea|shadow|stone|blood|heart|bone|sky|red|blue|green|black|white|gold|silver|iron|steel|glass|thorn|crow|wolf|dragon|witch|prince|princess|daughter|daughters|thief|dead|river|fool)$/i;
  if (words.some((word) => notAuthorTerms.test(word))) return false;

  // Author searches are usually proper names (e.g. "John Gwynne")
  if (!words.every((word) => /^[A-Z][a-z]+(?:['-][A-Za-z]+)?$/.test(word))) {
    return false;
  }

  return true;
}

/**
 * True when query and book title are the same work title
 * (case/diacritic/punctuation insensitive; subtitles ignored).
 */
export function isExactTitleMatch(query: string, title: string): boolean {
  const q = normalizeTitleForDedupe(query);
  const t = normalizeTitleForDedupe(title);
  if (!q || !t) return false;
  return q === t;
}

export function formatAuthorSearchQuery(query: string): string {
  return `inauthor:"${query.trim()}"`;
}

/** Filter junk records like "Untitled John Gwynne 1" with no useful metadata. */
export function isLowQualityBook(book: BookSummary): boolean {
  const title = book.title.trim();

  if (/^untitled\b/i.test(title)) return true;
  if (/^unknown$/i.test(title)) return true;

  const hasMetadata =
    Boolean(book.description) ||
    book.genres.length > 0 ||
    Boolean(book.coverUrl) ||
    Boolean(book.publishedYear);

  if (!hasMetadata && /^untitled\b/i.test(title)) return true;

  return false;
}

/**
 * Companion merch / activity books that muddy popular-title searches
 * (e.g. Fourth Wing tarot, crochet, journals, word-search kits).
 */
export function isMerchandiseOrCompanion(book: BookSummary): boolean {
  const title = book.title.toLowerCase();
  return /tarot|crochet|knitting|coloring book|\bjournal\b|word[\s-]?search|pencil|activity book|sticker|workbook|puzzle book|boxed?\s+set|collection set|official companion|parody|unofficial|cookbook|recipe|calendar|planner|diary|\bkit\b/i.test(
    title
  );
}

/** Thin or subject-list blurbs that should lose to a real synopsis. */
export function isWeakDescription(description?: string | null): boolean {
  const text = description?.trim() ?? "";
  if (!text) return true;
  if (isPlaceholderDescription(text)) return true;
  if (text.length < 40) return true;
  // Gutendex-style subject strings: "Fiction, Science fiction, Adventure, ..."
  if (text.split(",").length >= 4 && text.length < 140 && !/[.!?].{20}/.test(text)) {
    return true;
  }
  return false;
}

export function countQualityBooks(books: BookSummary[]): number {
  return books.filter(
    (book) =>
      !isLowQualityBook(book) &&
      (Boolean(book.description) || book.genres.length > 0)
  ).length;
}

export function parsePublishedYear(value?: string | number | null): number | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    const year = Math.trunc(value);
    return year >= 1000 && year <= 2100 ? year : null;
  }

  const match = String(value).match(/\b(1[0-9]{3}|20[0-2][0-9])\b/);
  if (!match) return null;

  const year = Number(match[1]);
  return year >= 1000 && year <= 2100 ? year : null;
}

/** Normalize any publishedYear field to a valid year or null. */
export function normalizePublishedYear(
  year: number | null | undefined
): number | null {
  return parsePublishedYear(year ?? null);
}

/**
 * Prefer the newest known publication year across merged sources.
 * Missing years never override a real year.
 */
export function pickPublishedYear(
  ...years: Array<number | null | undefined>
): number | null {
  let best: number | null = null;
  for (const year of years) {
    const normalized = normalizePublishedYear(year);
    if (normalized == null) continue;
    if (best == null || normalized > best) best = normalized;
  }
  return best;
}

/**
 * Prefer the earliest known publication year (original / first publish).
 * Missing years never override a real year.
 */
export function pickEarliestYear(
  ...years: Array<number | null | undefined>
): number | null {
  let best: number | null = null;
  for (const year of years) {
    const normalized = normalizePublishedYear(year);
    if (normalized == null) continue;
    if (best == null || normalized < best) best = normalized;
  }
  return best;
}

/**
 * Resolve display years for a work card / detail panel.
 * Prefers original publication; exposes latest edition when it differs.
 */
export function resolvePublicationYears(book: Pick<
  BookSummary,
  "publishedYear" | "firstPublishYear" | "latestEditionYear"
>): {
  displayYear: number | null;
  firstPublishYear: number | null;
  latestEditionYear: number | null;
} {
  const published = normalizePublishedYear(book.publishedYear);
  const explicitLatest = normalizePublishedYear(book.latestEditionYear);
  const latest = pickPublishedYear(explicitLatest, published);
  const first =
    normalizePublishedYear(book.firstPublishYear) ??
    (explicitLatest != null && published != null && published < explicitLatest
      ? published
      : latest);
  const latestEdition =
    latest != null && first != null && latest > first ? latest : null;
  return {
    displayYear: first ?? latest,
    firstPublishYear: first,
    latestEditionYear: latestEdition,
  };
}

/** Convert ISBN-10 digits to ISBN-13 (978…) when valid. */
function isbn10ToIsbn13(isbn10: string): string | null {
  if (!/^\d{9}[\dXx]$/.test(isbn10)) return null;
  const core = `978${isbn10.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(core[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return `${core}${check}`;
}

/** Normalize any ISBN-10/13 string to a comparable ISBN-13 digit key. */
export function normalizeIsbn(isbn: string | null | undefined): string | null {
  if (!isbn) return null;
  const digits = isbn.replace(/\D/g, "").toUpperCase();
  if (digits.length === 13 && /^\d{13}$/.test(digits)) return digits;
  if (digits.length === 10) return isbn10ToIsbn13(digits);
  return null;
}

/**
 * Fold diacritics deterministically ("Brontë" → "Bronte", "Café" → "Cafe")
 * so accented and unaccented provider spellings produce the same key.
 */
function foldDiacritics(text: string): string {
  return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Aggressive title key for dedupe: lowercase, fold diacritics, drop
 * subtitles / edition fluff, strip series numbering and punctuation,
 * then drop a leading article ("The Wren…" === "Wren…").
 */
export function normalizeTitleForDedupe(title: string): string {
  let text = foldDiacritics(title).toLowerCase().trim();

  // Drop parenthetical / bracketed edition notes
  text = text.replace(/\([^)]*\)/g, " ");
  text = text.replace(/\[[^\]]*\]/g, " ");

  // Series-first titles: "Wilderwood, T1 : For the Wolf" → keep book title
  {
    const colonParts = text.split(/\s*[:：]\s*/);
    if (colonParts.length > 1) {
      const first = (colonParts[0] ?? "").trim();
      const rest = colonParts.slice(1).join(" ").trim();
      if (
        rest.length >= 4 &&
        /\bt\s*\d+\b|\bbook\s*\d+\b|\bvol\.?\s*\d+\b|\btome\s*\d+\b/i.test(
          first
        )
      ) {
        text = rest;
      } else {
        text = first;
      }
    }
  }

  text = text.replace(/\s+[—–]\s+.*$/, "");
  text = text.replace(/\s+-\s+.*$/, "");

  // ISBNdb (UK feeds especially) appends unpunctuated marketing clauses:
  //   "<Title> From the number one Sunday Times bestselling author of <Other>"
  //   "<Title> The No. 1 Sunday Times Bestseller and start of an addictive…"
  // Strip from the clause to the end, but never down to an empty title.
  const marketingTails = [
    /\bfrom\s+the\s+.{0,60}?\bbestselling\s+(?:\w+\s+)?author\s+of\b.*$/,
    /\b(?:the\s+)?(?:no\.?\s*\d+\s+|number\s+one\s+|#\s*\d+\s+)?(?:sunday|new\s+york)\s+times\s+bestseller\b.*$/,
  ];
  for (const pattern of marketingTails) {
    const stripped = text.replace(pattern, " ").trim();
    if (stripped) text = stripped;
  }

  const editionFluff = [
    /\ba\s+novel\b/g,
    /\bthe\s+novel\b/g,
    /\bdeluxe\s+limited\s+edition\b/g,
    /\bdeluxe\s+edition\b/g,
    /\bspecial\s+edition\b/g,
    /\bexclusive\s+edition\b/g,
    /\bstandard\s+edition\b/g,
    /\bcollector'?s?\s+edition\b/g,
    /\blimited\s+edition\b/g,
    /\bexpanded\s+edition\b/g,
    /\billustrated\s+edition\b/g,
    /\banniversary\s+edition\b/g,
    /\bupdated\s+edition\b/g,
    /\brevised\s+edition\b/g,
    /\blibrary\s+edition\b/g,
    /\bmovie\s+tie[- ]?in(?:\s+edition)?\b/g,
    /\bfilm\s+tie[- ]?in(?:\s+edition)?\b/g,
    /\btie[- ]?in\s+edition\b/g,
    /\bunabridged\b/g,
    /\babridged\b/g,
    /\bhardcover\b/g,
    /\bpaperback\b/g,
    /\bmass\s+market(?:\s+paperback)?\b/g,
    /\btrade\s+paperback\b/g,
    /\be-?book\b/g,
    /\bkindle\s+edition\b/g,
    /\blarge\s+print\b/g,
    /\bbook\s+(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/g,
    /\bvolume\s+(one|two|three|four|five|\d+)\b/g,
    /\bvol\.?\s*\d+\b/g,
    /\bpart\s+(one|two|three|four|five|\d+)\b/g,
    /#\s*\d+\b/g,
    /\bthe\s+new\s+york\s+times\s+bestseller\b/g,
    /\bnew\s+york\s+times\s+bestseller\b/g,
    /\b#1\s+bestseller\b/g,
    /\binternational\s+bestseller\b/g,
    /\bbestselling\b/g,
    /\bbestseller\b/g,
  ];
  for (const pattern of editionFluff) {
    text = text.replace(pattern, " ");
  }

  text = text
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Leading articles never distinguish editions: "The Wren in the Holly
  // Library" and "Wren in the Holly Library" are the same book. Only strip
  // when something remains, so titles like "It" or "The The" stay keyable.
  const withoutArticle = text.replace(/^(?:the|a|an)\s+/, "");
  return withoutArticle || text;
}

/**
 * Normalize authors for dedupe: "Last, First" → "first last", strip Jr/Sr,
 * punctuation, case.
 */
export function normalizeAuthorForDedupe(author: string): string {
  let text = foldDiacritics(author).toLowerCase().trim();
  if (!text || text === "unknown author") return "";

  if (text.includes(",")) {
    const [last, ...rest] = text.split(",").map((part) => part.trim());
    text = `${rest.filter(Boolean).join(" ")} ${last}`.trim();
  }

  text = text.replace(
    /\b(jr\.?|sr\.?|ii|iii|iv|phd\.?|m\.?d\.?|esq\.?)\b/g,
    " "
  );

  return text
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Aggressive author token: last name + first initial.
 * Collapses "Hannah Whitten" / "H. Whitten" / "Whitten, Hannah".
 */
export function normalizeAuthorKeyForDedupe(author: string): string {
  const normalized = normalizeAuthorForDedupe(author);
  if (!normalized) return "";
  const parts = normalized.split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  const firstInitial = parts[0][0] ?? "";
  return `${last} ${firstInitial}`.trim();
}

/** Pull a comparable ISBN key from summary fields or known id prefixes. */
export function getBookIsbnKey(
  book: Pick<BookSummary, "id" | "isbn">
): string | null {
  const fromField = normalizeIsbn(book.isbn ?? null);
  if (fromField) return fromField;

  const id = book.id;
  if (id.startsWith("isbndb-")) {
    return normalizeIsbn(id.slice("isbndb-".length));
  }
  if (id.startsWith("nyt-")) {
    return normalizeIsbn(id.slice("nyt-".length));
  }
  return null;
}

/**
 * Author component of the dedupe key. Prefer the primary (first listed) author
 * so a stray editor/co-author cannot fork the work identity. Providers that
 * reverse co-author order still collapse when the shared last+initial matches
 * via the soft-compatible merge pass in finalize.
 */
function authorKeyPart(authors: string[]): string {
  for (const author of authors) {
    const key = normalizeAuthorKeyForDedupe(author);
    if (key) return key;
  }
  return "";
}

/**
 * True when two author keys refer to the same person at work level.
 * "buehlman" (last only) matches "buehlman c"; initials must agree when both set.
 */
export function authorKeysCompatible(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [aLast, aInit] = a.split(" ");
  const [bLast, bInit] = b.split(" ");
  if (!aLast || aLast !== bLast) return false;
  if (!aInit || !bInit) return true;
  return aInit === bInit;
}

/**
 * Stable dedupe key: normalized title + "::" + normalized author token.
 *
 * Unknown-author fallback: two same-title records without an author could be
 * different works, so we only collapse them when a stronger signal (shared
 * ISBN, or literally the same record id) says they are the same edition.
 */
function bookDedupeKey(
  book: Pick<BookSummary, "title" | "authors" | "isbn" | "id">
): string {
  const title = normalizeTitleForDedupe(book.title);
  const author = authorKeyPart(book.authors);
  if (author) return `${title}::${author}`;

  const isbn = getBookIsbnKey(book);
  return `${title}::unknown:${isbn ?? book.id}`;
}

export function getBookDedupeKey(
  book: Pick<BookSummary, "title" | "authors" | "isbn" | "id">
): string {
  return bookDedupeKey(book);
}

/** Title-only portion of the work key (for soft author-compatible merges). */
export function getBookTitleDedupeKey(
  book: Pick<BookSummary, "title">
): string {
  return normalizeTitleForDedupe(book.title);
}

export function getBookAuthorDedupeKey(
  book: Pick<BookSummary, "authors">
): string {
  return authorKeyPart(book.authors);
}

/** Richer-metadata sources break exact ties during dedupe. */
const SOURCE_DEDUP_BONUS: Record<BookSource, number> = {
  isbndb: 4,
  google: 4,
  bigbook: 3,
  nyt: 2,
  openlibrary: 1,
  gutendex: 0,
};

/**
 * How complete a record's remaining metadata is (page count, genres, ISBN,
 * real author, description length, source richness). Used as the last
 * winner-priority tier, after description / cover / published year.
 */
export function metadataCompletenessScore(book: BookSummary): number {
  let score = 0;
  if (book.pageCount && book.pageCount > 0) score += 2;
  if (book.genres.length > 0) score += 2;
  if (getBookIsbnKey(book)) score += 2;
  if (book.authors.length > 0 && book.authors[0] !== "Unknown author") {
    score += 1;
  }
  score += Math.min((book.description?.trim().length ?? 0) / 200, 2);
  score += SOURCE_DEDUP_BONUS[book.source] ?? 0;
  return score;
}

export type PickPreferredOptions = {
  /**
   * External ids/slugs that already have community (or user) ratings in our
   * database. These win identity so ratings stay attached after merge.
   */
  ratedIds?: ReadonlySet<string>;
};

/**
 * Keep the stronger record when duplicates collide. Priority, in order:
 * 1. book that already has ratings in our database
 * 2. stronger description (real blurb beats stub/empty)
 * 3. has a cover image
 * 4. more complete metadata (page count, genres, ISBN, author, source)
 * 5. known publication year (any year beats unknown)
 * Ties fall back to a stable id comparison so results are deterministic.
 *
 * Note: newest edition year does NOT win identity — years are merged as
 * firstPublishYear (min) + publishedYear (max) on the survivor.
 */
export function pickPreferredDuplicate<T extends BookSummary>(
  a: T,
  b: T,
  options?: PickPreferredOptions
): T {
  const ratedIds = options?.ratedIds;
  if (ratedIds && ratedIds.size > 0) {
    const aRated = ratedIds.has(a.id);
    const bRated = ratedIds.has(b.id);
    if (aRated !== bRated) return aRated ? a : b;
  }

  const aDescLen = a.description?.trim().length ?? 0;
  const bDescLen = b.description?.trim().length ?? 0;
  const aStrongDesc = aDescLen >= 40 && !isWeakDescription(a.description);
  const bStrongDesc = bDescLen >= 40 && !isWeakDescription(b.description);
  if (aStrongDesc !== bStrongDesc) return bStrongDesc ? b : a;
  if ((aDescLen > 0) !== (bDescLen > 0)) return bDescLen > 0 ? b : a;

  const aCover = Boolean(a.coverUrl?.trim());
  const bCover = Boolean(b.coverUrl?.trim());
  if (aCover !== bCover) return bCover ? b : a;

  const aScore = metadataCompletenessScore(a);
  const bScore = metadataCompletenessScore(b);
  if (aScore !== bScore) return bScore > aScore ? b : a;

  // Prefer longer description when both are otherwise comparable.
  if (aDescLen !== bDescLen) return bDescLen > aDescLen ? b : a;

  const aYear = normalizePublishedYear(a.publishedYear);
  const bYear = normalizePublishedYear(b.publishedYear);
  if ((aYear == null) !== (bYear == null)) return aYear != null ? a : b;

  return a.id.localeCompare(b.id) <= 0 ? a : b;
}

/**
 * Collapse duplicates by title+author (and identical ids).
 * Keeps the winner per pickPreferredDuplicate; field merging happens in
 * finalizeSearchBooks so provider-level and final dedupe agree on identity.
 */
export function dedupeBooks<T extends BookSummary>(
  books: T[],
  options?: PickPreferredOptions
): T[] {
  const byId = new Map<string, T>();
  const byKey = new Map<string, T>();

  for (const book of books) {
    const existingId = byId.get(book.id);
    const candidate = existingId
      ? pickPreferredDuplicate(existingId, book, options)
      : book;
    byId.set(book.id, candidate);
  }

  for (const book of Array.from(byId.values())) {
    const key = bookDedupeKey(book);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, book);
      continue;
    }
    byKey.set(key, pickPreferredDuplicate(existing, book, options));
  }

  return Array.from(byKey.values());
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}...`;
}

/** Alternate queries used only when the primary search returns weak matches. */
export function buildAlternateSearchQueries(raw: string): string[] {
  const query = raw.trim();
  const alternates: string[] = [];

  if (/^3[\s-]+body[\s-]+problem/i.test(query)) {
    alternates.push('intitle:"the three-body problem" inauthor:cixin');
    alternates.push("three body problem cixin liu");
  }

  if (/^three[\s-]+body[\s-]+problem/i.test(query)) {
    alternates.push('intitle:"the three-body problem" inauthor:cixin');
  }

  if (/hunger[\s-]+games/i.test(query)) {
    alternates.push('intitle:"the hunger games" inauthor:collins');
    alternates.push("hunger games suzanne collins");
  }

  return alternates;
}

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/\b3\b/g, "three")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isAcademicNoise(book: BookSummary): boolean {
  const title = book.title.toLowerCase();
  const noise =
    /abstracts|proceedings|quarterly|handbook|journal|reports|briefs|letters|scientific and technical|space programs summary|psychological abstracts|physics briefs|astronomical journal|mathematical monthly|nuclear science|restricted|singularity|orbits?|astrodynamics|perturbation/i;
  if (noise.test(title)) return true;
  if (
    book.authors.length === 1 &&
    book.authors[0].toLowerCase() === "unknown author" &&
    !book.description
  ) {
    return true;
  }
  return false;
}

export function scoreBookRelevance(book: BookSummary, query: string): number {
  const normalizedQuery = normalizeForMatch(query);
  const normalizedTitle = normalizeForMatch(book.title);
  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  const titleLower = book.title.toLowerCase();
  const authorSearch = isAuthorQuery(query);

  let score = 0;

  // Exact title matches always rise to the top (never buried by merch/noise).
  if (isExactTitleMatch(query, book.title)) {
    score += 250;
    // Prefer the well-known novel edition when many works share the title.
    if (/buehlman/i.test(book.authors.join(" "))) score += 80;
  }

  if (authorSearch) {
    const authorMatches = book.authors.some((author) =>
      author.toLowerCase().includes(query.toLowerCase())
    );
    if (authorMatches) score += 30;
  }

  // Strong boost for well-known novel titles
  if (/^the three[- ]body problem$/i.test(book.title.trim())) score += 45;
  if (/^the hunger games$/i.test(book.title.trim())) score += 45;
  if (/^fourth wing$/i.test(book.title.trim())) score += 45;
  if (/^dune$/i.test(book.title.trim())) score += 40;
  if (/^between two fires$/i.test(book.title.trim())) score += 45;

  if (!authorSearch) {
    if (normalizedTitle === normalizedQuery) score += 50;
    else if (normalizedTitle.startsWith(normalizedQuery)) score += 38;
    else if (normalizedTitle.includes(normalizedQuery)) score += 30;

    const matchedTokens = queryTokens.filter((token) =>
      normalizedTitle.includes(token)
    );
    score += matchedTokens.length * 5;

    // Prefer compact titles that match the query over long marketing titles.
    if (
      normalizedTitle === normalizedQuery ||
      normalizedTitle.startsWith(`${normalizedQuery} `)
    ) {
      score += 12;
    }
  }

  if (book.description && !isWeakDescription(book.description)) score += 8;
  else if (isExactTitleMatch(query, book.title)) score += 8;
  else if (book.description) score += 1;
  if (book.coverUrl) score += 3;
  if (book.authors[0]?.toLowerCase() !== "unknown author") score += 3;
  if (book.publishedYear && book.publishedYear >= 1900) score += 1;
  if (book.genres.length > 0) score += 2;

  // Prefer commercial catalog + Open Library over Gutenberg keyword noise.
  if (book.source === "google") score += 6;
  else if (book.source === "openlibrary") score += 5;
  else if (book.source === "isbndb") score += 4;
  else if (book.source === "bigbook") score += 3;
  else if (book.source === "gutendex") score -= 18;

  // Deprioritize sequel volumes when searching for the main title
  if (
    !authorSearch &&
    /dark forest|death'?s end|book 2|book 3|series book/i.test(titleLower) &&
    !/series|book 2|book 3/i.test(query)
  ) {
    score -= 20;
  }

  if (isMerchandiseOrCompanion(book)) score -= 80;
  if (isAcademicNoise(book)) score -= 50;
  if (isLowQualityBook(book)) score -= 100;

  return score;
}

export function rankSearchResults(
  books: BookSummary[],
  query: string
): BookSummary[] {
  const scored = [...books]
    .map((book) => ({ book, score: scoreBookRelevance(book, query) }))
    .sort((a, b) => b.score - a.score);

  const filtered = scored.filter(({ score }) => score > -10);
  const results = (filtered.length > 0 ? filtered : scored).map(
    ({ book }) => book
  );

  return results;
}

function hasDescription(book: BookSummary): boolean {
  return Boolean(book.description?.trim());
}

/**
 * Primary: newest publication year first (missing years last).
 * Then: description + cover quality, then title / id tiebreak.
 */
export function sortByPublishedYearDesc(books: BookSummary[]): BookSummary[] {
  return [...books].sort((a, b) => {
    const aYear = normalizePublishedYear(a.publishedYear);
    const bYear = normalizePublishedYear(b.publishedYear);

    if (aYear == null && bYear != null) return 1;
    if (bYear == null && aYear != null) return -1;
    if (aYear != null && bYear != null && aYear !== bYear) {
      return bYear - aYear; // newest first
    }

    const aDesc = hasDescription(a);
    const bDesc = hasDescription(b);
    if (aDesc !== bDesc) return aDesc ? -1 : 1;

    const aCover = Boolean(a.coverUrl?.trim());
    const bCover = Boolean(b.coverUrl?.trim());
    if (aCover !== bCover) return aCover ? -1 : 1;

    const titleCmp = a.title.localeCompare(b.title, "en", {
      sensitivity: "base",
    });
    if (titleCmp !== 0) return titleCmp;

    return a.id.localeCompare(b.id);
  });
}
