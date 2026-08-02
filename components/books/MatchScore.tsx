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
import { SignInPrompt } from "@/components/preferences/SignInPrompt";

type MatchScoreProps = {
  isLoggedIn: boolean;
  communityRatings: CommunityRatingsSummary;
  userPreferences: ContentRating | null;
};

function MatchScoreShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="preference-codex-box animate-fade-in-up relative flex h-auto flex-col self-start">
      <CodexBoxOrnament />
      <div className="relative z-[3] mb-3 flex items-center gap-2.5 px-0.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-gold-600/50 bg-gradient-to-br from-gold-500/30 to-transparent text-accent">
          <Target className="h-4 w-4" />
        </div>
        <h2 className="font-storybook text-base font-bold tracking-[0.1em] nav-dragon-gold sm:text-lg">
          Match Score
        </h2>
      </div>
      <div className="relative z-[3] flex flex-col gap-4 px-0.5">{children}</div>
    </section>
  );
}

export function MatchScore({
  isLoggedIn,
  communityRatings,
  userPreferences,
}: MatchScoreProps) {
  if (!isLoggedIn) {
    return (
      <MatchScoreShell>
        <SignInPrompt
          title="Sign in to see your Match Score"
          description="During Beta, Match Score is free for every account. Sign in to see how well books match your content preferences."
          compact
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
          Not enough community ratings yet to calculate a match score for this
          book. Check back once others have rated it.
        </p>
      </MatchScoreShell>
    );
  }

  if (!userPreferences) {
    return (
      <MatchScoreShell>
        <p className="font-heading text-xs leading-relaxed nav-dragon-gold">
          Set your preferences to unlock Match Score for this book.
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
      <div className="flex items-center gap-4">
        <MatchScorePercent score={score} size="compact" showLabel={false} />
        <div className="min-w-0 space-y-2">
          <span className={`match-score-badge ${style.badge}`}>
            <span className="match-score-badge-label">{label}</span>
          </span>
          <p className="font-heading text-xs leading-snug nav-dragon-gold">
            Community ratings vs your preferences.
          </p>
        </div>
      </div>

      <div className="space-y-2.5">
        {breakdown.map((item, index) => (
          <div
            key={item.label}
            className="codex-inset px-3 py-3"
            style={{ animationDelay: `${index * 45}ms` }}
          >
            <div className="mb-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-heading text-base font-semibold leading-snug nav-dragon-gold sm:text-lg">
                  {item.label}
                </p>
              </div>
              <span className="inline-flex shrink-0 flex-col items-end">
                <span className="font-storybook text-xl font-bold tabular-nums leading-none nav-dragon-gold sm:text-2xl">
                  {item.score}
                  <span className="text-[0.55em]" aria-hidden="true">
                    %
                  </span>
                </span>
                <span className="mt-0.5 font-heading text-xs nav-dragon-gold/80">
                  match
                </span>
              </span>
            </div>
            {/* Same track + gold fill as Marks of the Realm; width = category match % */}
            <div className="h-2.5 overflow-hidden rounded-sm border border-gold-600/25 bg-forest-950/70">
              <div
                className="h-full rounded-sm bg-gradient-to-r from-gold-700 via-gold-500 to-gold-300 transition-all duration-500"
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
