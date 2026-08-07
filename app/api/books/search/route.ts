import { sessionUserIsAdmin } from "@/lib/admin";
import { searchBooks } from "@/lib/books";
import { isGenreSearchMode } from "@/lib/genre-search";
import { RateLimitError } from "@/lib/google-books";
import { getBearerToken } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/** Always hit providers at request time (token + live search). */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Search books via Open Library, Google Books, Gutendex, and Big Book.
 * ISBNdb is not part of the browse flood — reserved for detail enrichment.
 * Provider outages soft-fail inside searchBooks (Promise.allSettled).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  const modeParam = searchParams.get("mode");
  const pageParam = Number(searchParams.get("page") ?? "1");
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const mode = isGenreSearchMode(modeParam) ? "genre" : "text";

  if (!query) {
    return NextResponse.json(
      { error: "Search query is required." },
      { status: 400 }
    );
  }

  try {
    const result = await searchBooks(query, page, {
      mode,
      accessToken: getBearerToken(request),
    });
    const isAdmin = await sessionUserIsAdmin();
    // `?debugSources=1` explains where each description came from — counts
    // only, no credentials, so it is safe for diagnosing empty result reports.
    const wantsSourceDebug = searchParams.get("debugSources") === "1";

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
              }
            : {}),
        };

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[api/books/search] unexpected failure:", error);

    // Prefer soft empty results over a hard failure — Open Library / other
    // providers normally keep searchBooks from throwing.
    const message =
      error instanceof RateLimitError
        ? "The archives are resting briefly. Try again in a moment."
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
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
