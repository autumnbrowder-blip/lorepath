import { PREFERENCE_CATEGORIES } from "@/lib/rating-categories";
import {
  getUserPreferences,
  getUserProfile,
  saveUserPreferences,
} from "@/lib/preferences";
import { hasPremiumAccess } from "@/lib/subscription";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { ContentRating } from "@/types";
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

async function requirePremiumUser() {
  if (!isSupabaseConfigured()) {
    return {
      error: NextResponse.json(
        { error: "Supabase is not configured." },
        { status: 503 }
      ),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  }

  const profile = await getUserProfile(user.id);
  if (!profile || !hasPremiumAccess(profile)) {
    return {
      error: NextResponse.json(
        { error: "Premium access required." },
        { status: 403 }
      ),
    };
  }

  return { user };
}

export async function GET() {
  const result = await requirePremiumUser();
  if ("error" in result && result.error) return result.error;

  const preferences = await getUserPreferences(result.user!.id);
  return NextResponse.json({ preferences });
}

export async function PUT(request: Request) {
  const result = await requirePremiumUser();
  if ("error" in result && result.error) return result.error;

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

  const saveResult = await saveUserPreferences(result.user!.id, body);
  if (!saveResult.success) {
    return NextResponse.json({ error: saveResult.error }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    preferences: body,
  });
}
