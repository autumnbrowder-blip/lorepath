import {
  getCommunityRatings,
  getUserRatingForBook,
  submitUserRating,
  type CommunityRatingsSummary,
} from "@/lib/ratings";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  createAuthenticatedClient,
  createClient,
  getBearerToken,
  hasRequestAuthCookie,
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

const SIGN_IN_TO_INSCRIBE = "Sign in to inscribe";

export type RatingSaveResponse = {
  ok: boolean;
  status: number;
  code: string | null;
  message: string;
  sessionUserId: string | null;
  communityRatings?: CommunityRatingsSummary;
  userRating?: ContentRating;
};

function ratingJson(payload: RatingSaveResponse) {
  return NextResponse.json(payload, {
    status: payload.status,
    headers: { "Cache-Control": "no-store" },
  });
}

function isValidRating(value: unknown): value is ContentRating {
  if (!value || typeof value !== "object") return false;

  return RATING_KEYS.every((key) => {
    const rating = (value as ContentRating)[key];
    return typeof rating === "number" && rating >= 0 && rating <= 5;
  });
}

function failureStatus(code: string | null, message: string): number {
  if (code === "supabase_unconfigured" || /not configured/i.test(message)) {
    return 503;
  }
  if (code === "book_not_found" || /book not found/i.test(message)) {
    return 404;
  }
  if (
    code === "no_user" ||
    code === "invalid_token" ||
    /sign in to inscribe/i.test(message)
  ) {
    return 401;
  }
  if (
    code === "42501" ||
    code === "PGRST301" ||
    code === "user_mismatch" ||
    /row-level security/i.test(message)
  ) {
    return 403;
  }
  if (code === "missing_romance_column" || /each rating must be/i.test(message)) {
    return 400;
  }
  return 500;
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bookExternalId } = await params;

  if (!isSupabaseConfigured()) {
    return ratingJson({
      ok: false,
      status: 503,
      code: "supabase_unconfigured",
      message: "Supabase is not configured.",
      sessionUserId: null,
    });
  }

  const cookieClient = await createClient();
  const bearer = getBearerToken(request);
  const hasCookie = await hasRequestAuthCookie();
  const hadSessionHint = hasCookie || Boolean(bearer);

  let authCode: string | null = null;
  let authMessage: string | null = null;
  let refreshed = false;

  async function loadUser() {
    if (bearer) {
      const { data, error } = await cookieClient.auth.getUser(bearer);
      if (error) {
        authCode = error.code ?? authCode;
        authMessage = error.message;
      }
      if (data.user) return data.user;
    }
    const { data, error } = await cookieClient.auth.getUser();
    if (error) {
      authCode = error.code ?? authCode;
      authMessage = error.message;
    }
    return data.user;
  }

  let user = await loadUser();
  let accessToken = bearer;

  if (user && !accessToken) {
    accessToken =
      (await cookieClient.auth.getSession()).data.session?.access_token ?? null;
  }

  // Cookie/Bearer present: never tell them to sign in again. Refresh once.
  if (!user && hadSessionHint) {
    refreshed = true;
    const { data, error } = await cookieClient.auth.refreshSession();
    if (error) {
      authCode = error.code ?? authCode;
      authMessage = error.message;
    }
    user = data.user ?? (await cookieClient.auth.getUser()).data.user;
    accessToken = data.session?.access_token ?? accessToken;
  }

  if (!user) {
    if (!hadSessionHint) {
      return ratingJson({
        ok: false,
        status: 401,
        code: authCode ?? "no_user",
        message: SIGN_IN_TO_INSCRIBE,
        sessionUserId: null,
      });
    }
    return ratingJson({
      ok: false,
      status: 401,
      code: authCode ?? "session_refresh_failed",
      message:
        authMessage ||
        "A session cookie was present but getUser() and refreshSession() could not verify the user.",
      sessionUserId: null,
    });
  }

  if (!accessToken) {
    accessToken =
      (await cookieClient.auth.getSession()).data.session?.access_token ?? null;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return ratingJson({
      ok: false,
      status: 400,
      code: "invalid_body",
      message: "Invalid request body.",
      sessionUserId: user.id,
    });
  }

  if (!isValidRating(body)) {
    return ratingJson({
      ok: false,
      status: 400,
      code: "invalid_ratings",
      message: "Each rating must be a number between 0 and 5.",
      sessionUserId: user.id,
    });
  }

  const ratings: ContentRating = {
    sexual_content: body.sexual_content,
    romance: body.romance,
    lgbt: body.lgbt,
    horror: body.horror,
    ideology: body.ideology,
    pacing: body.pacing,
  };

  async function attempt() {
    return submitUserRating(bookExternalId, ratings, {
      expectedUserId: user!.id,
      accessToken,
      verifiedUserId: user!.id,
    });
  }

  let result = await attempt();

  if (!result.success && result.authRetryable && !refreshed && hadSessionHint) {
    refreshed = true;
    const { data, error } = await cookieClient.auth.refreshSession();
    if (!error && (data.session?.access_token || data.user)) {
      accessToken = data.session?.access_token ?? accessToken;
      if (data.user) user = data.user;
      result = await attempt();
    } else if (error) {
      result = {
        ...result,
        code: result.code ?? error.code ?? "session_refresh_failed",
        error: `${result.error} Refresh: ${error.message}`,
      };
    }
  }

  if (!result.success) {
    let status = failureStatus(result.code, result.error);
    // getUser() already succeeded — do not send a sign-in 401.
    if (status === 401) status = 403;
    return ratingJson({
      ok: false,
      status,
      code: result.code,
      message: result.error,
      sessionUserId: result.sessionUserId ?? user.id,
    });
  }

  return ratingJson({
    ok: true,
    status: 200,
    code: null,
    message: "Your marks have been recorded in the tome.",
    sessionUserId: result.sessionUserId,
    communityRatings: result.communityRatings,
    userRating: result.userRating,
  });
}
