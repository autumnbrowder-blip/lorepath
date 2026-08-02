import { CodexBoxOrnament } from "@/components/preferences/CodexBoxOrnament";

type MatchScorePercentProps = {
  score: number;
  /** Show the “Match Score” eyebrow above the percentage. */
  showLabel?: boolean;
  /** Optional supporting line under the percentage. */
  caption?: string;
  /** `compact` for the book-page seal; `default` for onboarding success. */
  size?: "default" | "compact";
  className?: string;
};

/**
 * Shared Match Score percentage plaque — deep forest + antique gold,
 * storybook inscription. Used on book pages and first-rating success.
 */
export function MatchScorePercent({
  score,
  showLabel = true,
  caption,
  size = "default",
  className = "",
}: MatchScorePercentProps) {
  const isCompact = size === "compact";

  return (
    <div
      className={`match-score-percent match-score-percent--${size}${
        className ? ` ${className}` : ""
      }`}
      aria-label={`Match Score ${score} percent`}
    >
      {!isCompact ? <CodexBoxOrnament /> : null}
      <div className="match-score-percent__inner">
        {showLabel ? (
          <p className="match-score-percent__label">Match Score</p>
        ) : null}
        <p className="match-score-percent__value">
          <span className="match-score-percent__digits tabular-nums">
            {score}
          </span>
          <span className="match-score-percent__suffix" aria-hidden="true">
            %
          </span>
        </p>
        {caption ? (
          <p className="match-score-percent__caption">{caption}</p>
        ) : null}
      </div>
    </div>
  );
}
