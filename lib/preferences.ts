import { DEFAULT_USER_PREFERENCES } from "@/lib/rating-categories";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { ContentRating } from "@/types";
import { revalidatePath, unstable_noStore as noStore } from "next/cache";

const PREFERENCE_SELECT =
  "sexual_content, romance, lgbt, horror, ideology, pacing";
const LEGACY_PREFERENCE_SELECT =
  "sexual_content, lgbt, horror, ideology, pacing";

const ROMANCE_MIGRATION_HINT =
  "Your database is missing the romance column. Run supabase/migrations/20260716_add_romance_category.sql in the Supabase SQL Editor, then try again.";

const RLS_HINT =
  "Could not save preferences (blocked by row-level security). Confirm you are signed in and that user_preferences RLS policies allow select/insert/update for your own user_id.";

function clampPreference(value: unknown, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.min(5, Math.max(0, Math.round(value)));
}

function normalizePreferences(
  row: {
    sexual_content?: number | null;
    romance?: number | null;
    lgbt?: number | null;
    horror?: number | null;
    ideology?: number | null;
    pacing?: number | null;
  } | null | undefined
): ContentRating {
  return {
    sexual_content: clampPreference(
      row?.sexual_content,
      DEFAULT_USER_PREFERENCES.sexual_content
    ),
    romance: clampPreference(row?.romance, DEFAULT_USER_PREFERENCES.romance),
    lgbt: clampPreference(row?.lgbt, DEFAULT_USER_PREFERENCES.lgbt),
    horror: clampPreference(row?.horror, DEFAULT_USER_PREFERENCES.horror),
    ideology: clampPreference(row?.ideology, DEFAULT_USER_PREFERENCES.ideology),
    pacing: clampPreference(row?.pacing, DEFAULT_USER_PREFERENCES.pacing),
  };
}

function isMissingRomanceColumn(message: string): boolean {
  return (
    /romance/i.test(message) &&
    (/does not exist/i.test(message) ||
      /could not find/i.test(message) ||
      /schema cache/i.test(message) ||
      /PGRST204/i.test(message))
  );
}

function isRlsError(message: string): boolean {
  return (
    /row-level security/i.test(message) ||
    /permission denied/i.test(message) ||
    /42501/.test(message) ||
    /violates row-level security/i.test(message)
  );
}

function formatPreferenceError(message: string): string {
  if (isMissingRomanceColumn(message)) return ROMANCE_MIGRATION_HINT;
  if (isRlsError(message)) return RLS_HINT;
  return message || "Failed to save preferences.";
}

type PreferenceRow = {
  sexual_content: number;
  romance?: number | null;
  lgbt: number;
  horror: number;
  ideology: number;
  pacing: number;
};

async function fetchPreferenceRow(
  userId: string
): Promise<
  | { data: PreferenceRow; error: null }
  | { data: null; error: string | null }
> {
  const supabase = await createClient();

  const primary = await supabase
    .from("user_preferences")
    .select(PREFERENCE_SELECT)
    .eq("user_id", userId)
    .maybeSingle();

  if (!primary.error) {
    return { data: (primary.data as PreferenceRow | null) ?? null, error: null };
  }

  if (isMissingRomanceColumn(primary.error.message)) {
    const legacy = await supabase
      .from("user_preferences")
      .select(LEGACY_PREFERENCE_SELECT)
      .eq("user_id", userId)
      .maybeSingle();

    if (legacy.error) {
      return { data: null, error: legacy.error.message };
    }

    return {
      data: legacy.data
        ? ({ ...legacy.data, romance: DEFAULT_USER_PREFERENCES.romance } as PreferenceRow)
        : null,
      error: null,
    };
  }

  return { data: null, error: primary.error.message };
}

export async function getUserPreferences(
  userId: string
): Promise<ContentRating> {
  // Never serve a cached empty/default payload after a successful save.
  noStore();

  if (!isSupabaseConfigured()) {
    return DEFAULT_USER_PREFERENCES;
  }

  try {
    const result = await fetchPreferenceRow(userId);
    if (result.error || !result.data) {
      return DEFAULT_USER_PREFERENCES;
    }
    return normalizePreferences(result.data);
  } catch {
    return DEFAULT_USER_PREFERENCES;
  }
}

export async function saveUserPreferences(
  userId: string,
  preferences: ContentRating
): Promise<
  | { success: true; preferences: ContentRating }
  | { success: false; error: string }
> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: "Supabase is not configured." };
  }

  const normalized = normalizePreferences(preferences);
  const supabase = await createClient();

  // Ensure a profiles row exists so the user_preferences FK cannot fail silently.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    return { success: false, error: formatPreferenceError(profileError.message) };
  }

  if (!profile) {
    return {
      success: false,
      error:
        "No profile was found for your account. Sign out and back in, or recreate your profile, then try again.",
    };
  }

  const fullRow = {
    user_id: userId,
    sexual_content: normalized.sexual_content,
    romance: normalized.romance,
    lgbt: normalized.lgbt,
    horror: normalized.horror,
    ideology: normalized.ideology,
    pacing: normalized.pacing,
  };

  const primaryWrite = await supabase
    .from("user_preferences")
    .upsert(fullRow, { onConflict: "user_id" })
    .select(PREFERENCE_SELECT)
    .maybeSingle();

  let savedRow: PreferenceRow | null =
    !primaryWrite.error && primaryWrite.data
      ? (primaryWrite.data as PreferenceRow)
      : null;
  let writeError = primaryWrite.error;

  if (writeError && isMissingRomanceColumn(writeError.message)) {
    // Keep other categories writable until the romance migration is applied.
    const { romance: _romance, ...legacyRow } = fullRow;
    const legacy = await supabase
      .from("user_preferences")
      .upsert(legacyRow, { onConflict: "user_id" })
      .select(LEGACY_PREFERENCE_SELECT)
      .maybeSingle();

    savedRow = legacy.data
      ? ({ ...legacy.data, romance: normalized.romance } as PreferenceRow)
      : null;
    writeError = legacy.error;
  }

  if (writeError) {
    return { success: false, error: formatPreferenceError(writeError.message) };
  }

  if (!savedRow) {
    // Upsert can report no error while RLS hides the write — verify with a read.
    const verify = await fetchPreferenceRow(userId);
    if (verify.error) {
      return { success: false, error: formatPreferenceError(verify.error) };
    }
    if (!verify.data) {
      return { success: false, error: RLS_HINT };
    }
    savedRow = verify.data;
  }

  const confirmed = normalizePreferences(savedRow);
  revalidatePath("/preferences");
  revalidatePath("/browse");
  return { success: true, preferences: confirmed };
}

export async function getUserProfile(userId: string) {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, is_subscriber, created_at")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}
