"use server";

import { DEFAULT_AVATAR_KEY } from "@/lib/avatars";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createAuthenticatedClient } from "@/lib/supabase/server";
import {
  isColumnMarkedMissing,
  isPermissionDeniedError,
  noteMissingColumnFromError,
} from "@/lib/supabase/schema-cache";
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
 * Uses a PostgREST client that sends the user JWT so auth.uid() matches.
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
    const auth = await createAuthenticatedClient();
    if ("error" in auth) {
      return { ok: false, error: "You must be signed in to update your name." };
    }

    const { supabase, user } = auth;

    // Prefer update (existing row). verify with select + eq user id.
    const { data: updated, error: updateError } = await supabase
      .from("profiles")
      .update({ display_name: nextName })
      .eq("id", user.id)
      .select("display_name")
      .maybeSingle();

    if (updateError) {
      const msg = updateError.message || "Failed to save display name.";
      if (isPermissionDeniedError(msg, updateError.code)) {
        return { ok: false, error: RLS_HINT };
      }
      return { ok: false, error: isRlsError(msg) ? RLS_HINT : msg };
    }

    if (updated) {
      const confirmed =
        typeof updated.display_name === "string"
          ? updated.display_name.trim() || null
          : updated.display_name ?? null;
      revalidatePath("/profile");
      return { ok: true, displayName: confirmed ?? nextName };
    }

    if (isColumnMarkedMissing("profiles", "avatar_key")) {
      const { data: upserted, error: upsertError } = await supabase
        .from("profiles")
        .upsert(
          { id: user.id, display_name: nextName },
          { onConflict: "id" }
        )
        .select("display_name")
        .maybeSingle();

      if (upsertError) {
        const msg = upsertError.message || "Failed to save display name.";
        if (isPermissionDeniedError(msg, upsertError.code)) {
          return { ok: false, error: RLS_HINT };
        }
        return { ok: false, error: isRlsError(msg) ? RLS_HINT : msg };
      }

      if (!upserted) {
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
    }

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
      if (noteMissingColumnFromError("profiles", "avatar_key", msg)) {
        return {
          ok: false,
          error:
            "Could not save because profiles.avatar_key is missing. Run the avatar_key migration, then try again.",
        };
      }
      if (isPermissionDeniedError(msg, upsertError.code)) {
        return { ok: false, error: RLS_HINT };
      }
      return { ok: false, error: isRlsError(msg) ? RLS_HINT : msg };
    }

    if (!upserted) {
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
