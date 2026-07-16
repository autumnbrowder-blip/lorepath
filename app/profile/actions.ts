"use server";

import { DEFAULT_AVATAR_KEY } from "@/lib/avatars";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const MAX_DISPLAY_NAME_LENGTH = 60;

export type UpdateDisplayNameResult =
  | { ok: true; displayName: string | null }
  | { ok: false; error: string };

function normalizeDisplayName(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isRlsError(message: string): boolean {
  return (
    /row-level security/i.test(message) ||
    /permission denied/i.test(message) ||
    /42501/.test(message) ||
    /violates row-level security/i.test(message)
  );
}

const RLS_HINT =
  "Could not update your profile (RLS blocked the write). Paste and run the SQL from supabase/migrations/20260715_profiles_display_name_rls.sql in the Supabase SQL Editor, then try again.";

/**
 * Persist profiles.display_name for the signed-in user.
 * Uses the cookie session on the server so auth.uid() matches the row id.
 */
export async function updateDisplayNameAction(
  rawName: string
): Promise<UpdateDisplayNameResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured." };
  }

  if (typeof rawName !== "string") {
    return { ok: false, error: "Invalid display name." };
  }

  if (rawName.trim().length > MAX_DISPLAY_NAME_LENGTH) {
    return {
      ok: false,
      error: `Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.`,
    };
  }

  const nextName = normalizeDisplayName(rawName);

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { ok: false, error: "You must be signed in to update your name." };
    }

    // Prefer update (existing row). verify with select + eq user id.
    const { data: updated, error: updateError } = await supabase
      .from("profiles")
      .update({ display_name: nextName })
      .eq("id", user.id)
      .select("display_name")
      .maybeSingle();

    if (updateError) {
      const msg = updateError.message || "Failed to save display name.";
      return {
        ok: false,
        error: isRlsError(msg) ? RLS_HINT : msg,
      };
    }

    if (updated) {
      const confirmed =
        typeof updated.display_name === "string"
          ? updated.display_name.trim() || null
          : updated.display_name ?? null;
      revalidatePath("/profile");
      return { ok: true, displayName: confirmed ?? nextName };
    }

    // No row returned — missing profile or RLS hid the update. Upsert own row.
    const { data: upserted, error: upsertError } = await supabase
      .from("profiles")
      .upsert(
        {
          id: user.id,
          display_name: nextName,
          avatar_key: DEFAULT_AVATAR_KEY,
        },
        { onConflict: "id" }
      )
      .select("display_name")
      .maybeSingle();

    if (upsertError) {
      const msg = upsertError.message || "Failed to save display name.";
      return {
        ok: false,
        error: isRlsError(msg) ? RLS_HINT : msg,
      };
    }

    if (!upserted) {
      // Last check: can we read a row at all?
      const { data: existing } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();

      if (existing) {
        return { ok: false, error: RLS_HINT };
      }

      return {
        ok: false,
        error: "No profile row could be created for your account.",
      };
    }

    const confirmed =
      typeof upserted.display_name === "string"
        ? upserted.display_name.trim() || null
        : upserted.display_name ?? null;

    revalidatePath("/profile");
    return { ok: true, displayName: confirmed ?? nextName };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "Failed to save display name.",
    };
  }
}
