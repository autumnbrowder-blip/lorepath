import {
  calculateMatchScore,
  getMatchLabel,
  getMatchStyle,
} from "@/lib/match-score";
import type { CommunityRatingsSummary } from "@/lib/ratings";
import type { ContentRating } from "@/types";
import { Target } from "lucide-react";
import { CodexBoxOrnament } from "@/components/preferences/CodexBoxOrnament";
import { SignInPrompt } from "@/components/preferences/SignInPrompt";

type MatchScoreProps = {
  isLoggedIn: boolean;
  communityRatings: CommunityRatingsSummary;
  userPreferences: ContentRating | null;
};

function ScoreRing({
  score,
  ringClass,
  textClass,
}: {
  score: number;
  ringClass: string;
  textClass: string;
}) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative flex h-[92px] w-[92px] shrink-0 items-center justify-center">
      <svg
        className="-rotate-90"
        width="92"
        height="92"
        viewBox="0 0 92 92"
        aria-hidden="true"
      >
        <circle
          cx="46"
          cy="46"
          r={radius}
          fill="none"
          strokeWidth="7"
          className="stroke-forest-950/70"
        />
        <circle
          cx="46"
          cy="46"
          r={radius}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          className={`${ringClass} transition-all duration-700`}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span
        className={`absolute font-storybook text-xl font-bold leading-none tracking-tight tabular-nums sm:text-2xl ${textClass}`}
      >
        {score}%
      </span>
    </div>
  );
}

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
        <ScoreRing
          score={score}
          ringClass={style.ring}
          textClass={style.text}
        />
        <div className="min-w-0 space-y-2">
          <span
            className={`inline-flex rounded-sm border px-2.5 py-1 ${style.badge}`}
          >
            <span className="font-storybook text-sm font-bold tracking-wide nav-dragon-gold">
              {label}
            </span>
          </span>
          <p className="font-heading text-xs leading-snug nav-dragon-gold">
            Community ratings vs your preferences.
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {breakdown.map((item, index) => (
          <div
            key={item.label}
            className="rounded-sm border border-gold-600/25 bg-forest-950/40 px-2.5 py-2"
            style={{ animationDelay: `${index * 40}ms` }}
          >
            <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px]">
              <span className="truncate font-heading nav-dragon-gold">
                {item.label}
              </span>
              <span className="shrink-0 font-heading font-bold tabular-nums nav-dragon-gold">
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
