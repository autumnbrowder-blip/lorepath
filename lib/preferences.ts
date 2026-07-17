import { DEFAULT_AVATAR_KEY } from "@/lib/avatars";
import { DEFAULT_USER_PREFERENCES } from "@/lib/rating-categories";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { ContentRating } from "@/types";
import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import type { SupabaseClient, User } from "@supabase/supabase-js";

const PREFERENCE_SELECT =
  "sexual_content, romance, lgbt, horror, ideology, pacing";
const LEGACY_PREFERENCE_SELECT =
  "sexual_content, lgbt, horror, ideology, pacing";

const PREFS_SQL_HINT =
  "Run supabase/migrations/20260716_fix_user_preferences_production.sql in the Supabase SQL Editor, then try again.";

const ROMANCE_MIGRATION_HINT =
  `Your database is missing the romance column. ${PREFS_SQL_HINT}`;

const RLS_WRITE_HINT =
  `Could not save preferences (blocked by row-level security on INSERT/UPDATE). Confirm you are signed in and that user_preferences policies allow insert/update where user_id = auth.uid(). ${PREFS_SQL_HINT}`;

const RLS_READBACK_HINT =
  `Preferences may have been written, but the row could not be read back (SELECT RLS or grants). Upsert needs a SELECT policy where user_id = auth.uid(). ${PREFS_SQL_HINT}`;

const GRANT_HINT =
  `Could not save preferences (permission denied on user_preferences). ${PREFS_SQL_HINT}`;

const FK_HINT =
  "Could not save preferences because no profile exists for your account (foreign key). Sign out and back in, or open /profile once, then try again.";

const NO_SESSION_HINT =
  "You are not signed in. Please sign in and try again.";

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

function isForeignKeyError(message: string): boolean {
  return (
    /foreign key/i.test(message) ||
    /23503/.test(message) ||
    /violates foreign key constraint/i.test(message)
  );
}

function isGrantError(message: string): boolean {
  return (
    /permission denied for (table|relation) user_preferences/i.test(message) ||
    (/permission denied/i.test(message) && /user_preferences/i.test(message))
  );
}

function isRlsError(message: string): boolean {
  return (
    /row-level security/i.test(message) ||
    /violates row-level security/i.test(message) ||
    /42501/.test(message) ||
    (/permission denied/i.test(message) && !isGrantError(message))
  );
}

