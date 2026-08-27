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

async function loadBrowseAuth(): Promise<{
  isLoggedIn: boolean;
  initialRatedIdentities: UserRatedIdentity[];
}> {
  if (!isSupabaseConfigured()) {
    return { isLoggedIn: false, initialRatedIdentities: [] };
  }
  try {
    const user = await getCachedUser();
    if (!user) return { isLoggedIn: false, initialRatedIdentities: [] };
    const initialRatedIdentities = await getUserRatedIdentities(user.id);
    return { isLoggedIn: true, initialRatedIdentities };
  } catch {
    return { isLoggedIn: false, initialRatedIdentities: [] };
  }
}

export default async function BrowsePage({ searchParams }: BrowsePageProps) {
  const { q, mode } = await searchParams;
  const initialMode = isGenreSearchMode(mode) ? "genre" : "text";
  const hasQuery = Boolean(q?.trim());

  const emptyBestsellers: Awaited<ReturnType<typeof fetchNytBestsellers>> = {
    books: [],
  };

  // Auth + NYT in parallel, each with a hard deadline. Never block first paint.
  const [auth, bestsellers] = await Promise.all([
    withTimeoutFallback(
      loadBrowseAuth(),
      PAGE_FETCH_TIMEOUT_MS,
      "browse-auth",
      { isLoggedIn: false, initialRatedIdentities: [] }
    ),
    hasQuery
      ? Promise.resolve(emptyBestsellers)
      : withTimeoutFallback(
          fetchNytBestsellers(),
          PAGE_FETCH_TIMEOUT_MS,
          "browse-nyt",
          NYT_UNAVAILABLE
        ),
  ]);

  return (
    <BookSearch
      initialQuery={q ?? ""}
      initialMode={initialMode}
      bestsellers={bestsellers.books}
      bestsellersError={bestsellers.error ?? null}
      isLoggedIn={auth.isLoggedIn}
      initialRatedIdentities={
        auth.isLoggedIn ? auth.initialRatedIdentities : []
      }
    />
  );
}
