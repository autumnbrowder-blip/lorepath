import { searchBooks } from "@/lib/books";
import { isGenreSearchMode } from "@/lib/genre-search";
import { RateLimitError } from "@/lib/google-books";
import { withTimeout } from "@/lib/provider-resilience";
import { publicGetCacheHeaders } from "@/lib/public-cache-headers";
import { getBearerToken } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
/** Honor per-fetch revalidate even though this handler reads searchParams. */
export const fetchCache = "default-cache";
/** Netlify / serverless hard ceiling (seconds). Handler budget is tighter. */
export const maxDuration = 10;

/** Overall handler budget — must finish before Netlify kills the function. */
const SEARCH_HANDLER_BUDGET_MS = 8000;

/**
 * Search books via Open Library, Google Books, Gutendex, and Big Book.
 * Provider outages soft-fail inside searchBooks (Promise.allSettled).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  const modeParam = searchParams.get("mode");
  const pageParam = Number(searchParams.get("page") ?? "1");
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const mode = isGenreSearchMode(modeParam) ? "genre" : "text";
  const accessToken = getBearerToken(request);
  const authenticated = Boolean(accessToken);

  if (!query) {
    return NextResponse.json(
      { error: "Search query is required." },
      { status: 400 }
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
    const payload = isAdmin
      ? result
      : {
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

    const cacheable = result.books.length > 0 && !wantsSourceDebug;
    return NextResponse.json(payload, {
      headers: publicGetCacheHeaders({ authenticated, cacheable }),
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
        books: [],
        page,
        hasMore: false,
        error: message,
      },
      {
        // 200 so the browse UI can render an empty state + message without a crash.
        status: 200,
        headers: publicGetCacheHeaders({
          authenticated,
          cacheable: false,
        }),
      }
    );
  }
}
