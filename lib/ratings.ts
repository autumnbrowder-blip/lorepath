import { DEFAULT_AVATAR_KEY } from "@/lib/avatars";
import { ensureBookRow, findBookIdBySlugOrIsbn, sourceFromBookSlug } from "@/lib/book-cache";
import { getBookById } from "@/lib/books";
import {
  normalizeAuthorForDedupe,
  normalizeTitleForDedupe,
  parsePublishedYear,
} from "@/lib/book-utils";
import {
  DEFAULT_RATINGS,
  RATING_CATEGORIES,
} from "@/lib/rating-categories";
import { getSupabaseEnv, isSupabaseConfigured } from "@/lib/supabase/config";
import {
  createServiceRoleClient,
  getServiceRoleOrCookieClient,
  getVerifiedUser,
} from "@/lib/supabase/server";
import type { ContentRating } from "@/types";
import type { BookDetail, BookSource, BookSummary } from "@/types/book";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
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
  `Could not save rating (unexpected RLS block on server write). Confirm SUPABASE_SERVICE_ROLE_KEY is set in Netlify and .env.local, then redeploy. ${RATINGS_SQL_HINT}`;

const GRANT_HINT =
  `Could not save rating (permission denied on ratings/books). Confirm SUPABASE_SERVICE_ROLE_KEY is set. ${RATINGS_SQL_HINT}`;

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
  const full = await supabase
    .from("ratings")
    .select(RATING_SELECT)
    .eq("book_id", bookDbId)
    .eq("rated_by", userId)
    .maybeSingle();

  if (full.error && isMissingRomanceColumn(full.error.message)) {
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

  if (full.error) {
    return { data: null, error: full.error.message };
  }
  if (!full.data) {
    return { data: null, error: null };
  }
  return { data: normalizeUserRating(full.data), error: null };
}

