import { searchBooks } from "@/lib/books";
import { repairSearchQuery } from "@/lib/book-utils";
import { isGenreSearchMode } from "@/lib/genre-search";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
/** q is read from the live request; never serve a cached body for a different q. */
export const dynamic = "force-dynamic";
/** Override per-fetch force-cache so provider results cannot leak across q. */
export const fetchCache = "force-no-store";
/** Allow Open Library's ~12s search.json budget to finish (Google is optional). */
export const maxDuration = 15;

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Vary: "Accept, Authorization",
} as const;

/**
 * Local public.books + cached NYT first, then Open Library / ISBNdb / Google.
 * Gutendex only for clear public-domain classics. Never calls Hardcover.
 * A source timeout becomes [] — if any books exist, error is null.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const rawQuery = searchParams.get("q")?.trim() ?? "";
  const query = repairSearchQuery(rawQuery);
  const modeParam = searchParams.get("mode");
  const pageParam = Number(searchParams.get("page") ?? "1");
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const mode = isGenreSearchMode(modeParam) ? "genre" : "text";

  if (!query) {
    return NextResponse.json(
      { error: "Search query is required.", query: "", books: [] },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const result = await searchBooks(query, page, { mode });
    const books = result.books ?? [];
    const error =
      books.length === 0 && result.allSourcesTimedOut
        ? "archives unavailable"
        : null;

    return NextResponse.json(
      {
        query,
        books,
        page: result.page,
        hasMore: result.hasMore,
        sources: result.sources ?? [],
        sourceCounts: result.sourceCounts ?? {},
        warning: result.warning ?? null,
        googleError: result.googleError ?? null,
        error,
      },
      {
        status: 200,
        headers: NO_STORE_HEADERS,
      }
    );
  } catch (error) {
    console.error("[api/books/search] unexpected failure:", error);
    return NextResponse.json(
      {
        query,
        books: [],
        page,
        hasMore: false,
        sourceCounts: {},
        warning: null,
        error: "archives unavailable",
      },
      {
        status: 200,
        headers: NO_STORE_HEADERS,
      }
    );
  }
}
