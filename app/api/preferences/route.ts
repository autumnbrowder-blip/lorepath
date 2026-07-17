import { PREFERENCE_CATEGORIES } from "@/lib/rating-categories";
import {
  getSessionUser,
  getUserPreferences,
  saveUserPreferences,
} from "@/lib/preferences";
import { isSupabaseConfigured } from "@/lib/supabase/config";
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

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase is not configured." },
      { status: 503 }
    );
  }

  const session = await getSessionUser();
  if ("error" in session) {
    return NextResponse.json({ error: session.error }, { status: 401 });
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

  // One cookie-bound client for auth + write so the JWT reaches PostgREST
  // (auth.uid()) on the same connection used for upsert.
  const session = await getSessionUser();
  if ("error" in session) {
    return NextResponse.json({ error: session.error }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!isValidPreferences(body)) {
    return NextResponse.json(
      { error: "Each preference must be a number between 0 and 5." },
      { status: 400 }
    );
  }

  const saveResult = await saveUserPreferences(body, {
    supabase: session.supabase,
    expectedUserId: session.user.id,
  });

  if (!saveResult.success) {
    return NextResponse.json({ error: saveResult.error }, { status: 500 });
  }

  revalidatePath("/preferences");

  return NextResponse.json(
    {
      success: true,
      preferences: saveResult.preferences,
      message: "Your preferences have been inscribed.",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
