import {
  calculateMatchScore,
  getMatchLabel,
  getMatchStyle,
} from "@/lib/match-score";
import type { CommunityRatingsSummary } from "@/lib/ratings";
import type { ContentRating } from "@/types";
import { Target } from "lucide-react";
import { CodexBoxOrnament } from "@/components/preferences/CodexBoxOrnament";
import { UpgradePrompt } from "@/components/preferences/UpgradePrompt";

type MatchScoreProps = {
  hasPremiumAccess: boolean;
  isLoggedIn: boolean;
  communityRatings: CommunityRatingsSummary;
  userPreferences: ContentRating | null;
};

function ScoreRing({ score, ringClass }: { score: number; ringClass: string }) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative flex h-[72px] w-[72px] shrink-0 items-center justify-center">
      <svg
        className="-rotate-90"
        width="72"
        height="72"
        viewBox="0 0 72 72"
        aria-hidden="true"
      >
        <circle
          cx="36"
          cy="36"
          r={radius}
          fill="none"
          strokeWidth="6"
          className="stroke-forest-950/70"
        />
        <circle
          cx="36"
          cy="36"
          r={radius}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          className={`${ringClass} transition-all duration-700`}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute font-storybook text-lg font-bold tabular-nums nav-dragon-gold">
        {score}%
      </span>
    </div>
  );
}

function MatchScoreShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="preference-codex-box animate-fade-in-up relative flex h-auto flex-col self-start">
      <CodexBoxOrnament />
      <div className="relative z-[3] mb-2 flex items-center gap-2 px-0.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-sm border border-gold-600/50 bg-gradient-to-br from-gold-500/30 to-transparent text-accent">
          <Target className="h-3.5 w-3.5" />
        </div>
        <div>
          <h2 className="font-storybook text-sm font-bold tracking-[0.1em] nav-dragon-gold sm:text-base">
            Match Score
          </h2>
          <p className="font-heading text-[11px] nav-dragon-gold">
            Fits your preferences
          </p>
        </div>
      </div>
      <div className="relative z-[3] flex flex-col px-0.5">{children}</div>
    </section>
  );
}

export function MatchScore({
  hasPremiumAccess,
  isLoggedIn,
  communityRatings,
  userPreferences,
}: MatchScoreProps) {
  if (!isLoggedIn) {
    return (
      <MatchScoreShell>
        <UpgradePrompt
          title="Sign in to see your Match Score"
          description="Create an account to start your 14-day trial and see how well books match your content preferences."
          compact
        />
      </MatchScoreShell>
    );
  }

  if (!hasPremiumAccess) {
    return (
      <MatchScoreShell>
        <UpgradePrompt compact />
      </MatchScoreShell>
    );
  }

  const hasCommunityData =
    communityRatings.count > 0 && communityRatings.averages !== null;

  if (!hasCommunityData) {
    return (
      <MatchScoreShell>
        <p className="font-heading text-xs leading-snug nav-dragon-gold">
          Not enough community ratings yet to calculate a match score for this
          book. Check back once others have rated it.
        </p>
      </MatchScoreShell>
    );
  }

  const prefs = userPreferences!;
  const { score, breakdown } = calculateMatchScore(
    communityRatings.averages!,
    prefs
  );
  const label = getMatchLabel(score);
  const style = getMatchStyle(score);

  return (
    <MatchScoreShell>
      <div className="mb-3 flex items-center gap-3">
        <ScoreRing score={score} ringClass={style.ring} />
        <div className="min-w-0">
          <span
            className={`inline-flex rounded-sm border px-2.5 py-0.5 font-storybook text-xs font-bold tracking-wide ${style.badge}`}
          >
            {label}
          </span>
          <p className="mt-1.5 font-heading text-xs leading-snug nav-dragon-gold">
            Community ratings vs your preferences.
          </p>
        </div>
      </div>

      <div className="grid gap-1.5 sm:grid-cols-2">
        {breakdown.map((item, index) => (
          <div
            key={item.label}
            className="rounded-sm border border-gold-600/25 bg-forest-950/40 px-2 py-1.5"
            style={{ animationDelay: `${index * 40}ms` }}
          >
            <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
              <span className="truncate font-heading nav-dragon-gold">
                {item.label}
              </span>
              <span className={`font-bold tabular-nums ${style.text}`}>
                {item.score}%
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-sm border border-gold-600/20 bg-forest-950/65">
              <div
                className={`h-full rounded-sm ${style.bar}`}
                style={{ width: `${item.score}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </MatchScoreShell>
  );
}
