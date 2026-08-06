import { getUserRatedIdentities } from "@/lib/ratings";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  createAuthenticatedClient,
  getBearerToken,
} from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Logged-in user's rated works for Inscribed browse badges.
 * Returns slug (rating identity) + title/author for work-level matching
 * when search cards use a different provider id than the rated slug.
 */
export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ slugs: [] as string[], identities: [] });
  }

  const session = await createAuthenticatedClient({
    accessToken: getBearerToken(request),
  });

  if ("error" in session) {
    return NextResponse.json(
      {
        slugs: [] as string[],
        identities: [],
        error: "Sign in to see your inscribed tomes.",
      },
      { status: 401 }
    );
  }

  const identities = await getUserRatedIdentities(session.user.id);
  return NextResponse.json(
    {
      slugs: identities.map((row) => row.slug),
      identities,
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
      },
    }
  );
}
