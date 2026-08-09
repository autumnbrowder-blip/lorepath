/**
 * New-user path guide shown on Profile (full) and Preferences (short).
 * Driven by real preference + rating data; celebration dismiss is client-only.
 */

export type OnboardingGuideState =
  | "begin-path"
  | "first-rating"
  | "celebration";

export type OnboardingGuideVariant = "full" | "short";

export const FIRST_RATING_CELEBRATION_BODY =
  "Your first mark has been recorded in the archives. One more path made clearer by your rating.";

export const ONBOARDING_GUIDE_COPY = {
  "begin-path": {
    title: "Begin Your Path",
    body: {
      full: "Start by setting your preferences, then inscribe your first rating.",
      short:
        "Set your Preference Codex below, then open a tome and leave your first marks.",
    },
  },
  "first-rating": {
    title: "Inscribe Your First Rating",
    body: {
      full: "Your preferences are set. Next, open a tome and leave your first marks.",
      short: "Your preferences are set. Open a tome and leave your first marks.",
    },
  },
  celebration: {
    title: "First mark recorded",
    body: {
      full: FIRST_RATING_CELEBRATION_BODY,
      short: FIRST_RATING_CELEBRATION_BODY,
    },
  },
} as const;

export function celebrationDismissStorageKey(userId: string): string {
  return `lorepath-onboarding-celebration-dismissed:${userId}`;
}

/**
 * Resolve which guide card to show.
 * - 0 ratings always yields begin-path or first-rating (never celebration).
 * - Celebration only when the reader has ≥1 rating and has not dismissed it.
 */
export function resolveOnboardingGuideState(input: {
  hasPreferences: boolean;
  ratingCount: number;
  celebrationDismissed: boolean;
}): OnboardingGuideState | null {
  if (input.ratingCount < 1) {
    return input.hasPreferences ? "first-rating" : "begin-path";
  }
  if (input.celebrationDismissed) {
    return null;
  }
  return "celebration";
}
