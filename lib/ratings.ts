import { DEFAULT_AVATAR_KEY } from "@/lib/avatars";
import { ensureBookRow, findBookIdBySlugOrIsbn, sourceFromBookSlug } from "@/lib/book-cache";
import { getBookById } from "@/lib/books";
import { groupRatedBooksByWork } from "@/lib/book-work";
import {
  normalizeAuthorForDedupe,
  normalizeTitleForDedupe,
  parsePublishedYear,
} from "@/lib/book-utils";
import {
  DEFAULT_RATINGS,
  RATING_CATEGORIES,
} from "@/lib/rating-categories";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  createJwtPostgrestClient,
  createServiceRoleClient,
  getTrustedUserDataClient,
  getVerifiedUser,
} from "@/lib/supabase/server";
import {
  isColumnMarkedMissing,
  isNonRetryableDataApiError,
  markColumnMissing,
  noteMissingColumnFromError,
} from "@/lib/supabase/schema-cache";
import type { ContentRating } from "@/types";
import type { BookDetail, BookSource, BookSummary } from "@/types/book";
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import { cache } from "react";

const RATING_KEYS: (keyof ContentRating)[] = [
  "sexual_content",
  "romance",
  "lgbt",
  "horror",
  "ideology",
  "pacing",
];

const RATING_SELECT =
  "sexual_content, romance, lgbt, horror, ideology, pacing";
const LEGACY_RATING_SELECT =
  "sexual_content, lgbt, horror, ideology, pacing";

const RATINGS_SQL_HINT =
  "Run supabase/migrations/20260716_fix_ratings_production.sql in the Supabase SQL Editor, then try again.";

const RLS_HINT =
  "Those marks could not be recorded. Stay on this page and try again. If it fails twice, sign in again.";

const GRANT_HINT =
  `Could not save rating (permission denied on ratings/books). ${RATINGS_SQL_HINT}`;

const FK_HINT =
  "Could not save rating because no profile exists for your account (foreign key). Sign out and back in, or open /profile once, then try again.";

const ROMANCE_HINT =
  "Your database is missing the romance column on ratings. Run supabase/migrations/20260716_add_romance_category.sql (or 20260716_fix_ratings_production.sql) in the Supabase SQL Editor, then try again.";

export type CommunityRatingsSummary = {
  averages: ContentRating | null;
  count: number;
};

function averageCategory(
  ratings: ContentRating[],
  key: keyof ContentRating
): number {
  const sum = ratings.reduce((total, rating) => total + rating[key], 0);
  return Math.round((sum / ratings.length) * 10) / 10;
}

function clampRating(value: unknown, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.min(5, Math.max(0, Math.round(value)));
}

function normalizeUserRating(
  row: {
    sexual_content?: number | null;
    romance?: number | null;
    lgbt?: number | null;
    horror?: number | null;
    ideology?: number | null;
    pacing?: number | null;
  } | null | undefined
): ContentRating {
  return {
    sexual_content: clampRating(
      row?.sexual_content,
      DEFAULT_RATINGS.sexual_content
    ),
    romance: clampRating(row?.romance, DEFAULT_RATINGS.romance),
    lgbt: clampRating(row?.lgbt, DEFAULT_RATINGS.lgbt),
    horror: clampRating(row?.horror, DEFAULT_RATINGS.horror),
    ideology: clampRating(row?.ideology, DEFAULT_RATINGS.ideology),
    pacing: clampRating(row?.pacing, DEFAULT_RATINGS.pacing),
  };
}

