import { FirstRatingScreen } from "@/components/onboarding/FirstRatingScreen";
import { getBookById } from "@/lib/books";
import { calculateMatchScore } from "@/lib/match-score";
import {
  getOnboardingMatchScoreSeen,
  getOnboardingProgress,
  isOnboardingComplete,
  markOnboardingMatchScoreSeen,
} from "@/lib/onboarding";
import { getFirstRatingSuggestions } from "@/lib/onboarding-suggestions";
import { getUserPreferences } from "@/lib/preferences";
import { getCommunityRatings, getUserRatedBooks } from "@/lib/ratings";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your First Mark | LorePath",
  description:
    "Rate a book you've read. Match Scores appear once a book has community marks and you've set your preferences.",
};

type FirstRatingPageProps = {
  searchParams: Promise<{ rated?: string; bookId?: string }>;
};

export default async function FirstRatingPage({
  searchParams,
}: FirstRatingPageProps) {
  if (!isSupabaseConfigured()) {
    redirect("/login?redirect=/onboarding/first-rating");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/onboarding/first-rating");
  }

  const params = await searchParams;
  const justRated = params.rated === "1";
  const ratedBookId = params.bookId?.trim() || null;

  const [ratedBooks, preferences, suggestions, matchScoreSeenFlag] =
    await Promise.all([
      getUserRatedBooks(user.id),
      getUserPreferences(user.id),
      getFirstRatingSuggestions().catch(() => []),
      getOnboardingMatchScoreSeen(user.id),
    ]);

  // Durable: any saved rating means the first-mark prompt is done.
  // Return visits (and post-celebrate navigation) go to Browse — not the prompt.
  if (ratedBooks.length >= 1 && !justRated) {
    redirect("/browse");
  }

  let ratedBookTitle: string | null = null;
  let matchScore: number | null = null;

  if (ratedBookId) {
    try {
      const [book, community] = await Promise.all([
        getBookById(ratedBookId).catch(() => null),
        getCommunityRatings(ratedBookId),
      ]);
      ratedBookTitle = book?.title?.trim() || null;

      if (
        preferences &&
        community.count > 0 &&
        community.averages !== null
      ) {
        matchScore = calculateMatchScore(
          community.averages,
          preferences
        ).score;
      }
    } catch {
      // Soft-fail — success UI still works without title/score.
    }
  }

  // If we just rated but title is unknown, try the user's rated list.
  if (ratedBookId && !ratedBookTitle) {
    const match = ratedBooks.find(
      (item) => item.slug === ratedBookId || item.bookId === ratedBookId
    );
    ratedBookTitle = match?.title ?? null;
  }

  const hasSeenMatchScore = matchScoreSeenFlag || matchScore != null;

  // Persist Match Score seen when we actually show a % on this visit.
  if (matchScore != null && !matchScoreSeenFlag) {
    await markOnboardingMatchScoreSeen(user.id);
  }

  const ratingCount =
    ratedBooks.length >= 1
      ? ratedBooks.length
      : justRated && ratedBookId
        ? 1
        : 0;

  const progress = getOnboardingProgress({
    isLoggedIn: true,
    preferences,
    ratingCount,
    hasSeenMatchScore,
  });

  return (
    <FirstRatingScreen
      suggestions={suggestions.filter((book) => book.title?.trim())}
      ratingCount={ratingCount}
      hasPreferences={progress.hasPreferences}
      hasSeenMatchScore={progress.hasSeenMatchScore}
      onboardingComplete={isOnboardingComplete(progress)}
      justRated={justRated}
      ratedBookId={ratedBookId}
      ratedBookTitle={ratedBookTitle}
      matchScore={matchScore}
    />
  );
}
