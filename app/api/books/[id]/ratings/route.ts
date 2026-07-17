import { getCommunityRatings, submitUserRating } from "@/lib/ratings";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
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
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bookExternalId } = await params;
  const communityRatings = await getCommunityRatings(bookExternalId);
  return NextResponse.json(communityRatings, {
    headers: { "Cache-Control": "no-store" },
  });
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

  // One cookie-bound client for auth + write so the JWT reaches PostgREST
  // (auth.uid()) on the same connection used for book upsert + rating upsert.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "You must be signed in to submit a rating." },
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
    supabase,
    expectedUserId: user.id,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  const communityRatings = await getCommunityRatings(bookExternalId);

  return NextResponse.json({
    success: true,
    message: "Your marks have been recorded in the tome.",
    communityRatings,
  });
}
