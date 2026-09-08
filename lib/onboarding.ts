import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  createServiceRoleClient,
  createAuthenticatedClient,
} from "@/lib/supabase/server";
import {
  isColumnMarkedMissing,
  noteMissingColumnFromError,
} from "@/lib/supabase/schema-cache";
import type { ContentRating } from "@/types";

export type OnboardingProgress = {
  hasAccount: boolean;
  hasPreferences: boolean;
  hasRated: boolean;
  hasSeenMatchScore: boolean;
};

export function getOnboardingProgress(input: {
  isLoggedIn: boolean;
  preferences: ContentRating | null;
  ratingCount: number;
  /** True when a Match Score % was shown (or previously persisted). */
  hasSeenMatchScore: boolean;
}): OnboardingProgress {
  return {
    hasAccount: input.isLoggedIn,
    hasPreferences: input.preferences !== null,
    hasRated: input.ratingCount >= 1,
    hasSeenMatchScore: input.hasSeenMatchScore,
  };
}

export function isOnboardingComplete(progress: OnboardingProgress): boolean {
  return (
    progress.hasAccount &&
    progress.hasPreferences &&
    progress.hasRated &&
    progress.hasSeenMatchScore
  );
}

/**
 * Read profiles.onboarding_match_score_seen. Soft-fails to false if the column
 * is missing or the read errors (migration not applied yet).
 */
export async function getOnboardingMatchScoreSeen(
  userId: string
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  try {
    const admin = createServiceRoleClient();
    const auth =
      "error" in admin ? await createAuthenticatedClient() : null;
    const supabase =
      !("error" in admin)
        ? admin.supabase
        : auth && !("error" in auth)
          ? auth.supabase
          : null;
    if (!supabase) return false;

    if (isColumnMarkedMissing("profiles", "onboarding_match_score_seen")) {
      return false;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("onboarding_match_score_seen")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      noteMissingColumnFromError(
        "profiles",
        "onboarding_match_score_seen",
        error.message
      );
      return false;
    }
    if (!data) return false;
    return Boolean(
      (data as { onboarding_match_score_seen?: boolean | null })
        .onboarding_match_score_seen
    );
  } catch {
    return false;
  }
}

/**
 * Persist that the reader has seen a Match Score %. Soft-fails if the column
 * is missing (migration not applied yet).
 */
export async function markOnboardingMatchScoreSeen(
  userId: string
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  if (isColumnMarkedMissing("profiles", "onboarding_match_score_seen")) {
    return;
  }

  try {
    const admin = createServiceRoleClient();
    const auth =
      "error" in admin ? await createAuthenticatedClient() : null;
    const supabase =
      !("error" in admin)
        ? admin.supabase
        : auth && !("error" in auth)
          ? auth.supabase
          : null;
    // No session and no service role — do not write with the anon key.
    if (!supabase) return;

    const { error } = await supabase
      .from("profiles")
      .update({ onboarding_match_score_seen: true })
      .eq("id", userId);

    if (error) {
      noteMissingColumnFromError(
        "profiles",
        "onboarding_match_score_seen",
        error.message
      );
    }
  } catch {
    // Soft-fail — checklist still works from live matchScore on this visit.
  }
}
