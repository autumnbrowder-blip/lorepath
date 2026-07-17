import { DEFAULT_AVATAR_KEY } from "@/lib/avatars";
import { DEFAULT_USER_PREFERENCES } from "@/lib/rating-categories";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  createAuthenticatedClient,
  createClient,
} from "@/lib/supabase/server";
import type { ContentRating } from "@/types";
import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import type { PostgrestError, SupabaseClient, User } from "@supabase/supabase-js";

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

function isForeignKeyError(message: string, code?: string): boolean {
  return (
    code === "23503" ||
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

function isRlsError(message: string, code?: string): boolean {
  return (
    code === "42501" ||
    /row-level security/i.test(message) ||
    /violates row-level security/i.test(message) ||
    /42501/.test(message) ||
    (/permission denied/i.test(message) && !isGrantError(message))
  );
}

function supabaseErrorDetail(
  error: { message: string; code?: string; details?: string | null } | string
): string {
  if (typeof error === "string") return error;
  const parts = [
    error.code ? `code=${error.code}` : null,
    error.message || null,
    error.details ? `details=${error.details}` : null,
  ].filter(Boolean);
  return parts.join(" | ") || "Unknown Supabase error";
}

function formatPreferenceError(
  error: { message: string; code?: string; details?: string | null } | string
): string {
  const message = typeof error === "string" ? error : error.message;
  const code = typeof error === "string" ? undefined : error.code;
  const detail = supabaseErrorDetail(error);

  if (isMissingRomanceColumn(message)) return ROMANCE_MIGRATION_HINT;
  if (isForeignKeyError(message, code)) return FK_HINT;
  if (isGrantError(message)) return `${GRANT_HINT} (${detail})`;
  if (isRlsError(message, code)) return `${RLS_WRITE_HINT} (${detail})`;
  return detail || "Failed to save preferences.";
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
  | { data: null; error: PostgrestError | { message: string; code?: string } | null }
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
      return { data: null, error: legacy.error };
    }

    return {
      data: legacy.data
        ? ({ ...legacy.data, romance: DEFAULT_USER_PREFERENCES.romance } as PreferenceRow)
        : null,
      error: null,
    };
  }

  return { data: null, error: primary.error };
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
    return { ok: false, error: formatPreferenceError(profileError) };
  }

  if (profile) return { ok: true };

  const { error: upsertError } = await supabase.from("profiles").upsert(
    { id: userId, avatar_key: DEFAULT_AVATAR_KEY },
    { onConflict: "id" }
  );

  if (upsertError) {
    return { ok: false, error: formatPreferenceError(upsertError) };
  }

  const { data: created, error: verifyError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (verifyError) {
    return { ok: false, error: formatPreferenceError(verifyError) };
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
): Promise<{ error: PostgrestError | null }> {
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
    // Prefer JWT-scoped client so SELECT RLS (auth.uid() = user_id) succeeds.
    const auth = await createAuthenticatedClient();
    const supabase = "error" in auth ? await createClient() : auth.supabase;
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
  /** Reuse an already JWT-scoped client so auth.uid() matches the write. */
  supabase?: SupabaseClient;
  /** Optional sanity check; the write always uses session user.id for user_id. */
  expectedUserId?: string;
  /** Browser-supplied access token (Authorization Bearer) — preferred on Netlify. */
  accessToken?: string | null;
};

/**
 * Persist preferences for the currently authenticated user.
 * `user_id` is ALWAYS taken from the verified JWT user, never from the body.
 */
export async function saveUserPreferences(
  preferences: ContentRating,
  options?: SaveOptions
): Promise<
  | { success: true; preferences: ContentRating }
  | { success: false; error: string; supabaseCode?: string; supabaseMessage?: string }
> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: "Supabase is not configured." };
  }

  const normalized = normalizePreferences(preferences);

  let supabase: SupabaseClient;
  let sessionUserId: string;

  if (options?.supabase && options?.expectedUserId) {
    // Caller already built a JWT-scoped client (API route path).
    supabase = options.supabase;
    sessionUserId = options.expectedUserId;
  } else {
    const auth = await createAuthenticatedClient({
      accessToken: options?.accessToken,
    });
    if ("error" in auth) {
      return {
        success: false,
        error: auth.error === "Unauthorized." ? NO_SESSION_HINT : auth.error,
        supabaseCode: auth.code,
      };
    }
    supabase = auth.supabase;
    sessionUserId = auth.user.id;

    if (options?.expectedUserId && options.expectedUserId !== sessionUserId) {
      return {
        success: false,
        error: "Signed-in user does not match the preferences being saved.",
      };
    }
  }

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
    return {
      success: false,
      error: formatPreferenceError(writeError),
      supabaseCode: writeError.code,
      supabaseMessage: writeError.message,
    };
  }

  // Separate read-back: distinguishes "write failed" from "write ok, SELECT blocked".
  const verify = await fetchPreferenceRow(supabase, sessionUserId);
  if (verify.error) {
    return {
      success: false,
      error: formatPreferenceError(verify.error),
      supabaseCode: verify.error.code,
      supabaseMessage: verify.error.message,
    };
  }
  if (!verify.data) {
    return { success: false, error: RLS_READBACK_HINT };
  }

  const confirmed = normalizePreferences(verify.data);
  revalidatePath("/preferences");
  revalidatePath("/browse");
  return { success: true, preferences: confirmed };
}

/** Resolve a JWT-scoped client + user for API routes that also need writes. */
export async function getSessionUser(options?: {
  accessToken?: string | null;
}): Promise<
  | { supabase: SupabaseClient; user: User; accessToken: string }
  | { error: string; code?: string }
> {
  const auth = await createAuthenticatedClient({
    accessToken: options?.accessToken,
  });

  if ("error" in auth) {
    return { error: auth.error, code: auth.code };
  }

  return auth;
}

export async function getUserProfile(userId: string) {
  if (!isSupabaseConfigured()) return null;

  const auth = await createAuthenticatedClient();
  const supabase = "error" in auth ? await createClient() : auth.supabase;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, is_subscriber, created_at")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}
