"use client";

type RatingSliderProps = {
  id: string;
  label: string;
  levelDescriptions?: Partial<Record<0 | 1 | 2 | 3 | 4 | 5, string>>;
  value: number;
  onChange: (value: number) => void;
  index?: number;
};

const LEVELS = [0, 1, 2, 3, 4, 5] as const;

export function RatingSlider({
  id,
  label,
  levelDescriptions,
  value,
  onChange,
  index = 0,
}: RatingSliderProps) {
  const percentage = (value / 5) * 100;
  const clamped = Math.min(5, Math.max(0, value)) as 0 | 1 | 2 | 3 | 4 | 5;
  const levelDescription = levelDescriptions?.[clamped];

  return (
    <div
      className="rating-slider rounded-sm border border-gold-600/30 bg-forest-950/45 px-3 py-2.5"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <label
            htmlFor={id}
            className="font-heading text-base font-semibold leading-snug nav-dragon-gold"
          >
            {label}
          </label>
          <p
            className="mt-1 h-[4.5rem] min-h-[4.5rem] shrink-0 overflow-hidden font-heading text-sm leading-snug tracking-wide text-[#e2c06a]/80"
            aria-live="polite"
          >
            {levelDescription ?? "\u00A0"}
          </p>
        </div>
        <span className="inline-flex h-7 min-w-[1.75rem] shrink-0 items-center justify-center rounded-sm border border-gold-600/50 bg-gradient-to-br from-gold-600 to-gold-500 px-2 font-storybook text-sm font-bold text-forest-950">
          {value}
        </span>
      </div>

      <div className="relative mb-2 py-0.5">
        <div className="h-2 overflow-hidden rounded-sm border border-gold-600/25 bg-forest-950/65">
          <div
            className="h-full rounded-sm bg-gradient-to-r from-gold-600 to-gold-400 transition-[width] duration-200"
            style={{ width: `${percentage}%` }}
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
          aria-label={`${label}: ${levelDescription ?? value}`}
        />
      </div>

      <div className="flex gap-1.5">
        {LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => onChange(level)}
            aria-label={`Rate ${label} ${level} out of 5`}
            aria-pressed={value === level}
            className={`flex-1 rounded-sm border border-gold-600/35 py-1.5 text-sm font-semibold tabular-nums transition-colors duration-150 ${
              value === level
                ? "border-gold-600/75 bg-gradient-to-r from-gold-600 to-gold-500 text-forest-950"
                : "bg-forest-950/50 antique-gold-text hover:border-gold-500/50"
            }`}
          >
            {level}
          </button>
        ))}
      </div>
    </div>
  );
}
