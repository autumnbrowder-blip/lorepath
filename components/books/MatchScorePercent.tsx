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
 * Shared Match Score percentage — Preference Codex emerald glass + antique gold
 * framing with nav-dragon-gold type. Used on book pages and first-rating success.
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
      className={
        isCompact
          ? `relative flex h-[5.75rem] w-[5.75rem] min-h-[5.75rem] min-w-[5.75rem] shrink-0 flex-col items-center justify-center rounded-sm border border-gold-600/35 bg-[#184033]/50 p-1.5 shadow-[inset_0_1px_0_rgba(255,230,150,0.08)] sm:h-24 sm:w-24 sm:min-h-24 sm:min-w-24${
              className ? ` ${className}` : ""
            }`
          : `preference-codex-box relative mx-auto flex min-h-[8.5rem] w-full max-w-xs flex-col items-center justify-center${
              className ? ` ${className}` : ""
            }`
      }
      style={
        isCompact
          ? undefined
          : {
              /* Translucent emerald glass — same #184033 as BookMetadataItem / codex greens */
              background:
                "linear-gradient(155deg, rgba(31, 81, 61, 0.52) 0%, rgba(24, 64, 51, 0.5) 34%, rgba(18, 50, 41, 0.55) 68%, rgba(12, 36, 28, 0.58) 100%)",
            }
      }
      aria-label={`Match Score ${score} percent`}
    >
      {!isCompact ? <CodexBoxOrnament /> : null}
      <div className="relative z-[3] flex flex-col items-center justify-center text-center">
        {showLabel ? (
          <p className="font-storybook text-xs font-bold uppercase tracking-[0.16em] nav-dragon-gold">
            Match Score
          </p>
        ) : null}
        <p
          className={
            isCompact
              ? "font-storybook text-2xl font-bold leading-none tracking-[0.02em] nav-dragon-gold sm:text-[1.7rem]"
              : "mt-1.5 font-storybook text-[2.35rem] font-bold leading-none tracking-[0.04em] nav-dragon-gold sm:text-[2.65rem]"
          }
        >
          <span className="tabular-nums">{score}</span>
          <span className="text-[0.55em]" aria-hidden="true">
            %
          </span>
        </p>
        {caption ? (
          <p className="mt-2.5 max-w-[16rem] font-heading text-sm leading-snug nav-dragon-gold">
            {caption}
          </p>
        ) : null}
      </div>
    </div>
  );
}
