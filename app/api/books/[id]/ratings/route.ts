import {
  getCommunityRatings,
  getUserRatingForBook,
  submitUserRating,
} from "@/lib/ratings";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  createAuthenticatedClient,
  getBearerToken,
} from "@/lib/supabase/server";
import type { ContentRating } from "@/types";
import { NextResponse } from "next/server";

const RATING_KEYS: (keyof ContentRating)[] = [
  "sexual_content",
  "romance",
  "lgbt",
  "horror",
  "ideology",
  "pacing",
];

function isValidRating(value: unknown): value is ContentRating {
  if (!value || typeof value !== "object") return false;

  return RATING_KEYS.every((key) => {
    const rating = (value as ContentRating)[key];
    return typeof rating === "number" && rating >= 0 && rating <= 5;
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bookExternalId } = await params;
  const communityRatings = await getCommunityRatings(bookExternalId);

  let userRating: ContentRating | null = null;
  if (isSupabaseConfigured()) {
    const session = await createAuthenticatedClient({
      accessToken: getBearerToken(request),
    });
    if (!("error" in session)) {
      userRating = await getUserRatingForBook(
        bookExternalId,
        session.user.id
      );
    }
  }

  return NextResponse.json(
    { ...communityRatings, userRating },
    {
      headers: { "Cache-Control": "no-store" },
    }
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bookExternalId } = await params;

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase is not configured." },
      { status: 503 }
    );
  }

  // Verify JWT first. Writes use the service role client after auth —
  // see submitUserRating (rated_by is always the verified user.id).
  const session = await createAuthenticatedClient({
    accessToken: getBearerToken(request),
  });
  if ("error" in session) {
    return NextResponse.json(
      { error: "You must be signed in to submit a rating.", code: session.code },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  if (!isValidRating(body)) {
    return NextResponse.json(
      { error: "Each rating must be a number between 0 and 5." },
      { status: 400 }
    );
  }

  const result = await submitUserRating(bookExternalId, body, {
    expectedUserId: session.user.id,
    accessToken: session.accessToken,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  // Prefer community averages computed on the same service-role client as the
  // write — avoids empty averages from a flaky anon/romance SELECT right after save.
  return NextResponse.json({
    success: true,
    message: "Your marks have been recorded in the tome.",
    communityRatings: result.communityRatings,
    userRating: result.userRating,
  });
}