function formatPreferenceError(message: string): string {
  if (isMissingRomanceColumn(message)) return ROMANCE_MIGRATION_HINT;
  if (isForeignKeyError(message)) return FK_HINT;
  if (isGrantError(message)) return GRANT_HINT;
  if (isRlsError(message)) return RLS_WRITE_HINT;
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

type PreferenceWriteRow = {
  user_id: string;
  sexual_content: number;
  romance?: number;
  lgbt: number;
  horror: number;
  ideology: number;
  pacing: number;
};

async function fetchPreferenceRow(
  supabase: SupabaseClient,
  userId: string
): Promise<
  | { data: PreferenceRow; error: null }
  | { data: null; error: string | null }
> {
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

/**
 * user_preferences.user_id references profiles(id). Create a profile row if
 * the signup trigger never ran (or the row was deleted).
 */
async function ensureProfileExists(
  supabase: SupabaseClient,
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    return { ok: false, error: formatPreferenceError(profileError.message) };
  }

  if (profile) return { ok: true };

  const { error: upsertError } = await supabase.from("profiles").upsert(
    { id: userId, avatar_key: DEFAULT_AVATAR_KEY },
    { onConflict: "id" }
  );

  if (upsertError) {
    return { ok: false, error: formatPreferenceError(upsertError.message) };
  }

  const { data: created, error: verifyError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (verifyError) {
    return { ok: false, error: formatPreferenceError(verifyError.message) };
  }

  if (!created) {
    return {
      ok: false,
      error:
        "No profile was found for your account and creating one was blocked. Confirm profiles RLS allows insert/select for your own id, then try again.",
    };
  }

  return { ok: true };
}

/**
 * Upsert without .select()/RETURNING.
 * Coupling write + RETURNING makes a missing SELECT policy look like a failed
 * write (and the previous path returned a generic RLS_HINT even when INSERT
 * succeeded but RETURNING was hidden).
 */
async function upsertPreferenceRow(
  supabase: SupabaseClient,
  row: PreferenceWriteRow
): Promise<{ error: { message: string } | null }> {
  const result = await supabase
    .from("user_preferences")
    .upsert(row, { onConflict: "user_id" });

  return { error: result.error };
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
    const supabase = await createClient();
    const result = await fetchPreferenceRow(supabase, userId);
    if (result.error || !result.data) {
      return DEFAULT_USER_PREFERENCES;
    }
    return normalizePreferences(result.data);
  } catch {
    return DEFAULT_USER_PREFERENCES;
  }
}

type SaveOptions = {
  /** Reuse the API route's cookie-bound client so auth.uid() matches the JWT. */
  supabase?: SupabaseClient;
  /** Optional sanity check; the write always uses session user.id for user_id. */
  expectedUserId?: string;
};

/**
 * Persist preferences for the currently authenticated user.
 * `user_id` is ALWAYS taken from the cookie session (`auth.getUser()`), never
 * from the request body, so RLS `auth.uid() = user_id` can succeed.
 */
export async function saveUserPreferences(
  preferences: ContentRating,
  options?: SaveOptions
): Promise<
  | { success: true; preferences: ContentRating }
  | { success: false; error: string }
> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: "Supabase is not configured." };
  }

  const normalized = normalizePreferences(preferences);
  const supabase = options?.supabase ?? (await createClient());

  // Load the JWT session onto this client before any PostgREST write.
  // Without this, auth.uid() is null and INSERT/UPDATE WITH CHECK fails RLS.
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: NO_SESSION_HINT };
  }

  if (options?.expectedUserId && options.expectedUserId !== user.id) {
    return {
      success: false,
      error: "Signed-in user does not match the preferences being saved.",
    };
  }

  // Critical: RLS policies check auth.uid() = user_id. Use session id only.
  const sessionUserId = user.id;

  const profileResult = await ensureProfileExists(supabase, sessionUserId);
  if (!profileResult.ok) {
    return { success: false, error: profileResult.error };
  }

  const fullRow: PreferenceWriteRow = {
    user_id: sessionUserId,
    sexual_content: normalized.sexual_content,
    romance: normalized.romance,
    lgbt: normalized.lgbt,
    horror: normalized.horror,
    ideology: normalized.ideology,
    pacing: normalized.pacing,
  };

  let writeError = (await upsertPreferenceRow(supabase, fullRow)).error;

  if (writeError && isMissingRomanceColumn(writeError.message)) {
    // Keep other categories writable until the romance migration is applied.
    const { romance: _romance, ...legacyRow } = fullRow;
    writeError = (await upsertPreferenceRow(supabase, legacyRow)).error;
  }

  if (writeError) {
    return { success: false, error: formatPreferenceError(writeError.message) };
  }

  // Separate read-back: distinguishes "write failed" from "write ok, SELECT blocked".
  const verify = await fetchPreferenceRow(supabase, sessionUserId);
  if (verify.error) {
    return { success: false, error: formatPreferenceError(verify.error) };
  }
  if (!verify.data) {
    return { success: false, error: RLS_READBACK_HINT };
  }

  const confirmed = normalizePreferences(verify.data);
  revalidatePath("/preferences");
  revalidatePath("/browse");
  return { success: true, preferences: confirmed };
}

/** Resolve the cookie session once for API routes that also need the user. */
export async function getSessionUser(
  supabase?: SupabaseClient
): Promise<{ supabase: SupabaseClient; user: User } | { error: string }> {
  const client = supabase ?? (await createClient());
  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error || !user) {
    return { error: "Unauthorized." };
  }

  return { supabase: client, user };
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
