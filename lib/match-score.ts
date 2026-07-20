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
      text: "nav-dragon-gold",
      bar: "bg-gradient-to-r from-gold-500 to-gold-300",
      // Tier modifier for .match-score-badge (globals.css) — antique gold / deep green only
      badge: "match-score-badge--excellent",
      gradient: "from-gold-950/20 via-forest-950 to-gold-950/10",
    };
  }
  if (score >= 75) {
    return {
      ring: "stroke-forest-500",
      text: "nav-dragon-gold",
      bar: "bg-gradient-to-r from-forest-600 to-forest-400",
      badge: "match-score-badge--good",
      gradient: "from-forest-950/20 via-forest-950 to-forest-900/10",
    };
  }
  if (score >= 50) {
    return {
      ring: "stroke-gold-600",
      text: "nav-dragon-gold",
      bar: "bg-gradient-to-r from-gold-600 to-gold-400",
      badge: "match-score-badge--moderate",
      gradient: "from-gold-950/15 via-forest-950 to-gold-950/10",
    };
  }
  return {
    ring: "stroke-gold-800",
    text: "nav-dragon-gold",
    bar: "bg-gradient-to-r from-gold-800 to-gold-600",
    badge: "match-score-badge--weak",
    gradient: "from-gold-950/25 via-forest-950 to-gold-950/15",
  };
}