async function fetchUserRatingRow(
  supabase: SupabaseClient,
  bookDbId: string,
  userId: string
): Promise<{ data: ContentRating | null; error: string | null }> {
  // Assumes unique index ratings(book_id, rated_by). Never SELECT without both.
  if (isColumnMarkedMissing("ratings", "romance")) {
    const legacy = await supabase
      .from("ratings")
      .select(LEGACY_RATING_SELECT)
      .eq("book_id", bookDbId)
      .eq("rated_by", userId)
      .maybeSingle();

    if (legacy.error) {
      return { data: null, error: legacy.error.message };
    }
    if (!legacy.data) {
      return { data: null, error: null };
    }
    return {
      data: normalizeUserRating({
        ...legacy.data,
        romance: DEFAULT_RATINGS.romance,
      }),
      error: null,
    };
  }

  const full = await supabase
    .from("ratings")
    .select(RATING_SELECT)
    .eq("book_id", bookDbId)
    .eq("rated_by", userId)
    .maybeSingle();

  if (full.error) {
    if (isNonRetryableDataApiError(full.error.message, full.error.code)) {
      return { data: null, error: full.error.message };
    }
    if (noteMissingColumnFromError("ratings", "romance", full.error.message)) {
      const legacy = await supabase
        .from("ratings")
        .select(LEGACY_RATING_SELECT)
        .eq("book_id", bookDbId)
        .eq("rated_by", userId)
        .maybeSingle();

      if (legacy.error) {
        return { data: null, error: legacy.error.message };
      }
      if (!legacy.data) {
        return { data: null, error: null };
      }
      return {
        data: normalizeUserRating({
          ...legacy.data,
          romance: DEFAULT_RATINGS.romance,
        }),
        error: null,
      };
    }
    return { data: null, error: full.error.message };
  }
  if (!full.data) {
    return { data: null, error: null };
  }
  return { data: normalizeUserRating(full.data), error: null };
}

async function fetchAllRatingsForBook(
  supabase: SupabaseClient,
  bookDbId: string,
  signal?: AbortSignal
): Promise<{ data: ContentRating[]; error: string | null }> {
  // Community averages for one book — rating columns only.
  // Assumes index ratings(book_id). Never scan the full ratings table.
  if (isColumnMarkedMissing("ratings", "romance")) {
    let legacyQuery = supabase
      .from("ratings")
      .select(LEGACY_RATING_SELECT)
      .eq("book_id", bookDbId);
    if (signal) legacyQuery = legacyQuery.abortSignal(signal);
    const legacy = await legacyQuery;

    if (legacy.error) {
      return { data: [], error: legacy.error.message };
    }

    return {
      data: (legacy.data ?? []).map((row) =>
        normalizeUserRating({
          ...row,
          romance: DEFAULT_RATINGS.romance,
        })
      ),
      error: null,
    };
  }

  let fullQuery = supabase
    .from("ratings")
    .select(RATING_SELECT)
    .eq("book_id", bookDbId);
  if (signal) fullQuery = fullQuery.abortSignal(signal);
  const full = await fullQuery;

  if (full.error) {
    if (isNonRetryableDataApiError(full.error.message, full.error.code)) {
      return { data: [], error: full.error.message };
    }
    if (noteMissingColumnFromError("ratings", "romance", full.error.message)) {
      let legacyQuery = supabase
        .from("ratings")
        .select(LEGACY_RATING_SELECT)
        .eq("book_id", bookDbId);
      if (signal) legacyQuery = legacyQuery.abortSignal(signal);
      const legacy = await legacyQuery;

      if (legacy.error) {
        return { data: [], error: legacy.error.message };
      }

      return {
        data: (legacy.data ?? []).map((row) =>
          normalizeUserRating({
            ...row,
            romance: DEFAULT_RATINGS.romance,
          })
        ),
        error: null,
      };
    }
    return { data: [], error: full.error.message };
  }

  return {
    data: (full.data ?? []).map((row) => normalizeUserRating(row)),
    error: null,
  };
}

function summarizeCommunityRatings(
  ratings: ContentRating[]
): CommunityRatingsSummary {
  if (ratings.length === 0) {
    return { averages: null, count: 0 };
  }

  const averages = Object.fromEntries(
    RATING_KEYS.map((key) => [key, averageCategory(ratings, key)])
  ) as ContentRating;

  return { averages, count: ratings.length };
}

