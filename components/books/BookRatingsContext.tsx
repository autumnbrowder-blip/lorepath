"use client";

import type { CommunityRatingsSummary } from "@/lib/ratings";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type BookRatingsContextValue = {
  bookId: string;
  communityRatings: CommunityRatingsSummary;
  setCommunityRatings: (next: CommunityRatingsSummary) => void;
};

const BookRatingsContext = createContext<BookRatingsContextValue | null>(null);

function ratingsSignature(data: CommunityRatingsSummary): string {
  return JSON.stringify({
    count: data.count,
    averages: data.averages,
  });
}

export function BookRatingsProvider({
  bookId,
  initialCommunityRatings,
  children,
}: {
  bookId: string;
  initialCommunityRatings: CommunityRatingsSummary;
  children: ReactNode;
}) {
  const [communityRatings, setCommunityRatingsState] = useState(
    initialCommunityRatings
  );

  useEffect(() => {
    setCommunityRatingsState((prev) => {
      if (
        ratingsSignature(prev) === ratingsSignature(initialCommunityRatings)
      ) {
        return prev;
      }

      // Don't clobber a fresher client update (from POST) with an empty SSR
      // payload if revalidation briefly races ahead of a readable SELECT.
      if (
        initialCommunityRatings.count === 0 &&
        initialCommunityRatings.averages == null &&
        prev.count > 0
      ) {
        return prev;
      }

      return initialCommunityRatings;
    });
  }, [initialCommunityRatings]);

  const setCommunityRatings = useCallback((next: CommunityRatingsSummary) => {
    setCommunityRatingsState(next);
  }, []);

  const value = useMemo(
    () => ({
      bookId,
      communityRatings,
      setCommunityRatings,
    }),
    [bookId, communityRatings, setCommunityRatings]
  );

  return (
    <BookRatingsContext.Provider value={value}>
      {children}
    </BookRatingsContext.Provider>
  );
}

export function useBookRatings() {
  const ctx = useContext(BookRatingsContext);
  if (!ctx) {
    throw new Error("useBookRatings must be used within BookRatingsProvider");
  }
  return ctx;
}

export function useBookRatingsOptional() {
  return useContext(BookRatingsContext);
}
