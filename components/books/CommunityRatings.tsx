import type { ContentRating } from "@/types";
import { BarChart3, Users } from "lucide-react";
import { CodexBoxOrnament } from "@/components/preferences/CodexBoxOrnament";
import {
  PREFERENCE_CATEGORIES,
  RATING_CATEGORIES,
} from "@/lib/rating-categories";
import type { CommunityRatingsSummary } from "@/lib/ratings";

type CommunityRatingsProps = {
  data: CommunityRatingsSummary;
};

type PreferenceLevel = 0 | 1 | 2 | 3 | 4 | 5;

function withoutQuotes(text: string): string {
  return text.replace(/["“”]/g, "");
}

function preferenceFor(key: keyof ContentRating) {
  return PREFERENCE_CATEGORIES.find((item) => item.key === key);
}

function nearestLevel(value: number): PreferenceLevel {
  return Math.min(5, Math.max(0, Math.round(value))) as PreferenceLevel;
}

function levelBlurb(
  key: keyof ContentRating,
  value: number
): string | undefined {
  const preference = preferenceFor(key);
  const level = nearestLevel(value);
  const text = preference?.levelDescriptions?.[level];
  return text ? withoutQuotes(text) : undefined;
}

function RatingBar({
  categoryKey,
  label,
  value,
  index,
}: {
  categoryKey: keyof ContentRating;
  label: string;
  value: number | null;
  index: number;
}) {
  const displayValue = value ?? null;
  const width = displayValue !== null ? `${(displayValue / 5) * 100}%` : "0%";
  const blurb =
    displayValue !== null ? levelBlurb(categoryKey, displayValue) : undefined;

  return (
    <div
      className="codex-inset px-2.5 py-2"
      style={{ animationDelay: `${index * 45}ms` }}
    >
      <div className="mb-1.5 flex items-start justify-between gap-2.5">
        <div className="min-w-0">
          <p className="font-heading text-sm font-semibold leading-snug nav-dragon-gold sm:text-base">
            {label}
          </p>
          {blurb ? (
            <p className="mt-0.5 line-clamp-2 font-heading text-xs leading-snug tracking-wide text-[#e2c06a]/85 sm:text-sm">
              {blurb}
            </p>
          ) : null}
        </div>
        <span className="inline-flex shrink-0 flex-col items-end">
          <span className="font-storybook text-lg font-bold tabular-nums leading-none nav-dragon-gold sm:text-xl">
            {displayValue !== null ? displayValue.toFixed(1) : "—"}
          </span>
          <span className="mt-0.5 font-heading text-[11px] nav-dragon-gold/80">
            out of 5
          </span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-sm border border-gold-600/25 bg-forest-950/70">
        <div
          className="h-full rounded-sm bg-gradient-to-r from-gold-700 via-gold-500 to-gold-300 transition-all duration-500"
          style={{ width }}
        />
      </div>
    </div>
  );
}

export function CommunityRatings({ data }: CommunityRatingsProps) {
  const { averages, count } = data;
  const hasRatings = count > 0 && averages !== null;

  return (
    <section
      aria-labelledby="community-ratings-heading"
      className="preference-codex-box animate-fade-in-up relative flex h-auto flex-col self-start"
      style={{ animationDelay: "100ms" }}
    >
      <CodexBoxOrnament />
      <div className="relative z-[3] mb-2 flex items-center gap-2.5 px-0.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-gold-600/50 bg-gradient-to-br from-gold-500/30 to-transparent text-accent">
          <BarChart3 className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h2
            id="community-ratings-heading"
            className="font-storybook text-base font-bold tracking-[0.1em] nav-dragon-gold sm:text-lg"
          >
            Marks of the Realm
          </h2>
          <p className="font-heading text-sm nav-dragon-gold">
            {hasRatings ? (
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-accent" />
                {count} rating{count !== 1 ? "s" : ""} across categories
              </span>
            ) : (
              "Marks left by readers of this tome"
            )}
          </p>
        </div>
      </div>

      <div className="relative z-[3] px-0.5">
        {!hasRatings && (
          <div className="mb-2 codex-inset border-dashed px-2.5 py-2">
            <p className="font-heading text-sm leading-snug nav-dragon-gold">
              No community marks yet — be the first to inscribe this tome.
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          {RATING_CATEGORIES.map((category, index) => {
            const preference = preferenceFor(category.key);
            return (
              <RatingBar
                key={category.key}
                categoryKey={category.key}
                label={preference?.label ?? category.label}
                value={hasRatings ? averages[category.key] : null}
                index={index}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}
