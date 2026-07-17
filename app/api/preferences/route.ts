import { PREFERENCE_CATEGORIES } from "@/lib/rating-categories";
import {
  getSessionUser,
  getUserPreferences,
  saveUserPreferences,
} from "@/lib/preferences";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getBearerToken } from "@/lib/supabase/server";
import type { ContentRating } from "@/types";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

const PREFERENCE_KEYS: (keyof ContentRating)[] = PREFERENCE_CATEGORIES.map(
  (c) => c.key
);

function isValidPreferences(value: unknown): value is ContentRating {
  if (!value || typeof value !== "object") return false;
  return PREFERENCE_KEYS.every((key) => {
    const pref = (value as ContentRating)[key];
    return typeof pref === "number" && pref >= 0 && pref <= 5;
  });
}

/** Optional body.user_id — never used for the write; diagnostics / mismatch only. */
function extractBodyUserId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { user_id?: unknown }).user_id;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase is not configured." },
      { status: 503 }
    );
  }

  // Prefer browser-supplied Bearer token; fall back to cookie session JWT.
  const session = await getSessionUser({
    accessToken: getBearerToken(request),
  });
  if ("error" in session) {
    return NextResponse.json(
      {
        error: session.error,
        code: session.code,
        hadAuthorizationHeader: Boolean(getBearerToken(request)),
        sessionUserId: null,
        bodyUserId: null,
      },
      { status: 401 }
    );
  }

  const preferences = await getUserPreferences(session.user.id);
  return NextResponse.json(
    { preferences },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function PUT(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase is not configured." },
      { status: 503 }
    );
  }

  const hadAuthorizationHeader = Boolean(getBearerToken(request));

  // Auth check first (Bearer preferred). Writes use the service role client
  // after JWT verification — see saveUserPreferences.
  const session = await getSessionUser({
    accessToken: getBearerToken(request),
  });
  if ("error" in session) {
    return NextResponse.json(
      {
        error: session.error,
        code: session.code,
        hadAuthorizationHeader,
        sessionUserId: null,
        bodyUserId: null,
      },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: "Invalid request body.",
        hadAuthorizationHeader,
        sessionUserId: session.user.id,
        bodyUserId: null,
      },
      { status: 400 }
    );
  }

  const bodyUserId = extractBodyUserId(body);

  if (!isValidPreferences(body)) {
    return NextResponse.json(
      {
        error: "Each preference must be a number between 0 and 5.",
        hadAuthorizationHeader,
        sessionUserId: session.user.id,
        bodyUserId,
      },
      { status: 400 }
    );
  }

  const saveResult = await saveUserPreferences(body, {
    expectedUserId: session.user.id,
    accessToken: session.accessToken,
    bodyUserId,
    hadAuthorizationHeader,
  });

  if (!saveResult.success) {
    return NextResponse.json(
      {
        error: saveResult.error,
        code: saveResult.supabaseCode,
        supabaseMessage: saveResult.supabaseMessage,
        // Diagnostics only — never include the token itself.
        sessionUserId: saveResult.debug.sessionUserId,
        bodyUserId: saveResult.debug.bodyUserId,
        hadAuthorizationHeader: saveResult.debug.hadAuthorizationHeader,
        userIdMatched: saveResult.debug.userIdMatched,
      },
      { status: 500 }
    );
  }

  revalidatePath("/preferences");

  return NextResponse.json(
    {
      success: true,
      preferences: saveResult.preferences,
      message: "Your preferences have been inscribed.",
      sessionUserId: saveResult.debug.sessionUserId,
      bodyUserId: saveResult.debug.bodyUserId,
      hadAuthorizationHeader: saveResult.debug.hadAuthorizationHeader,
      userIdMatched: saveResult.debug.userIdMatched,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
