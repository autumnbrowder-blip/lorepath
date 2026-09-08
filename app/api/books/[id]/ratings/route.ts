import {
  getCommunityRatings,
  getUserRatingForBook,
  submitUserRating,
} from "@/lib/ratings";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  createAuthenticatedClient,
  createClient,
  getBearerToken,
} from "@/lib/supabase/server";
import { withTimeout } from "@/lib/provider-resilience";
import type { ContentRating } from "@/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 10;

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
  const empty = { averages: null, count: 0, userRating: null as ContentRating | null };

  if (!isSupabaseConfigured()) {
    return NextResponse.json(empty, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  const accessToken = getBearerToken(request);
  const cookieHeader = request.headers.get("cookie") ?? "";
  const mightHaveSession =
    Boolean(accessToken) || /auth-token/i.test(cookieHeader);

  // Signed-out: do not hit ratings at all.
  if (!mightHaveSession) {
    return NextResponse.json(empty, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    const session = await withTimeout(
      createAuthenticatedClient({
        accessToken,
      }),
      2000,
      "ratings-get-auth"
    );
    if ("error" in session) {
      return NextResponse.json(empty, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    const [communityRatings, userRating] = await Promise.all([
      withTimeout(
        getCommunityRatings(bookExternalId),
        2500,
        "ratings-get-community"
      ),
      withTimeout(
        getUserRatingForBook(bookExternalId, session.user.id),
        2000,
        "ratings-get-user"
      ),
    ]);

    return NextResponse.json(
      { ...communityRatings, userRating },
      {
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error("[api/books/ratings GET] failed:", error);
    // Never map 57014 to a retryable 500 — clients must not re-hit the same scan.
    return NextResponse.json(empty, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

const SIGN_IN_TO_INSCRIBE = "Sign in to inscribe";
const RATING_SAVE_ERROR =
  "Those marks could not be recorded. Stay on this page and try again. If it fails twice, sign in again.";

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

  // Cookie session via createServerClient; Bearer is optional extra.
  const supabase = await createClient();
  const bearer = getBearerToken(request);
  let user = bearer
    ? (await supabase.auth.getUser(bearer)).data.user
    : null;
  let accessToken = bearer;
  if (!user) {
    user = (await supabase.auth.getUser()).data.user;
  }
  if (user && !accessToken) {
    accessToken =
      (await supabase.auth.getSession()).data.session?.access_token ?? null;
  }

  if (!user) {
    return NextResponse.json({ error: SIGN_IN_TO_INSCRIBE }, { status: 401 });
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
    expectedUserId: user.id,
    accessToken,
    verifiedUserId: user.id,
  });

  if (!result.success) {
    const isAuth = /sign in to inscribe|not signed in/i.test(result.error);
    return NextResponse.json(
      { error: isAuth ? SIGN_IN_TO_INSCRIBE : RATING_SAVE_ERROR },
      { status: isAuth ? 401 : 500 }
    );
  }

  return NextResponse.json({
    success: true,
    message: "Your marks have been recorded in the tome.",
    communityRatings: result.communityRatings,
    userRating: result.userRating,
  });
}
