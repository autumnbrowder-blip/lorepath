"use client";

import { CodexBoxOrnament } from "@/components/preferences/CodexBoxOrnament";

type PreferenceSliderProps = {
  id: string;
  label: string;
  description: string;
  value: number;
  onChange: (value: number) => void;
  hintLow?: string;
  hintHigh?: string;
  note?: string;
  levelLabels?: Partial<Record<0 | 1 | 2 | 3 | 4 | 5, string>>;
  levelDescriptions?: Partial<Record<0 | 1 | 2 | 3 | 4 | 5, string>>;
  index?: number;
};

const LEVELS = [0, 1, 2, 3, 4, 5] as const;

const ANTIQUE_GOLD_FILL =
  "linear-gradient(180deg, #d0b67a 0%, #b38b4d 45%, #a67c2d 100%)";

function defaultLevelLabel(value: number): string {
  if (value === 0) return "None";
  if (value <= 2) return "Low";
  if (value <= 3) return "Moderate";
  if (value <= 4) return "High";
  return "Very High";
}

export function PreferenceSlider({
  id,
  label,
  description,
  value,
  onChange,
  hintLow,
  hintHigh,
  note,
  levelLabels,
  levelDescriptions,
  index = 0,
}: PreferenceSliderProps) {
  const percentage = (value / 5) * 100;
  const clamped = Math.min(5, Math.max(0, value)) as 0 | 1 | 2 | 3 | 4 | 5;
  const badgeLabel = levelLabels?.[clamped] ?? defaultLevelLabel(value);
  const levelDescription = levelDescriptions?.[clamped];

  return (
    <div
      className="preference-codex-box animate-fade-in-up"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <CodexBoxOrnament />
      <div
        className="pointer-events-none absolute inset-0 z-[1] opacity-[0.1] mix-blend-soft-light"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      <div className="relative z-[3] mb-4 flex items-start justify-between gap-4 px-1">
        <div className="min-w-0">
          <label
            htmlFor={id}
            className="font-storybook text-lg font-bold tracking-[0.12em] nav-dragon-gold"
          >
            {label}
          </label>
          <p className="mt-2 font-heading text-lg leading-relaxed nav-dragon-gold">
            {description}
          </p>
          {note && (
            <p className="mt-2 font-heading text-base leading-relaxed nav-dragon-gold opacity-80">
              {note}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <span
            className="inline-flex h-12 min-w-[3rem] items-center justify-center rounded-sm border border-gold-600/55 px-2.5 font-storybook text-xl font-normal text-forest-950 shadow-[0_4px_12px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,245,210,0.45)]"
            style={{ background: ANTIQUE_GOLD_FILL }}
          >
            {value}
          </span>
          <p className="nav-dragon-gold mt-1.5 max-w-[7.5rem] font-storybook text-sm uppercase leading-snug tracking-[0.14em]">
            {badgeLabel}
          </p>
        </div>
      </div>

      <p className="relative z-[3] mb-3 min-h-[3rem] overflow-hidden px-1 font-heading text-base leading-relaxed nav-dragon-gold">
        {levelDescription ?? "\u00a0"}
      </p>
      <div className="relative z-[3] mb-2 px-1 py-2">
        <div className="h-2.5 overflow-hidden rounded-sm border border-gold-600/35 bg-forest-950/65">
          <div
            className="h-full rounded-sm transition-[width] duration-200"
            style={{
              width: `${percentage}%`,
              background:
                "linear-gradient(90deg, #a67c2d 0%, #b38b4d 55%, #d0b67a 100%)",
              boxShadow: "0 0 12px rgba(166,124,45,0.35)",
            }}
          />
        </div>
        <input
          id={id}
          type="range"
          min={0}
          max={5}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-valuemin={0}
          aria-valuemax={5}
          aria-valuenow={value}
        />
      </div>

      {(hintLow || hintHigh) && (
        <div className="relative z-[3] mb-3 flex justify-between px-1 font-heading text-sm italic tracking-wide nav-dragon-gold opacity-75">
          <span>{hintLow}</span>
          <span>{hintHigh}</span>
        </div>
      )}

      <div className="relative z-[3] flex gap-1.5 px-1">
        {LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => onChange(level)}
            aria-label={`Set ${label} to ${level} out of 5`}
            aria-pressed={value === level}
            className={`flex-1 rounded-sm border border-gold-600/30 py-2.5 font-storybook text-base font-normal tabular-nums tracking-wide transition-colors duration-150 ${
              value === level
                ? "border-gold-600/75 text-forest-950"
                : "bg-forest-950/45 antique-gold-text hover:border-gold-500/50"
            }`}
            style={
              value === level ? { background: ANTIQUE_GOLD_FILL } : undefined
            }
          >
            {level}
          </button>
        ))}
      </div>
    </div>
  );
}
