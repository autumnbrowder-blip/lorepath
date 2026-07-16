"use client";

import { MatchScore } from "@/components/books/MatchScore";
import { useBookRatings } from "@/components/books/BookRatingsContext";
import type { ContentRating } from "@/types";

type LiveMatchScoreProps = {
  isLoggedIn: boolean;
  userPreferences: ContentRating | null;
};

/** Match Score that tracks the same live community averages. */
export function LiveMatchScore({
  isLoggedIn,
  userPreferences,
}: LiveMatchScoreProps) {
  const { communityRatings } = useBookRatings();

  return (
    <MatchScore
      isLoggedIn={isLoggedIn}
      communityRatings={communityRatings}
      userPreferences={userPreferences}
    />
  );
}
