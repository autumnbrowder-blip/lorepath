import { BookSearch } from "@/components/browse/BookSearch";
import { isGenreSearchMode } from "@/lib/genre-search";
import { fetchNytBestsellers } from "@/lib/nyt-books";
import { isBotUserAgent } from "@/lib/page-views";
import {
  PAGE_FETCH_TIMEOUT_MS,
  withTimeoutFallback,
} from "@/lib/provider-resilience";
import { getUserRatedIdentities } from "@/lib/ratings";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCachedUser } from "@/lib/supabase/server";
import type { UserRatedIdentity } from "@/lib/user-rated-identity";
import { headers } from "next/headers";

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
  const headerList = await headers();
  const allowNytNetwork = !isBotUserAgent(headerList.get("user-agent"));

  // Cached 6h. Bots never trigger NYT — they get memory/file cache or empty.
  const [isLoggedIn, bestsellers] = await Promise.all([
    withTimeoutFallback(
      loadBrowseUser(),
      PAGE_FETCH_TIMEOUT_MS,
      "browse-auth",
      false
    ),
    withTimeoutFallback(
      fetchNytBestsellers({ allowNetwork: allowNytNetwork }),
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
