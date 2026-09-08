import { BookSearch } from "@/components/browse/BookSearch";
import { isGenreSearchMode } from "@/lib/genre-search";
import { fetchNytBestsellers } from "@/lib/nyt-books";
import {
  PAGE_FETCH_TIMEOUT_MS,
  withTimeoutFallback,
} from "@/lib/provider-resilience";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCachedUser } from "@/lib/supabase/server";

type BrowsePageProps = {
  searchParams: Promise<{ q?: string; mode?: string }>;
};

const NYT_UNAVAILABLE = {
  books: [] as Awaited<ReturnType<typeof fetchNytBestsellers>>["books"],
  error:
    "The bestsellers archive is resting for now. Try searching below for any tome.",
};

async function loadBrowseLoggedIn(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const user = await getCachedUser();
    return Boolean(user);
  } catch {
    return false;
  }
}

export default async function BrowsePage({ searchParams }: BrowsePageProps) {
  const { q, mode } = await searchParams;
  const initialMode = isGenreSearchMode(mode) ? "genre" : "text";
  const hasQuery = Boolean(q?.trim());

  const emptyBestsellers: Awaited<ReturnType<typeof fetchNytBestsellers>> = {
    books: [],
  };

  // Auth cookie check + NYT in parallel. Never load ratings or preferences.
  const [isLoggedIn, bestsellers] = await Promise.all([
    withTimeoutFallback(
      loadBrowseLoggedIn(),
      PAGE_FETCH_TIMEOUT_MS,
      "browse-auth",
      false
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
      isLoggedIn={isLoggedIn}
    />
  );
}
