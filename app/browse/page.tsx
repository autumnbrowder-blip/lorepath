import { BookSearch } from "@/components/browse/BookSearch";
import { sessionUserIsAdmin } from "@/lib/admin";
import { isGenreSearchMode } from "@/lib/genre-search";
import { fetchNytBestsellers } from "@/lib/nyt-books";

type BrowsePageProps = {
  searchParams: Promise<{ q?: string; mode?: string }>;
};

export default async function BrowsePage({ searchParams }: BrowsePageProps) {
  const { q, mode } = await searchParams;
  const initialMode = isGenreSearchMode(mode) ? "genre" : "text";
  const hasQuery = Boolean(q?.trim());
  const showSourceDebug = await sessionUserIsAdmin();

  // Fail softly — never let NYT errors take down Browse / search.
  // Skip NYT work when the user already has a search query (results hide bestsellers).
  let bestsellers: Awaited<ReturnType<typeof fetchNytBestsellers>> = {
    books: [],
  };
  if (!hasQuery) {
    try {
      bestsellers = await fetchNytBestsellers();
    } catch (error) {
      console.error("Browse: NYT bestsellers unavailable:", error);
      bestsellers = {
        books: [],
        error:
          "The bestsellers archive is resting for now. Try searching below for any tome.",
      };
    }
  }

  return (
    <BookSearch
      initialQuery={q ?? ""}
      initialMode={initialMode}
      bestsellers={bestsellers.books}
      bestsellersError={bestsellers.error ?? null}
      showSourceDebug={showSourceDebug}
    />
  );
}
