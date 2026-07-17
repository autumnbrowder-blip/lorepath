import { DEFAULT_AVATAR_KEY } from "@/lib/avatars";
import { getBookById } from "@/lib/books";
import { RATING_CATEGORIES } from "@/lib/rating-categories";
import { getSupabaseEnv, isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
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

const RATINGS_SQL_HINT =
  "Run supabase/migrations/20260716_fix_ratings_production.sql in the Supabase SQL Editor, then try again.";

const RLS_HINT =
  `Could not save rating (blocked by row-level security). Confirm you are signed in and that ratings policies allow insert/update where rated_by = auth.uid(). ${RATINGS_SQL_HINT}`;

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
        "No profile was found for your account and creating one was blocked. Confirm profiles RLS allows insert/select for your own id, then try again.",
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
        "Book row could not be saved or read back. Confirm books insert/select policies and grants for authenticated users.",
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
    const supabase = createUncachedPublicClient();
    if (!supabase) {
      return { averages: null, count: 0 };
    }

    const { data: book, error: bookError } = await supabase
      .from("books")
      .select("id")
      .eq("slug", bookExternalId)
      .maybeSingle();

    if (bookError || !book) {
      return { averages: null, count: 0 };
    }

    const { data: ratings, error: ratingsError } = await supabase
      .from("ratings")
      .select("sexual_content, romance, lgbt, horror, ideology, pacing")
      .eq("book_id", book.id);

    if (ratingsError || !ratings?.length) {
      return { averages: null, count: 0 };
    }

    const typedRatings = ratings as ContentRating[];
    const averages = Object.fromEntries(
      RATING_KEYS.map((key) => [key, averageCategory(typedRatings, key)])
    ) as ContentRating;

    return { averages, count: ratings.length };
  } catch {
    return { averages: null, count: 0 };
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
  /** Reuse the API route's cookie-bound client so auth.uid() matches the JWT. */
  supabase?: SupabaseClient;
  /**
   * Optional sanity check only. `rated_by` is ALWAYS taken from
   * `auth.getUser()` on the write client — never from the request body.
   */
  expectedUserId?: string;
};

/**
 * Persist a per-user rating. Column is `rated_by` (not `user_id`).
 * Identity always comes from the cookie session on the write client.
 */
export async function submitUserRating(
  bookExternalId: string,
  ratings: ContentRating,
  options?: SubmitRatingOptions
): Promise<{ success: true } | { success: false; error: string }> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: "Supabase is not configured." };
  }

  const supabase = options?.supabase ?? (await createClient());

  // Load JWT onto this client before any PostgREST write.
  // Without this, auth.uid() is null and INSERT WITH CHECK fails RLS.
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      success: false,
      error: "You are not signed in. Please sign in and try again.",
    };
  }

  if (options?.expectedUserId && options.expectedUserId !== user.id) {
    return {
      success: false,
      error: "Signed-in user does not match the rating being saved.",
    };
  }

  const sessionUserId = user.id;

  const profileResult = await ensureProfileExists(supabase, sessionUserId);
  if (!profileResult.ok) {
    return { success: false, error: profileResult.error };
  }

  const bookResult = await ensureBookRecord(supabase, bookExternalId);
  if ("error" in bookResult) {
    return { success: false, error: bookResult.error };
  }

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

  // Write without .select() so INSERT/UPDATE RLS is not confused with
  // RETURNING/SELECT policy failures.
  let { error } = await supabase
    .from("ratings")
    .upsert(row, { onConflict: "book_id,rated_by" });

  if (error && isMissingRomanceColumn(error.message)) {
    const { romance: _romance, ...legacyRow } = row;
    const legacy = await supabase
      .from("ratings")
      .upsert(legacyRow, { onConflict: "book_id,rated_by" });
    error = legacy.error;
  }

  if (error) {
    return { success: false, error: formatRatingError(error.message) };
  }

  revalidatePath(`/books/${bookExternalId}`, "page");
  revalidatePath("/browse");
  revalidatePath("/rated");
  revalidatePath("/stats");

  return { success: true };
}
