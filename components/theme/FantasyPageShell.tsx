import Image from "next/image";

const BACKDROPS = {
  /** Darkened fantasy library shelves — book detail / author / rated. */
  library: {
    src: "/images/lorepath-library-hero.png",
    objectClass: "object-cover object-center",
    fallbackBg: "bg-[#0a1410]",
    veil: "bg-[#07120c]/62",
    radial:
      "bg-[radial-gradient(ellipse_at_50%_35%,_transparent_20%,_rgba(5,12,8,0.55)_70%,_rgba(3,8,5,0.78)_100%)]",
    wash: "bg-gradient-to-b from-[#0a1410]/45 via-transparent to-[#050a08]/70",
  },
  /** Candlelit reading table — browse + genre/tag search results. */
  browse: {
    src: "/images/lorepath-browse-table-hero.png",
    objectClass: "object-cover object-center",
    fallbackBg: "bg-[#0a120e]",
    veil: "bg-[#07100c]/45",
    radial:
      "bg-[radial-gradient(ellipse_at_50%_30%,_rgba(10,18,12,0.15)_0%,_rgba(5,10,8,0.55)_72%,_rgba(4,8,6,0.78)_100%)]",
    wash: "bg-gradient-to-b from-[#07100c]/55 via-transparent to-[#07100c]/70",
  },
} as const;

type FantasyPageShellProps = {
  children: React.ReactNode;
  className?: string;
  /** Shared fantasy library art; cover + center (no stretch). */
  variant?: keyof typeof BACKDROPS;
  /** Load backdrop eagerly (browse hero, above-the-fold pages). */
  priority?: boolean;
};

/**
 * Ambient forest/gold library atmosphere for inner pages (navbar untouched).
 * Viewport-height shell + absolute backdrop layer: background never rescales
 * when content height changes; content scrolls in a separate layer.
 */
export function FantasyPageShell({
  children,
  className = "",
  variant = "library",
  priority = false,
}: FantasyPageShellProps) {
  const backdrop = BACKDROPS[variant];

  return (
    <div
      className={`fantasy-page-shell relative h-[calc(100vh-4.5rem)] min-h-[calc(100vh-4.5rem)] overflow-hidden ${backdrop.fallbackBg} ${className}`}
    >
      <div
        className="fantasy-page-shell-backdrop pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden="true"
      >
        <Image
          src={backdrop.src}
          alt=""
          fill
          priority={priority}
          sizes="100vw"
          className={backdrop.objectClass}
        />
        {/* Readable overlay — deep green + soft gold candlelight */}
        <div className={`absolute inset-0 ${backdrop.veil}`} />
        <div className={`absolute inset-0 ${backdrop.radial}`} />
        <div className={`absolute inset-0 ${backdrop.wash}`} />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,_rgba(61,107,79,0.14)_0%,_transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_100%,_rgba(184,148,31,0.1)_0%,_transparent_45%)]" />
        <div className="absolute left-[18%] top-[55%] h-56 w-56 animate-candle-flicker rounded-full bg-[radial-gradient(circle,_rgba(212,170,60,0.16)_0%,_transparent_70%)] blur-2xl" />
        <div className="absolute right-[22%] top-[48%] h-44 w-44 animate-candle-flicker rounded-full bg-[radial-gradient(circle,_rgba(184,148,31,0.14)_0%,_transparent_70%)] blur-2xl [animation-delay:0.7s]" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/35 to-transparent" />
      </div>
      <div className="fantasy-page-shell-scroll relative z-10 h-full overflow-y-auto overscroll-contain">
        {children}
      </div>
    </div>
  );
}
