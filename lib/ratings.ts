import { DEFAULT_AVATAR_KEY } from "@/lib/avatars";
import { getBookById } from "@/lib/books";
import {
  DEFAULT_RATINGS,
  RATING_CATEGORIES,
} from "@/lib/rating-categories";
import { getSupabaseEnv, isSupabaseConfigured } from "@/lib/supabase/config";
import {
  createAuthenticatedClient,
  createClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import type { ContentRating } from "@/types";
import type { BookDetail } from "@/types/book";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { revalidatePath, unstable_noStore as noStore } from "next/cache";

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

function bookToDbRow(externalId: string, book: BookDetail) {
  return {
    slug: externalId,
    title: book.title,
    author: book.authors[0] ?? null,
    isbn: book.isbn,
    cover_image_url: book.coverUrl,
    description: book.description,
    published_year: book.publishedYear,
    genre: book.genres[0] ?? null,
    page_count: book.pageCount,
  };
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

  const { data: created, error: verifyError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (verifyError) {
    return { ok: false, error: formatRatingError(verifyError.message) };
  }

  if (!created) {
    return {
      ok: false,
      error:
        "No profile was found for your account and creating one failed. Confirm SUPABASE_SERVICE_ROLE_KEY is set, then try again.",
    };
  }

  return { ok: true };
}

async function ensureBookRecord(
  supabase: SupabaseClient,
  externalId: string
): Promise<{ bookDbId: string } | { error: string }> {
  const book = await getBookById(externalId);
  if (!book) {
    return { error: "Book not found." };
  }

  // Prefer: write without RETURNING so missing SELECT grants don't mask a good insert.
  const { error: upsertError } = await supabase
    .from("books")
    .upsert(bookToDbRow(externalId, book), { onConflict: "slug" });

  if (upsertError) {
    return { error: formatRatingError(upsertError.message) };
  }

  const { data, error } = await supabase
    .from("books")
    .select("id")
    .eq("slug", externalId)
    .maybeSingle();

  if (error) {
    return { error: formatRatingError(error.message) };
  }

  if (!data?.id) {
    return {
      error:
        "Book row could not be saved or read back. Confirm SUPABASE_SERVICE_ROLE_KEY is set, then try again.",
    };
  }

  return { bookDbId: data.id };
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

export async function getCommunityRatings(
  bookExternalId: string
): Promise<CommunityRatingsSummary> {
  noStore();

  if (!isSupabaseConfigured()) {
    return { averages: null, count: 0 };
  }

  try {
    const supabase = resolveRatingsReadClient();
    if (!supabase) {
      return { averages: null, count: 0 };
    }

    const { data: book, error: bookError } = await supabase
      .from("books")
      .select("id")
      .eq("slug", bookExternalId)
      .maybeSingle();

    if (bookError || !book?.id) {
      return { averages: null, count: 0 };
    }

    const result = await fetchAllRatingsForBook(supabase, book.id);
    if (result.error) {
      return { averages: null, count: 0 };
    }

    return summarizeCommunityRatings(result.data);
  } catch {
    return { averages: null, count: 0 };
  }
}

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
  userId: string
): Promise<ContentRating | null> {
  noStore();

  if (!isSupabaseConfigured() || !userId || !bookExternalId) {
    return null;
  }

  try {
    const admin = createServiceRoleClient();
    const auth = await createAuthenticatedClient();
    const supabase =
      "error" in admin
        ? "error" in auth
          ? await createClient()
          : auth.supabase
        : admin.supabase;

    const { data: book, error: bookError } = await supabase
      .from("books")
      .select("id")
      .eq("slug", bookExternalId)
      .maybeSingle();

    if (bookError || !book?.id) {
      return null;
    }

    const result = await fetchUserRatingRow(supabase, book.id, userId);
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
    const supabase = await createClient();
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

export async function getUserReadingStats(
  userId: string
): Promise<UserReadingStats> {
  const ratedBooks = await getUserRatedBooks(userId);
  return computeUserReadingStats(ratedBooks);
}

type SubmitRatingOptions = {
  /** Optional sanity check; the write always uses verified JWT user.id for rated_by. */
  expectedUserId?: string;
  /** Browser-supplied access token (Authorization Bearer) — preferred on Netlify. */
  accessToken?: string | null;
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

  // 1) Verify the user via access token / cookie session.
  const auth = await createAuthenticatedClient({
    accessToken: options?.accessToken,
  });
  if ("error" in auth) {
    return {
      success: false,
      error: "You are not signed in. Please sign in and try again.",
    };
  }

  const sessionUserId = auth.user.id;

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
  revalidatePath("/browse");
  revalidatePath("/rated");
  revalidatePath("/stats");

  return { success: true, userRating, communityRatings };
}
