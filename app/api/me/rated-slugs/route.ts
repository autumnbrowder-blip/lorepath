import { getUserRatedSlugs } from "@/lib/ratings";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  createAuthenticatedClient,
  getBearerToken,
} from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Logged-in user's rated work slugs (external book ids).
 * Used by browse/search cards for Inscribed badges — never returns other users' data.
 */
export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ slugs: [] as string[] });
  }

  const session = await createAuthenticatedClient({
    accessToken: getBearerToken(request),
  });

  if ("error" in session) {
    return NextResponse.json(
      { slugs: [] as string[], error: "Sign in to see your inscribed tomes." },
      { status: 401 }
    );
  }

  const slugs = await getUserRatedSlugs(session.user.id);
  return NextResponse.json(
    { slugs },
    {
      headers: {
        "Cache-Control": "private, no-store",
      },
    }
  );
}
