import { searchBooks } from "@/lib/books";
import { isGenreSearchMode } from "@/lib/genre-search";
import { RateLimitError } from "@/lib/google-books";
import { NextResponse } from "next/server";

/** Always hit providers at request time (token + live search). */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Search books via Google Books, Open Library, Gutendex, ISBNdb, and Big Book. */
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
    const result = await searchBooks(query, page, { mode });
    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        {
          error:
            "Book search is temporarily unavailable. Please try again in a minute.",
        },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: "Failed to fetch books. Please try again." },
      { status: 502 }
    );
  }
}