/**
 * Ratings reads must be authorized. Service role for community/user trusted
 * reads; never the anon key (that 401/42501s and inflates Data API failures).
 */
function resolveRatingsReadClient(): SupabaseClient | null {
  const admin = createServiceRoleClient();
  if (!("error" in admin)) {
    return admin.supabase;
  }
  return null;
}

function isMissingRomanceColumn(message: string): boolean {
  return (
    /romance/i.test(message) &&
    (/does not exist/i.test(message) ||
      /could not find/i.test(message) ||
      /schema cache/i.test(message) ||
      /PGRST204/i.test(message))
  );
}

function isForeignKeyError(message: string): boolean {
  return (
    /foreign key/i.test(message) ||
    /23503/.test(message) ||
    /violates foreign key constraint/i.test(message)
  );
}

function isGrantError(message: string): boolean {
  return (
    /permission denied for (table|relation) (ratings|books)/i.test(message) ||
    (/permission denied/i.test(message) &&
      /(ratings|books)/i.test(message))
  );
}

function isRlsError(message: string): boolean {
  return (
    /row-level security/i.test(message) ||
    /violates row-level security/i.test(message) ||
    /42501/.test(message) ||
    (/permission denied/i.test(message) && !isGrantError(message))
  );
}

function formatRatingError(message: string): string {
  if (isMissingRomanceColumn(message)) return ROMANCE_HINT;
  if (isForeignKeyError(message)) return FK_HINT;
  if (isGrantError(message)) return GRANT_HINT;
  if (isRlsError(message)) return RLS_HINT;
  return message || "Failed to save rating. Please try again.";
}

async function ensureProfileExists(
  supabase: SupabaseClient,
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    return { ok: false, error: formatRatingError(profileError.message) };
  }

  if (profile) return { ok: true };

  if (isColumnMarkedMissing("profiles", "avatar_key")) {
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: userId }, { onConflict: "id" });
    if (error) {
      return { ok: false, error: formatRatingError(error.message) };
    }
    return { ok: true };
  }

  const { error: upsertError } = await supabase
    .from("profiles")
    .upsert(
      { id: userId, avatar_key: DEFAULT_AVATAR_KEY },
      { onConflict: "id" }
    );

  if (upsertError) {
    noteMissingColumnFromError("profiles", "avatar_key", upsertError.message);
    return { ok: false, error: formatRatingError(upsertError.message) };
  }

  return { ok: true };
}

async function ensureBookRecord(
  supabase: SupabaseClient,
  externalId: string
): Promise<{ bookDbId: string } | { error: string }> {
  const existing = await findBookIdBySlugOrIsbn(supabase, {
    slug: externalId,
  });
  if (existing) {
    return { bookDbId: existing };
  }

  const book = await getBookById(externalId);
  if (!book) {
    return { error: "Book not found." };
  }

  const result = await ensureBookRow(supabase, externalId, book);
  if ("error" in result) {
    return { error: formatRatingError(result.error) };
  }
  return result;
}

export const getCommunityRatings = cache(async function getCommunityRatings(
  bookExternalId: string,
  isbn?: string | null
): Promise<CommunityRatingsSummary> {
  noStore();

  if (!isSupabaseConfigured()) {
    return { averages: null, count: 0 };
  }

  const controller = new AbortController();
  try {
    const { withTimeout } = await import("@/lib/provider-resilience");
    return await withTimeout(
      (async () => {
        const supabase =
          resolveRatingsReadClient() ?? (await getTrustedUserDataClient());
        if (!supabase) {
          return { averages: null, count: 0 };
        }

        const bookId = await findBookIdBySlugOrIsbn(supabase, {
          slug: bookExternalId,
          isbn,
        });

        if (!bookId) {
          return { averages: null, count: 0 };
        }

        // One book page query — columns only, filtered by book_id.
        const result = await fetchAllRatingsForBook(
          supabase,
          bookId,
          controller.signal
        );
        if (result.error) {
          return { averages: null, count: 0 };
        }

        return summarizeCommunityRatings(result.data);
      })(),
      2000,
      `community-ratings:${bookExternalId}`
    );
  } catch (error) {
    controller.abort();
    console.error(
      "[book-detail]",
      bookExternalId,
      error instanceof Error ? error.message : String(error)
    );
    return { averages: null, count: 0 };
  }
});

