import { searchBooks } from "@/lib/books";
import { isGenreSearchMode } from "@/lib/genre-search";
import { RateLimitError } from "@/lib/google-books";
import { withTimeout } from "@/lib/provider-resilience";
import { getBearerToken } from "@/lib/supabase/server";
import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
/** Never statically cache this GET — q must be read from the live request. */
export const dynamic = "force-dynamic";
/** Override per-fetch force-cache so provider results cannot leak across q. */
export const fetchCache = "force-no-store";
export const revalidate = 0;
/** Netlify / serverless hard ceiling (seconds). Handler budget is tighter. */
export const maxDuration = 10;

/** Overall handler budget — must finish before Netlify kills the function. */
const SEARCH_HANDLER_BUDGET_MS = 8000;

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
} as const;

/**
 * Search books via Open Library, Google Books, Gutendex, and Big Book.
 * Provider outages soft-fail inside searchBooks (Promise.allSettled).
 */
export async function GET(request: NextRequest) {
  noStore();

  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q")?.trim() ?? "";
  const modeParam = searchParams.get("mode");
  const pageParam = Number(searchParams.get("page") ?? "1");
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const mode = isGenreSearchMode(modeParam) ? "genre" : "text";
  const accessToken = getBearerToken(request);

  if (!query) {
    return NextResponse.json(
      { error: "Search query is required.", query: "" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const result = await withTimeout(
      searchBooks(query, page, {
        mode,
        accessToken,
      }),
      SEARCH_HANDLER_BUDGET_MS,
      "api/books/search"
    );
    const wantsSourceDebug = searchParams.get("debugSources") === "1";
    let isAdmin = false;
    if (wantsSourceDebug) {
      const { sessionUserIsAdmin } = await import("@/lib/admin");
      isAdmin = await sessionUserIsAdmin();
    }

    // Public clients get books + paging only. Source breakdown is admin-only.
    // Echo `query` so a stale CDN/Data Cache hit can be rejected client-side.
    const payload = isAdmin
      ? { ...result, query }
      : {
          query,
          books: result.books,
          page: result.page,
          hasMore: result.hasMore,
          userRatedSlugs: result.userRatedSlugs ?? [],
          ...(wantsSourceDebug
            ? {
                sourceCounts: result.sourceCounts,
                descriptionSources: result.descriptionSources ?? {},
                // Status only — provider error bodies can name the project.
                googleStatus: result.googleError?.status ?? null,
              }
            : {}),
        };

    return NextResponse.json(payload, {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    console.error("[api/books/search] unexpected failure:", error);

    // Prefer soft empty results over a hard failure / Netlify timeout.
    const message =
      error instanceof RateLimitError
        ? "The archives are resting briefly. Try again in a moment."
        : error instanceof Error && error.name === "TimeoutError"
          ? "Search took too long across the shelves. Showing what we found — try again shortly."
          : "Search could not reach every shelf. Try again shortly.";

    return NextResponse.json(
      {
        query,
        books: [],
        page,
        hasMore: false,
        error: message,
      },
      {
        // 200 so the browse UI can render an empty state + message without a crash.
        status: 200,
        headers: NO_STORE_HEADERS,
      }
    );
  }
}