async function fetchAllRatingsForBook(
  supabase: SupabaseClient,
  bookDbId: string
): Promise<{ data: ContentRating[]; error: string | null }> {
  const full = await supabase
    .from("ratings")
    .select(RATING_SELECT)
    .eq("book_id", bookDbId);

  if (full.error && isMissingRomanceColumn(full.error.message)) {
    const legacy = await supabase
      .from("ratings")
      .select(LEGACY_RATING_SELECT)
      .eq("book_id", bookDbId);

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

  if (full.error) {
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

/** Prefer service role for reads so post-write refresh matches the write path. */
function resolveRatingsReadClient(): SupabaseClient | null {
  const admin = createServiceRoleClient();
  if (!("error" in admin)) {
    return admin.supabase;
  }
  return createUncachedPublicClient();
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

  const { error: upsertError } = await supabase.from("profiles").upsert(
    { id: userId, avatar_key: DEFAULT_AVATAR_KEY },
    { onConflict: "id" }
  );

  if (upsertError) {
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

/** Public ratings reads — never serve from the default fetch/data cache. */
function createUncachedPublicClient() {
  const env = getSupabaseEnv();
  if (!env) return null;

  return createSupabaseClient(env.url, env.anonKey, {
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          cache: "no-store",
        }),
    },
  });
}

export const getCommunityRatings = cache(async function getCommunityRatings(
  bookExternalId: string,
  isbn?: string | null
): Promise<CommunityRatingsSummary> {
  noStore();

  if (!isSupabaseConfigured()) {
    return { averages: null, count: 0 };
  }

  try {
    const { withTimeout } = await import("@/lib/provider-resilience");
    return await withTimeout(
      (async () => {
        const supabase = resolveRatingsReadClient();
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

        const result = await fetchAllRatingsForBook(supabase, bookId);
        if (result.error) {
          return { averages: null, count: 0 };
        }

        return summarizeCommunityRatings(result.data);
      })(),
      2000,
      `community-ratings:${bookExternalId}`
    );
  } catch {
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
    const supabase = await getServiceRoleOrCookieClient();
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
  } catch {
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

  const genreCounts = new Map<string, number>();
  for (const book of ratedBooks) {
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
    totalBooksRated: ratedBooks.length,
    overallAverage,
    byCategory,
    topContentCategory,
    topGenre,
  };
}

export async function getUserRatedBooks(
  userId: string
): Promise<UserRatedBook[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  try {
    const supabase = await getServiceRoleOrCookieClient();
    if (!supabase) return [];

    const { data, error } = await supabase
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
          genre
        )
      `
      )
      .eq("rated_by", userId)
      .order("created_at", { ascending: false });

    if (error || !data) {
      return [];
    }

    return data.flatMap((row) => {
      const book = Array.isArray(row.books) ? row.books[0] : row.books;
      if (!book) return [];

      return [
        {
          ratingId: row.id as string,
          bookId: book.id as string,
          slug: book.slug as string,
          title: book.title as string,
          author: (book.author as string | null) ?? null,
          coverImageUrl: (book.cover_image_url as string | null) ?? null,
          genre: (book.genre as string | null) ?? null,
          ratings: {
            sexual_content: row.sexual_content as number,
            romance: row.romance as number,
            lgbt: row.lgbt as number,
            horror: row.horror as number,
            ideology: row.ideology as number,
            pacing: row.pacing as number,
          },
          createdAt: row.created_at as string,
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

  try {
    const supabase = await getServiceRoleOrCookieClient();
    if (!supabase) return [];

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
      .eq("rated_by", userId);

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
  } catch {
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
    const supabase = await getServiceRoleOrCookieClient();
    if (!supabase) return 0;

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

function sanitizeIlikeToken(token: string): string {
  return token.replace(/[%_,.()"'\\]/g, " ").replace(/\s+/g, " ").trim();
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
 * Find books in our database that already have ratings (user or community)
 * and match the search query. Used to keep rated books visible in browse
 * search and to prefer their stored slug/identity during dedupe.
 */
export async function findRatedBooksMatchingQuery(
  query: string,
  options?: { mode?: "text" | "genre"; userId?: string | null }
): Promise<RatedBooksForSearch> {
  noStore();

  const empty: RatedBooksForSearch = { books: [], ratedSlugs: [] };
  if (!isSupabaseConfigured() || !query.trim()) {
    return empty;
  }

  try {
    const supabase = resolveRatingsReadClient();
    if (!supabase) return empty;

    const tokens = query
      .trim()
      .split(/\s+/)
      .map(sanitizeIlikeToken)
      .filter((token) => token.length >= 2);
    const primary =
      tokens.find((token) => token.length >= 3) ?? tokens[0] ?? null;

    // Prefer books the signed-in user has rated; also include any community-
    // rated titles so ratings stay discoverable for everyone.
    let rows: RatedDbBookRow[] = [];

    if (options?.userId) {
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
        .eq("rated_by", options.userId)
        .limit(200);

      if (!userRated.error && userRated.data) {
        rows = userRated.data.flatMap((row) => {
          const book = Array.isArray(row.books) ? row.books[0] : row.books;
          return book ? [book as RatedDbBookRow] : [];
        });
      }
    }

    // Community-rated books filtered by a cheap ilike token when possible.
    let communityQuery = supabase
      .from("books")
      .select(
        `
        slug,
        title,
        author,
        isbn,
        cover_image_url,
        description,
        published_year,
        genre,
        page_count,
        ratings!inner ( id )
      `
      )
      .limit(80);

    if (primary && options?.mode !== "genre") {
      communityQuery = communityQuery.or(
        `title.ilike.%${primary}%,author.ilike.%${primary}%`
      );
    } else if (primary && options?.mode === "genre") {
      communityQuery = communityQuery.or(
        `genre.ilike.%${primary}%,title.ilike.%${primary}%`
      );
    }

    const community = await communityQuery;
    if (!community.error && community.data) {
      const communityRows = community.data.map((row) => ({
        slug: row.slug as string,
        title: row.title as string,
        author: (row.author as string | null) ?? null,
        isbn: (row.isbn as string | null) ?? null,
        cover_image_url: (row.cover_image_url as string | null) ?? null,
        description: (row.description as string | null) ?? null,
        published_year: (row.published_year as number | null) ?? null,
        genre: (row.genre as string | null) ?? null,
        page_count: (row.page_count as number | null) ?? null,
      }));
      rows = [...rows, ...communityRows];
    }

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
  /** Optional sanity check; the write always uses verified JWT user.id for rated_by. */
  expectedUserId?: string;
  /** Browser-supplied access token (Authorization Bearer) — preferred on Netlify. */
  accessToken?: string | null;
  /** When the route already verified the JWT, skip a second Auth round-trip. */
  verifiedUserId?: string;
};

/**
 * Persist a per-user rating. Column is `rated_by` (not `user_id`).
 * Verifies the JWT, then upserts with the service role client (bypasses RLS).
 * Identity comes from the verified JWT user, never from the request body.
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

  // 1) Verify the user via access token / cookie session (skip if the route
  //    already verified the same JWT).
  let sessionUserId: string;
  if (options?.verifiedUserId && options.accessToken) {
    sessionUserId = options.verifiedUserId;
  } else {
    const auth = await getVerifiedUser({
      accessToken: options?.accessToken,
    });
    if ("error" in auth) {
      return {
        success: false,
        error: "You are not signed in. Please sign in and try again.",
      };
    }
    sessionUserId = auth.user.id;
  }

  if (options?.expectedUserId && options.expectedUserId !== sessionUserId) {
    return {
      success: false,
      error: "Signed-in user does not match the rating being saved.",
    };
  }

  // 2) Trusted server write with service role (bypasses RLS).
  const admin = createServiceRoleClient();
  if ("error" in admin) {
    return { success: false, error: admin.error };
  }
  const supabase = admin.supabase;

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

  // Write without .select() so INSERT/UPDATE failures are unambiguous.
  const { error } = await supabase
    .from("ratings")
    .upsert(row, { onConflict: "book_id,rated_by" });

  if (error) {
    return { success: false, error: formatRatingError(error.message) };
  }

  // Confirm via the same service-role client used for the write.
  const readBack = await fetchUserRatingRow(
    supabase,
    bookResult.bookDbId,
    sessionUserId
  );

  if (!readBack.data) {
    return {
      success: false,
      error:
        "Rating write did not persist (row missing on read-back). Confirm SUPABASE_SERVICE_ROLE_KEY and ratings schema, then try again.",
    };
  }

  const expected = normalizeUserRating(ratings);
  const userRating = readBack.data;

  // If the romance column is missing, read-back defaults Romance to 0 and looks
  // "saved." Fail loudly instead of silently dropping the user's mark.
  if (userRating.romance !== expected.romance) {
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
