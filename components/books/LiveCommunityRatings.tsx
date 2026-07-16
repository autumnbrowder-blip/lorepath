"use client";

import { CommunityRatings } from "@/components/books/CommunityRatings";
import { useBookRatings } from "@/components/books/BookRatingsContext";

/** Client wrapper — updates in place when ratings change after submit. */
export function LiveCommunityRatings() {
  const { communityRatings } = useBookRatings();

  return <CommunityRatings data={communityRatings} />;
}
