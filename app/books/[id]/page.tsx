import { BookInformation } from "@/components/books/BookInformation";
import { BookRatingsProvider } from "@/components/books/BookRatingsContext";
import { LiveCommunityRatings } from "@/components/books/LiveCommunityRatings";
import { LiveMatchScore } from "@/components/books/LiveMatchScore";
import { RatingForm } from "@/components/books/RatingForm";
import { CornerFlourish } from "@/components/theme/FantasyDecor";
import { FantasyPageShell } from "@/components/theme/FantasyPageShell";
import { getBookById } from "@/lib/books";
import { getCommunityRatings, getUserRatingForBook } from "@/lib/ratings";
import { getUserPreferences } from "@/lib/preferences";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import type { ContentRating } from "@/types";

type BookDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
};

export async function generateMetadata({
  params,
}: BookDetailPageProps): Promise<Metadata> {
  const { id } = await params;

  try {
    const book = await getBookById(id);
    if (!book) {
      return { title: "Book Not Found | LorePath" };
    }
    return {
      title: `${book.title} | LorePath`,
      description:
        book.description?.slice(0, 160) ??
        `Ratings and details for ${book.title}`,
    };
  } catch {
    return { title: "Book | LorePath" };
  }
}

async function loadViewerState(bookExternalId: string): Promise<{
  user: User | null;
  userPreferences: ContentRating | null;
  userRating: ContentRating | null;
}> {
  if (!isSupabaseConfigured()) {
    return { user: null, userPreferences: null, userRating: null };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, userPreferences: null, userRating: null };
  }

  // During Beta, every signed-in reader gets Match Score + preferences.
  const [userPreferences, userRating] = await Promise.all([
    getUserPreferences(user.id),
    getUserRatingForBook(bookExternalId, user.id),
  ]);

  return { user, userPreferences, userRating };
}

export default async function BookDetailPage({
  params,
  searchParams,
}: BookDetailPageProps) {
  const { id } = await params;
  const { q } = await searchParams;
  const searchQuery = q?.trim() ?? "";

  let book;
  try {
    book = await getBookById(id);
  } catch {
    throw new Error("Failed to load book details.");
  }

  if (!book) {
    notFound();
  }

  const [communityRatings, viewer] = await Promise.all([
    getCommunityRatings(id),
    loadViewerState(id),
  ]);

  const { user, userPreferences, userRating } = viewer;

  const backHref = searchQuery
    ? `/browse?q=${encodeURIComponent(searchQuery)}`
    : "/browse";

  return (
    <FantasyPageShell>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:py-10">
        <Link href={backHref} className="preference-codex-box--nav relative mb-5">
          <ArrowLeft className="h-4 w-4" />
          <span className="relative z-[1] nav-dragon-gold">Back to Results</span>
        </Link>

        <div className="book-detail-tome relative">
          <div className="book-detail-tome-parchment" aria-hidden="true" />
          <CornerFlourish className="pointer-events-none absolute left-1 top-1 z-20 h-12 w-12 text-[#a67c2d]/70 sm:left-2 sm:top-2 sm:h-14 sm:w-14" />
          <CornerFlourish className="pointer-events-none absolute right-1 top-1 z-20 h-12 w-12 rotate-90 text-[#a67c2d]/70 sm:right-2 sm:top-2 sm:h-14 sm:w-14" />
          <CornerFlourish className="pointer-events-none absolute bottom-1 left-1 z-20 h-12 w-12 -rotate-90 text-[#a67c2d]/70 sm:bottom-2 sm:left-2 sm:h-14 sm:w-14" />
          <CornerFlourish className="pointer-events-none absolute bottom-1 right-1 z-20 h-12 w-12 rotate-180 text-[#a67c2d]/70 sm:bottom-2 sm:right-2 sm:h-14 sm:w-14" />

          <div className="book-detail-tome-content relative z-[2]">
            <BookRatingsProvider
              bookId={book.id}
              initialCommunityRatings={communityRatings}
            >
              <BookInformation
                book={book}
                communityRatings={<LiveCommunityRatings />}
                matchScore={
                  <LiveMatchScore
                    isLoggedIn={!!user}
                    userPreferences={userPreferences}
                  />
                }
                ratingForm={
                  <RatingForm
                    key={book.id}
                    bookId={book.id}
                    isLoggedIn={!!user}
                    initialRatings={userRating}
                  />
                }
              />
            </BookRatingsProvider>
          </div>
        </div>
      </div>
    </FantasyPageShell>
  );
}
