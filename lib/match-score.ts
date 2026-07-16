import { PREFERENCE_CATEGORIES } from "@/lib/rating-categories";
import type { ContentRating } from "@/types";

function categoryMatchScore(
  bookAverage: number,
  userPreference: number,
  type: "max" | "preferred"
): number {
  if (type === "max") {
    if (bookAverage <= userPreference) return 100;
    const over = bookAverage - userPreference;
    return Math.max(0, 100 - (over / 5) * 100);
  }

  const diff = Math.abs(bookAverage - userPreference);
  return Math.max(0, 100 - (diff / 5) * 100);
}

export type MatchScoreResult = {
  score: number;
  breakdown: { label: string; score: number }[];
};

export function calculateMatchScore(
  bookAverages: ContentRating,
  userPreferences: ContentRating
): MatchScoreResult {
  const breakdown = PREFERENCE_CATEGORIES.map((category) => ({
    label: category.label,
    score: Math.round(
      categoryMatchScore(
        bookAverages[category.key],
        userPreferences[category.key],
        category.type
      )
    ),
  }));

  const score = Math.round(
    breakdown.reduce((sum, item) => sum + item.score, 0) / breakdown.length
  );

  return { score, breakdown };
}

export function getMatchLabel(score: number): string {
  if (score >= 90) return "Excellent match";
  if (score >= 75) return "Good match";
  if (score >= 50) return "Moderate match";
  if (score >= 25) return "Weak match";
  return "Poor match";
}

export function getMatchStyle(score: number): {
  ring: string;
  text: string;
  bar: string;
  badge: string;
  gradient: string;
} {
  if (score >= 90) {
    return {
      ring: "stroke-gold-500",
      text: "text-gold-700 dark:text-gold-300",
      bar: "bg-gradient-to-r from-gold-500 to-gold-300",
      badge:
        "border-gold-300 bg-gold-50 text-gold-800 dark:border-gold-700/50 dark:bg-gold-950/40 dark:text-gold-200",
      gradient:
        "from-gold-50/80 via-surface-elevated to-gold-100/50 dark:from-gold-950/20 dark:via-forest-950 dark:to-gold-950/10",
    };
  }
  if (score >= 75) {
    return {
      ring: "stroke-forest-500",
      text: "text-forest-700 dark:text-forest-300",
      bar: "bg-gradient-to-r from-forest-600 to-forest-400",
      badge:
        "border-forest-300 bg-forest-50 text-forest-800 dark:border-forest-700/50 dark:bg-forest-950/40 dark:text-forest-200",
      gradient:
        "from-forest-50/80 via-surface-elevated to-forest-100/50 dark:from-forest-950/20 dark:via-forest-950 dark:to-forest-900/10",
    };
  }
  if (score >= 50) {
    return {
      ring: "stroke-gold-600",
      text: "text-gold-800 dark:text-gold-400",
      bar: "bg-gradient-to-r from-gold-600 to-gold-400",
      badge:
        "border-gold-400 bg-gold-100 text-gold-900 dark:border-gold-800/50 dark:bg-gold-950/30 dark:text-gold-300",
      gradient:
        "from-gold-100/80 via-surface-elevated to-gold-50/50 dark:from-gold-950/15 dark:via-forest-950 dark:to-gold-950/10",
    };
  }
  return {
    ring: "stroke-gold-800",
    text: "text-gold-900 dark:text-gold-500",
    bar: "bg-gradient-to-r from-gold-800 to-gold-600",
    badge:
      "border-gold-500 bg-gold-200/60 text-gold-950 dark:border-gold-800 dark:bg-gold-950/50 dark:text-gold-400",
    gradient:
      "from-gold-200/60 via-surface-elevated to-gold-100/40 dark:from-gold-950/25 dark:via-forest-950 dark:to-gold-950/15",
  };
}
