import {
  calculateMatchScore,
  getMatchLabel,
  getMatchStyle,
} from "@/lib/match-score";
import type { CommunityRatingsSummary } from "@/lib/ratings";
import type { ContentRating } from "@/types";
import { Target } from "lucide-react";
import { CodexBoxOrnament } from "@/components/preferences/CodexBoxOrnament";
import { MatchScorePercent } from "@/components/books/MatchScorePercent";
import { SignupPrompt } from "@/components/auth/SignupPrompt";

type MatchScoreProps = {
  isLoggedIn: boolean;
  communityRatings: CommunityRatingsSummary;
  userPreferences: ContentRating | null;
  /** Current book path for post-signup return. */
  redirectTo?: string;
};

function MatchScoreShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="preference-codex-box animate-fade-in-up relative flex h-auto flex-col self-start">
      <CodexBoxOrnament />
      <div className="relative z-[3] mb-2 flex items-center gap-2.5 px-0.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-gold-600/50 bg-gradient-to-br from-gold-500/30 to-transparent text-accent">
          <Target className="h-4 w-4" />
        </div>
        <h2 className="font-storybook text-base font-bold tracking-[0.1em] nav-dragon-gold sm:text-lg">
          Match Score
        </h2>
      </div>
      <div className="relative z-[3] flex flex-col gap-2.5 px-0.5">{children}</div>
    </section>
  );
}

export function MatchScore({
  isLoggedIn,
  communityRatings,
  userPreferences,
  redirectTo,
}: MatchScoreProps) {
  if (!isLoggedIn) {
    return (
      <MatchScoreShell>
        <SignupPrompt
          redirectTo={redirectTo}
          variant="compact"
          description="Create a free account to see Match Scores on books the community has marked — once you’ve set your preferences."
        />
      </MatchScoreShell>
    );
  }

  const hasCommunityData =
    communityRatings.count > 0 && communityRatings.averages !== null;

  if (!hasCommunityData) {
    return (
      <MatchScoreShell>
        <p className="font-heading text-xs leading-relaxed nav-dragon-gold">
          No community marks yet — be the first to inscribe this tome.
        </p>
        <p className="font-heading text-xs leading-relaxed text-[#e2c06a]/85">
          Match Scores appear once a book has community marks and you’ve set
          your preferences.
        </p>
      </MatchScoreShell>
    );
  }

  if (!userPreferences) {
    return (
      <MatchScoreShell>
        <p className="font-heading text-xs leading-relaxed nav-dragon-gold">
          Set your preferences to reveal the Match Score for this marked tome.
        </p>
      </MatchScoreShell>
    );
  }

  const { score, breakdown } = calculateMatchScore(
    communityRatings.averages!,
    userPreferences
  );
  const label = getMatchLabel(score);
  const style = getMatchStyle(score);

  return (
    <MatchScoreShell>
      <div className="flex items-center gap-3">
        <MatchScorePercent score={score} size="compact" showLabel={false} />
        <div className="min-w-0 space-y-1.5">
          <span className={`match-score-badge ${style.badge}`}>
            <span className="match-score-badge-label">{label}</span>
          </span>
          <p className="font-heading text-[0.8125rem] leading-snug nav-dragon-gold">
            Community ratings vs your preferences.
          </p>
        </div>
      </div>

      {/* Compact rows: thin gold fill tracks; labels/values bumped for readability */}
      <div className="grid gap-1.5 sm:grid-cols-2">
        {breakdown.map((item) => (
          <div key={item.label} className="min-w-0">
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="truncate font-heading text-[0.8125rem] font-medium leading-tight nav-dragon-gold sm:text-sm">
                {item.label}
              </span>
              <span className="shrink-0 font-heading text-[0.8125rem] font-bold tabular-nums leading-tight nav-dragon-gold sm:text-sm">
                {item.score}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-sm border border-gold-600/25 bg-forest-950/70">
              <div
                className="h-full rounded-sm bg-gradient-to-r from-gold-700 via-gold-500 to-gold-300 transition-[width] duration-500"
                style={{ width: `${item.score}%` }}
                role="progressbar"
                aria-valuenow={item.score}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${item.label} match ${item.score} percent`}
              />
            </div>
          </div>
        ))}
      </div>
    </MatchScoreShell>
  );
}
