import { BookSearch } from "@/components/browse/BookSearch";
import { isGenreSearchMode } from "@/lib/genre-search";
import { fetchNytBestsellers } from "@/lib/nyt-books";

type BrowsePageProps = {
  searchParams: Promise<{ q?: string; mode?: string }>;
};

export default async function BrowsePage({ searchParams }: BrowsePageProps) {
  const { q, mode } = await searchParams;
  const initialMode = isGenreSearchMode(mode) ? "genre" : "text";

  // Fail softly — never let NYT errors take down Browse / search.
  let bestsellers: Awaited<ReturnType<typeof fetchNytBestsellers>> = {
    books: [],
  };
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

  return (
    <BookSearch
      initialQuery={q ?? ""}
      initialMode={initialMode}
      bestsellers={bestsellers.books}
      bestsellersError={bestsellers.error ?? null}
    />
  );
}