/**
 * Load the signed-in user's rating for a book (by external/slug id).
 * Prefer service-role read so JWT/RLS gaps cannot blank the form after a
 * successful service-role write. Falls back to the session client.
 *
 * Identity: `userId` must be the verified auth user id (same value written to
 * `rated_by` on save). Book slug must match the route id used on POST.
 */
export async function getUserRatingForBook(
  bookExternalId: string,
  userId: string,
  isbn?: string | null
): Promise<ContentRating | null> {
  noStore();

  if (!isSupabaseConfigured() || !userId || !bookExternalId) {
    return null;
  }

  try {
    const { withTimeout } = await import("@/lib/provider-resilience");
    return await withTimeout(
      (async () => {
        const supabase = await getTrustedUserDataClient();
        if (!supabase) return null;

        const bookId = await findBookIdBySlugOrIsbn(supabase, {
          slug: bookExternalId,
          isbn,
        });

        if (!bookId) {
          return null;
        }

        const result = await fetchUserRatingRow(supabase, bookId, userId);
        return result.data;
      })(),
      2000,
      `user-rating:${bookExternalId}`
    );
  } catch (error) {
    console.error(
      "[book-detail]",
      bookExternalId,
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}

export type UserRatedBook = {
  ratingId: string;
  bookId: string;
  slug: string;
  title: string;
  author: string | null;
  coverImageUrl: string | null;
  publishedYear: number | null;
  genre: string | null;
  ratings: ContentRating;
  createdAt: string;
};

export type UserReadingStats = {
  totalBooksRated: number;
  /** Mean of all content fields across every rating. */
  overallAverage: number | null;
  byCategory: ContentRating | null;
  /** Content category with the highest average mark. */
  topContentCategory: {
    key: keyof ContentRating;
    label: string;
    average: number;
  } | null;
  /** Most common book genre among rated titles, when available. */
  topGenre: string | null;
};

export function computeUserReadingStats(
  ratedBooks: UserRatedBook[]
): UserReadingStats {
  if (ratedBooks.length === 0) {
    return {
      totalBooksRated: 0,
      overallAverage: null,
      byCategory: null,
      topContentCategory: null,
      topGenre: null,
    };
  }

  const contentRatings = ratedBooks.map((book) => book.ratings);
  const byCategory = Object.fromEntries(
    RATING_KEYS.map((key) => [key, averageCategory(contentRatings, key)])
  ) as ContentRating;

  const overallSum = contentRatings.reduce(
    (sum, rating) =>
      sum + RATING_KEYS.reduce((inner, key) => inner + rating[key], 0),
    0
  );
  const overallAverage =
    Math.round((overallSum / (contentRatings.length * RATING_KEYS.length)) * 10) /
    10;

  let topContentCategory: UserReadingStats["topContentCategory"] = null;
  for (const category of RATING_CATEGORIES) {
    const average = byCategory[category.key];
    if (
      !topContentCategory ||
      average > topContentCategory.average
    ) {
      topContentCategory = {
        key: category.key,
        label: category.label,
        average,
      };
    }
  }

  const grouped = groupRatedBooksByWork(ratedBooks);

  const genreCounts = new Map<string, number>();
  for (const { book } of grouped) {
    const genre = book.genre?.trim();
    if (!genre) continue;
    genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
  }

  let topGenre: string | null = null;
  let topGenreCount = 0;
  for (const [genre, count] of Array.from(genreCounts.entries())) {
    if (count > topGenreCount) {
      topGenre = genre;
      topGenreCount = count;
    }
  }

  return {
    totalBooksRated: grouped.length,
    overallAverage,
    byCategory,
    topContentCategory,
    topGenre,
  };
}

export async function getUserRatedBooks(
  userId: string
): Promise<UserRatedBook[]> {
  if (!userId.trim() || !isSupabaseConfigured()) {
    return [];
  }

  try {
    const supabase = await getTrustedUserDataClient();
    if (!supabase) return [];

    type RatedQueryRow = {
      id: string;
      created_at: string;
      sexual_content: number;
      romance?: number | null;
      lgbt: number;
      horror: number;
      ideology: number;
      pacing: number;
      books: unknown;
    };

    // Stats / rated list — one query. Assumes index ratings(rated_by).
    const first = isColumnMarkedMissing("ratings", "romance")
      ? await supabase
          .from("ratings")
          .select(
            `
        id,
        created_at,
        sexual_content,
        lgbt,
        horror,
        ideology,
        pacing,
        books (
          id,
          slug,
          title,
          author,
          cover_image_url,
          published_year,
          genre
        )
      `
          )
          .eq("rated_by", userId)
          .order("created_at", { ascending: false })
      : await supabase
          .from("ratings")
          .select(
            `
        id,
        created_at,
        sexual_content,
        romance,
        lgbt,
        horror,
        ideology,
        pacing,
        books (
          id,
          slug,
          title,
          author,
          cover_image_url,
          published_year,
          genre
        )
      `
          )
          .eq("rated_by", userId)
          .order("created_at", { ascending: false });

    let rows: RatedQueryRow[] | null = null;

    if (first.error) {
      if (isNonRetryableDataApiError(first.error.message, first.error.code)) {
        return [];
      }
      if (
        noteMissingColumnFromError("ratings", "romance", first.error.message)
      ) {
        const legacy = await supabase
          .from("ratings")
          .select(
            `
            id,
            created_at,
            sexual_content,
            lgbt,
            horror,
            ideology,
            pacing,
            books (
              id,
              slug,
              title,
              author,
              cover_image_url,
              published_year,
              genre
            )
          `
          )
          .eq("rated_by", userId)
          .order("created_at", { ascending: false });
        if (legacy.error || !legacy.data) return [];
        rows = legacy.data as unknown as RatedQueryRow[];
      } else {
        return [];
      }
    } else {
      rows = (first.data as unknown as RatedQueryRow[] | null) ?? null;
    }

    if (!rows) {
      return [];
    }

    return rows.flatMap((row) => {
      const rawBook = Array.isArray(row.books) ? row.books[0] : row.books;
      if (!rawBook || typeof rawBook !== "object") return [];
      const book = rawBook as {
        id: string;
        slug: string;
        title: string;
        author: string | null;
        cover_image_url: string | null;
        published_year: string | number | null;
        genre: string | null;
      };
      if (!book.slug || !book.title) return [];

      return [
        {
          ratingId: row.id,
          bookId: book.id,
          slug: book.slug,
          title: book.title,
          author: book.author ?? null,
          coverImageUrl: book.cover_image_url ?? null,
          publishedYear: parsePublishedYear(book.published_year) ?? null,
          genre: book.genre ?? null,
          ratings: {
            sexual_content: row.sexual_content,
            romance: row.romance ?? DEFAULT_RATINGS.romance,
            lgbt: row.lgbt,
            horror: row.horror,
            ideology: row.ideology,
            pacing: row.pacing,
          },
          createdAt: row.created_at,
        },
      ];
    });
  } catch {
    return [];
  }
}

/**
 * Lightweight slug list of works the current user has rated.
 * Used for browse/search "Inscribed" badges — one query, then Set.has.
 * Prefers service-role read (same pattern as getUserRatingForBook) so
 * JWT/RLS gaps cannot hide badges; always filters by the verified userId.
 */
export async function getUserRatedSlugs(userId: string): Promise<string[]> {
  const identities = await getUserRatedIdentities(userId);
  return identities.map((row) => row.slug);
}

export type { UserRatedIdentity } from "@/lib/user-rated-identity";

/**
 * Rated works for Inscribed badges: slug (rating identity) + title/author
 * so browse cards can match when search returns a different provider id.
 */
export async function getUserRatedIdentities(
  userId: string
): Promise<import("@/lib/user-rated-identity").UserRatedIdentity[]> {
  noStore();

  if (!userId.trim() || !isSupabaseConfigured()) {
    return [];
  }

  const controller = new AbortController();
  try {
    const { PAGE_FETCH_TIMEOUT_MS, withTimeout } = await import(
      "@/lib/provider-resilience"
    );
    return await withTimeout(
      (async () => {
        const supabase = await getTrustedUserDataClient();
        if (!supabase) return [];

        // Browse Inscribed badges — one query by rated_by, not per card.
        // Assumes index ratings(rated_by).
        const { data, error } = await supabase
          .from("ratings")
          .select(
            `
        books!inner (
          slug,
          title,
          author
        )
      `
          )
          .eq("rated_by", userId)
          .abortSignal(controller.signal);

        if (error || !data || data.length === 0) {
          return [];
        }

        const bySlug = new Map<
          string,
          import("@/lib/user-rated-identity").UserRatedIdentity
        >();
        for (const row of data) {
          const book = Array.isArray(row.books) ? row.books[0] : row.books;
          if (!book) continue;
          const slug = typeof book.slug === "string" ? book.slug.trim() : "";
          const title = typeof book.title === "string" ? book.title.trim() : "";
          if (!slug || !title || bySlug.has(slug)) continue;
          const author =
            typeof book.author === "string" ? book.author.trim() || null : null;
          bySlug.set(slug, { slug, title, author });
        }
        return Array.from(bySlug.values());
      })(),
      PAGE_FETCH_TIMEOUT_MS,
      `rated-identities:${userId}`
    );
  } catch {
    controller.abort();
    return [];
  }
}

export async function getUserReadingStats(
  userId: string
): Promise<UserReadingStats> {
  const ratedBooks = await getUserRatedBooks(userId);
  return computeUserReadingStats(ratedBooks);
}

/** Head-only count of a user's ratings — for onboarding / save routing. */
export async function getUserRatingCount(userId: string): Promise<number> {
  noStore();

  if (!userId.trim() || !isSupabaseConfigured()) {
    return 0;
  }

  try {
    const supabase = await getTrustedUserDataClient();
    if (!supabase) return 0;

    // Assumes index ratings(rated_by). Head-only — no row payload.
    const { count, error } = await supabase
      .from("ratings")
      .select("id", { count: "exact", head: true })
      .eq("rated_by", userId);

    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

function sourceFromSlug(slug: string): BookSource {
  return sourceFromBookSlug(slug);
}

type RatedDbBookRow = {
  slug: string;
  title: string;
  author: string | null;
  isbn: string | null;
  cover_image_url: string | null;
  description: string | null;
  published_year: number | null;
  genre: string | null;
  page_count: number | null;
};

function dbBookToSummary(row: RatedDbBookRow): BookSummary {
  return {
    id: row.slug,
    title: row.title,
    authors: row.author?.trim() ? [row.author.trim()] : ["Unknown author"],
    coverUrl: row.cover_image_url,
    description: row.description,
    genres: row.genre?.trim() ? [row.genre.trim()] : [],
    publishedYear: parsePublishedYear(row.published_year),
    source: sourceFromSlug(row.slug),
    isbn: row.isbn,
    pageCount: row.page_count,
  };
}

/** True when a stored book reasonably matches the browse search query. */
export function ratedBookMatchesQuery(
  title: string,
  author: string | null,
  query: string,
  options?: { mode?: "text" | "genre"; genre?: string | null }
): boolean {
  const raw = query.trim();
  if (!raw) return false;

  if (options?.mode === "genre") {
    const genreHaystack = (options.genre ?? "").toLowerCase();
    const genreQuery = raw.toLowerCase();
    if (genreHaystack && genreHaystack.includes(genreQuery)) return true;
  }

  const normalizedQuery = normalizeTitleForDedupe(raw);
  const normalizedTitle = normalizeTitleForDedupe(title);
  const normalizedAuthor = normalizeAuthorForDedupe(author ?? "");

  if (!normalizedQuery) return false;
  if (
    normalizedTitle.includes(normalizedQuery) ||
    normalizedAuthor.includes(normalizedQuery)
  ) {
    return true;
  }

  const tokens = normalizedQuery.split(" ").filter((token) => token.length > 1);
  if (tokens.length === 0) return false;
  const haystack = `${normalizedTitle} ${normalizedAuthor}`.trim();
  return tokens.every((token) => haystack.includes(token));
}

export type RatedBooksForSearch = {
  /** DB versions of rated books that match the query (use these identities). */
  books: BookSummary[];
  /** Slugs that have at least one rating — win dedupe identity. */
  ratedSlugs: string[];
};

/**
 * Find this user's already-rated books that match the browse query.
 * One query filtered by rated_by — never a community-wide ratings scan
 * and never a per-card loop. Anonymous search must not call this.
 */
export async function findRatedBooksMatchingQuery(
  query: string,
  options?: { mode?: "text" | "genre"; userId?: string | null }
): Promise<RatedBooksForSearch> {
  noStore();

  const empty: RatedBooksForSearch = { books: [], ratedSlugs: [] };
  const userId = options?.userId?.trim() ?? "";
  if (!isSupabaseConfigured() || !query.trim() || !userId) {
    return empty;
  }

  try {
    const supabase = await getTrustedUserDataClient();
    if (!supabase) return empty;

    // Assumes index ratings(rated_by). Do not join ratings!inner on books.
    const userRated = await supabase
      .from("ratings")
      .select(
        `
          books!inner (
            slug,
            title,
            author,
            isbn,
            cover_image_url,
            description,
            published_year,
            genre,
            page_count
          )
        `
      )
      .eq("rated_by", userId)
      .limit(200);

    if (userRated.error) {
      return empty;
    }

    const rows: RatedDbBookRow[] = (userRated.data ?? []).flatMap((row) => {
      const book = Array.isArray(row.books) ? row.books[0] : row.books;
      return book ? [book as RatedDbBookRow] : [];
    });

    const bySlug = new Map<string, RatedDbBookRow>();
    for (const row of rows) {
      if (!row?.slug || !row?.title) continue;
      if (!bySlug.has(row.slug)) bySlug.set(row.slug, row);
    }

    const matched = Array.from(bySlug.values()).filter((row) =>
      ratedBookMatchesQuery(row.title, row.author, query, {
        mode: options?.mode,
        genre: row.genre,
      })
    );

    const books = matched.map(dbBookToSummary);
    return {
      books,
      ratedSlugs: books.map((book) => book.id),
    };
  } catch {
    return empty;
  }
}

type SubmitRatingOptions = {
  /** Optional sanity check; the write always uses verified auth user.id for rated_by. */
  expectedUserId?: string;
  /** Browser-supplied access token (Authorization Bearer) or cookie session JWT. */
  accessToken?: string | null;
  /** When the route already verified getUser(), skip a second Auth round-trip. */
  verifiedUserId?: string;
};

const SIGN_IN_TO_INSCRIBE = "Sign in to inscribe";

/**
 * Persist a per-user rating. Column is `rated_by` (not `user_id`).
 * Never inserts when the session user is null. rated_by is always the
 * verified auth user id (auth.uid()), never a client-supplied id.
 */
export async function submitUserRating(
  bookExternalId: string,
  ratings: ContentRating,
  options?: SubmitRatingOptions
): Promise<
  | {
      success: true;
      userRating: ContentRating;
      communityRatings: CommunityRatingsSummary;
    }
  | { success: false; error: string }
> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: "Supabase is not configured." };
  }

  // 1) Session user from the route (getUser) or a JWT/cookie verify.
  //    Never start the insert if this is null.
  let sessionUserId: string | null = options?.verifiedUserId?.trim() || null;
  let accessToken = options?.accessToken?.trim() || "";
  if (!sessionUserId) {
    const auth = await getVerifiedUser({
      accessToken: options?.accessToken,
    });
    if ("error" in auth) {
      return { success: false, error: SIGN_IN_TO_INSCRIBE };
    }
    sessionUserId = auth.user.id;
    accessToken = auth.accessToken;
  }

  if (!sessionUserId) {
    return { success: false, error: SIGN_IN_TO_INSCRIBE };
  }

  if (options?.expectedUserId && options.expectedUserId !== sessionUserId) {
    return {
      success: false,
      error: "Signed-in user does not match the rating being saved.",
    };
  }

  if (isColumnMarkedMissing("ratings", "romance")) {
    return { success: false, error: ROMANCE_HINT };
  }

  // 2) Write client: service role after getUser() (server-only), else the
  //    user JWT so PostgREST auth.uid() matches rated_by. Never anon-only.
  const admin = createServiceRoleClient();
  let supabase: SupabaseClient | null =
    !("error" in admin) ? admin.supabase : null;
  if (!supabase && accessToken) {
    const jwtClient = createJwtPostgrestClient(accessToken);
    if (!("error" in jwtClient)) {
      supabase = jwtClient.supabase;
    }
  }
  if (!supabase) {
    return { success: false, error: SIGN_IN_TO_INSCRIBE };
  }

  const profileResult = await ensureProfileExists(supabase, sessionUserId);
  if (!profileResult.ok) {
    return { success: false, error: profileResult.error };
  }

  const bookResult = await ensureBookRecord(supabase, bookExternalId);
  if ("error" in bookResult) {
    return { success: false, error: bookResult.error };
  }

  // Always include romance — do not strip it on schema errors (that made saves
  // appear to succeed while Romance never persisted).
  const row = {
    book_id: bookResult.bookDbId,
    rated_by: sessionUserId,
    sexual_content: ratings.sexual_content,
    romance: ratings.romance,
    lgbt: ratings.lgbt,
    horror: ratings.horror,
    ideology: ratings.ideology,
    pacing: ratings.pacing,
  };

  // Unique (book_id, rated_by). rated_by is always the verified auth user id
  // (the same id as auth.uid() from getUser()). Never insert without that id.
  const { error } = await supabase
    .from("ratings")
    .upsert(row, { onConflict: "book_id,rated_by" });

  if (error) {
    noteMissingColumnFromError("ratings", "romance", error.message);
    noteMissingColumnFromError("ratings", "spice_level", error.message);
    return { success: false, error: formatRatingError(error.message) };
  }

  // Confirm the row, then re-fetch community averages on the same write client.
  const readBack = await fetchUserRatingRow(
    supabase,
    bookResult.bookDbId,
    sessionUserId
  );

  if (!readBack.data) {
    return {
      success: false,
      error:
        "Rating write did not persist (row missing on read-back). Sign out and back in, then try again.",
    };
  }

  const expected = normalizeUserRating(ratings);
  const userRating = readBack.data;

  // If the romance column is missing, read-back defaults Romance to 0 and looks
  // "saved." Fail loudly instead of silently dropping the user's mark.
  if (userRating.romance !== expected.romance) {
    markColumnMissing("ratings", "romance");
    return { success: false, error: ROMANCE_HINT };
  }

  const allRatings = await fetchAllRatingsForBook(
    supabase,
    bookResult.bookDbId
  );
  const communityRatings = summarizeCommunityRatings(
    allRatings.error ? [userRating] : allRatings.data
  );

  revalidatePath(`/books/${bookExternalId}`, "page");
  revalidatePath("/rated");
  revalidatePath("/stats");

  return { success: true, userRating, communityRatings };
}
