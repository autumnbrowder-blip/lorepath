import { getBookById } from "@/lib/books";
import { getSupabaseEnv, isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { ContentRating } from "@/types";
import type { BookDetail } from "@/types/book";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { revalidatePath, unstable_noStore as noStore } from "next/cache";

const RATING_KEYS: (keyof ContentRating)[] = [
  "sexual_content",
  "lgbt",
  "horror",
  "ideology",
  "pacing",
];

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

async function ensureBookRecord(
  externalId: string
): Promise<{ bookDbId: string } | { error: string }> {
  const book = await getBookById(externalId);
  if (!book) {
    return { error: "Book not found." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("books")
    .upsert(bookToDbRow(externalId, book), { onConflict: "slug" })
    .select("id")
    .single();

  if (error || !data) {
    return { error: "Failed to save book record." };
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
      .select("sexual_content, lgbt, horror, ideology, pacing")
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
  ratings: ContentRating;
  createdAt: string;
};

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
        lgbt,
        horror,
        ideology,
        pacing,
        books (
          id,
          slug,
          title,
          author,
          cover_image_url
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
          ratings: {
            sexual_content: row.sexual_content as number,
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

export async function submitUserRating(
  bookExternalId: string,
  userId: string,
  ratings: ContentRating
): Promise<{ success: true } | { success: false; error: string }> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: "Supabase is not configured." };
  }

  const bookResult = await ensureBookRecord(bookExternalId);
  if ("error" in bookResult) {
    return { success: false, error: bookResult.error };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("ratings").upsert(
    {
      book_id: bookResult.bookDbId,
      rated_by: userId,
      sexual_content: ratings.sexual_content,
      lgbt: ratings.lgbt,
      horror: ratings.horror,
      ideology: ratings.ideology,
      pacing: ratings.pacing,
    },
    { onConflict: "book_id,rated_by" }
  );

  if (error) {
    return { success: false, error: "Failed to save rating. Please try again." };
  }

  revalidatePath(`/books/${bookExternalId}`, "page");
  revalidatePath("/browse");

  return { success: true };
}
