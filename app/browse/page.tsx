import { BookSearch } from "@/components/browse/BookSearch";
import { isGenreSearchMode } from "@/lib/genre-search";
import { fetchNytBestsellers } from "@/lib/nyt-books";
import {
  PAGE_FETCH_TIMEOUT_MS,
  withTimeoutFallback,
} from "@/lib/provider-resilience";
import { getUserRatedIdentities } from "@/lib/ratings";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCachedUser } from "@/lib/supabase/server";
import type { UserRatedIdentity } from "@/lib/user-rated-identity";

type BrowsePageProps = {
  searchParams: Promise<{ q?: string; mode?: string }>;
};

const NYT_UNAVAILABLE = {
  books: [] as Awaited<ReturnType<typeof fetchNytBestsellers>>["books"],
  error:
    "The bestsellers archive is resting for now. Try searching below for any tome.",
};

async function loadBrowseUser(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const user = await getCachedUser();
    return Boolean(user);
  } catch {
    return false;
  }
}

/** Signed-in only. One ratings query for Inscribed badges — never per card. */
async function loadBrowseRatedIdentities(): Promise<UserRatedIdentity[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const user = await getCachedUser();
    if (!user) return [];
    return await getUserRatedIdentities(user.id);
  } catch {
    return [];
  }
}

export default async function BrowsePage({ searchParams }: BrowsePageProps) {
  const { q, mode } = await searchParams;
  const initialMode = isGenreSearchMode(mode) ? "genre" : "text";

  // Always load NYT so clearing search restores bestsellers instead of a blank page.
  const [isLoggedIn, bestsellers] = await Promise.all([
    withTimeoutFallback(
      loadBrowseUser(),
      PAGE_FETCH_TIMEOUT_MS,
      "browse-auth",
      false
    ),
    withTimeoutFallback(
      fetchNytBestsellers(),
      PAGE_FETCH_TIMEOUT_MS,
      "browse-nyt",
      NYT_UNAVAILABLE
    ),
  ]);

  const ratedIdentities = isLoggedIn
    ? await withTimeoutFallback(
        loadBrowseRatedIdentities(),
        PAGE_FETCH_TIMEOUT_MS,
        "browse-rated-ids",
        []
      )
    : [];

  return (
    <BookSearch
      initialQuery={q ?? ""}
      initialMode={initialMode}
      bestsellers={bestsellers.books}
      bestsellersError={bestsellers.error ?? null}
      isLoggedIn={isLoggedIn}
      ratedIdentities={ratedIdentities}
    />
  );
}
