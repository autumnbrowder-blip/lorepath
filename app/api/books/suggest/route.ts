import { suggestBooks } from "@/lib/suggest-books";
import { withTimeout } from "@/lib/provider-resilience";
import { publicGetCacheHeaders } from "@/lib/public-cache-headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const fetchCache = "default-cache";
export const maxDuration = 8;

const SUGGEST_BUDGET_MS = 3500;

/**
 * Lightweight autocomplete for browse search.
 * Debounced client-side; cancels in-flight via AbortController.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";

  if (query.length < 2) {
    return NextResponse.json(
      { suggestions: [], didYouMean: null },
      {
        headers: publicGetCacheHeaders({ authenticated: false, cacheable: true, sMaxAge: 30 }),
      }
    );
  }

  try {
    const result = await withTimeout(
      suggestBooks(query),
      SUGGEST_BUDGET_MS,
      "api/books/suggest"
    );
    const cacheable = result.suggestions.length > 0 || Boolean(result.didYouMean);
    return NextResponse.json(result, {
      headers: publicGetCacheHeaders({ authenticated: false, cacheable, sMaxAge: 60 }),
    });
  } catch (error) {
    console.error("[api/books/suggest] failed:", error);
    return NextResponse.json(
      { suggestions: [], didYouMean: null },
      {
        status: 200,
        headers: publicGetCacheHeaders({ authenticated: false, cacheable: false }),
      }
    );
  }
}
