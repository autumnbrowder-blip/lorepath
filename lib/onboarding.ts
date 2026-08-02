import {
  createAuthenticatedClient,
  createClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
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
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("onboarding_match_score_seen")
      .eq("id", userId)
      .maybeSingle();

    if (error || !data) return false;
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

  try {
    const admin = createServiceRoleClient();
    const auth = await createAuthenticatedClient();
    const supabase =
      "error" in admin
        ? "error" in auth
          ? await createClient()
          : auth.supabase
        : admin.supabase;

    await supabase
      .from("profiles")
      .update({ onboarding_match_score_seen: true })
      .eq("id", userId);
  } catch {
    // Soft-fail — checklist still works from live matchScore on this visit.
  }
}
