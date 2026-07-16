import { CornerFlourish, SideOrnament } from "@/components/theme/FantasyDecor";
import {
  BookMarked,
  Compass,
  Feather,
  Flame,
  Library,
  ScrollText,
} from "lucide-react";
import Link from "next/link";

const libraryShelves = [
  {
    title: "The Reading Halls",
    description:
      "Wander quiet aisles of ranked tales — every spine a door into adventure, preference, and lore.",
    icon: Library,
    href: "/browse",
    cta: "Enter the stacks",
  },
  {
    title: "The Preference Codex",
    description:
      "Mark what you seek and what you leave unopened. Your taste becomes a compass through the shelves.",
    icon: ScrollText,
    href: "/preferences",
    cta: "Open the codex",
  },
  {
    title: "Traveler’s Compass",
    description:
      "Match scores light the path — find books that fit like a favorite chair by the hearth.",
    icon: Compass,
    href: "/browse",
    cta: "Find your match",
  },
];

function ManuscriptPanel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <div className="absolute inset-0 rounded-sm bg-gradient-to-b from-[#2a1f14]/90 via-[#1a1510]/95 to-[#120e0a]/95" />
      <div className="absolute inset-0 rounded-sm border border-gold-500/50" />
      <div className="absolute inset-[5px] rounded-sm border border-gold-600/25" />
      <div
        className="absolute inset-[10px] rounded-sm opacity-[0.07]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 27px, rgba(240,234,216,0.55) 28px)",
        }}
      />
      <CornerFlourish className="pointer-events-none absolute left-0 top-0 h-12 w-12 text-gold-500/80" />
      <CornerFlourish className="pointer-events-none absolute right-0 top-0 h-12 w-12 rotate-90 text-gold-500/80" />
      <CornerFlourish className="pointer-events-none absolute bottom-0 left-0 h-12 w-12 -rotate-90 text-gold-500/80" />
      <CornerFlourish className="pointer-events-none absolute bottom-0 right-0 h-12 w-12 rotate-180 text-gold-500/80" />
      <div className="relative p-6 sm:p-8">{children}</div>
    </div>
  );
}

function BookSpine({
  title,
  tone,
}: {
  title: string;
  tone: "gold" | "forest" | "ember" | "cream";
}) {
  const tones = {
    gold: "from-gold-700/80 via-gold-600/50 to-gold-800/70 border-gold-400/40",
    forest: "from-forest-700/80 via-forest-600/50 to-forest-900/80 border-forest-400/30",
    ember: "from-amber-800/70 via-amber-700/45 to-amber-950/80 border-amber-400/35",
    cream: "from-cream-700/50 via-cream-600/30 to-cream-900/60 border-cream-300/25",
  };

  return (
    <div
      className={`flex h-36 w-9 flex-col items-center justify-end overflow-hidden rounded-sm border bg-gradient-to-b shadow-lg sm:h-44 sm:w-11 ${tones[tone]}`}
      title={title}
    >
      <span
        className="mb-3 max-h-28 origin-center rotate-180 truncate px-0.5 font-display text-[9px] tracking-widest text-cream-100/85 sm:text-[10px]"
        style={{ writingMode: "vertical-rl" }}
      >
        {title}
      </span>
      <div className="mb-2 h-1 w-4 rounded-full bg-gold-400/50" />
    </div>
  );
}

export function LibraryInterior() {
  return (
    <section className="relative mt-12 pb-6 sm:mt-16">
      {/* Warm hearth / candlelight wash */}
      <div className="pointer-events-none absolute inset-x-0 -top-24 h-64 bg-[radial-gradient(ellipse_at_center,_rgba(212,160,60,0.18)_0%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 left-1/4 h-40 w-40 -translate-x-1/2 rounded-full bg-amber-600/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-10 right-1/4 h-48 w-48 translate-x-1/2 rounded-full bg-gold-500/10 blur-3xl" />

      {/* Section herald */}
      <div className="relative mb-10 text-center">
        <SideOrnament className="mx-auto mb-3 h-5 w-8 text-gold-400" />
        <p className="font-display text-xs font-medium uppercase tracking-[0.35em] text-gold-400">
          Beyond the threshold
        </p>
        <h2 className="mt-3 font-display text-3xl font-semibold tracking-wide text-cream-100 sm:text-4xl">
          Welcome to the Library
        </h2>
        <p className="mx-auto mt-4 max-w-xl font-heading text-lg leading-relaxed text-cream-300/85">
          Candlelight on wood and parchment. Soft chairs. Endless shelves.
          Step inside — every aisle keeps a story ready for you.
        </p>
      </div>

      {/* Shelf of book spines */}
      <div className="relative mb-10 overflow-hidden rounded-sm border border-gold-600/30 bg-gradient-to-b from-[#1c140e] to-[#0e0a08] px-4 py-5 shadow-[inset_0_1px_0_rgba(212,175,55,0.15)] sm:px-8 sm:py-6">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-500/50 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-gold-700/40 to-transparent" />
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="font-display text-[11px] uppercase tracking-[0.3em] text-gold-500/90">
            The warm shelves
          </p>
          <Flame className="h-4 w-4 animate-gentle-glow text-amber-400/80" />
        </div>
        <div className="flex items-end justify-center gap-1.5 sm:gap-2">
          <BookSpine title="Content Ratings" tone="gold" />
          <BookSpine title="Match Score" tone="forest" />
          <BookSpine title="Community Lore" tone="ember" />
          <BookSpine title="Preferences" tone="cream" />
          <BookSpine title="Discoveries" tone="gold" />
          <BookSpine title="Favorites" tone="forest" />
          <BookSpine title="Quests" tone="ember" />
        </div>
        <div className="mt-3 h-2 rounded-sm bg-gradient-to-b from-[#3a2a1a] to-[#1a120c] shadow-inner" />
      </div>

      {/* Three library wings */}
      <div className="grid gap-5 lg:grid-cols-3">
        {libraryShelves.map((shelf) => {
          const Icon = shelf.icon;
          return (
            <ManuscriptPanel key={shelf.title}>
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-gold-500/40 bg-gold-950/40 text-gold-400 shadow-glow">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="font-display text-xl font-semibold tracking-wide text-cream-100">
                {shelf.title}
              </h3>
              <p className="mt-3 font-heading text-base leading-relaxed text-cream-300/80">
                {shelf.description}
              </p>
              <Link
                href={shelf.href}
                className="mt-6 inline-flex items-center gap-2 border-b border-gold-500/40 pb-0.5 font-display text-xs uppercase tracking-[0.2em] text-gold-400 transition hover:border-gold-300 hover:text-gold-300"
              >
                {shelf.cta}
                <Feather className="h-3.5 w-3.5" />
              </Link>
            </ManuscriptPanel>
          );
        })}
      </div>

      {/* Hearth invitation */}
      <ManuscriptPanel className="mt-8">
        <div className="flex flex-col items-center gap-6 text-center lg:flex-row lg:items-center lg:text-left">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-amber-400/40 bg-gradient-to-br from-amber-600/30 to-gold-900/40 text-amber-300 shadow-glow-gold">
            <BookMarked className="h-7 w-7" />
          </div>
          <div className="flex-1">
            <p className="font-display text-xs uppercase tracking-[0.3em] text-gold-400">
              By the hearth
            </p>
            <h3 className="mt-2 font-display text-2xl font-semibold text-cream-100 sm:text-3xl">
              Settle in. The stories are waiting.
            </h3>
            <p className="mt-3 max-w-2xl font-heading text-lg leading-relaxed text-cream-300/85">
              Warm light, quiet corners, and books that respect what you love to
              read.
            </p>
          </div>
          <Link
            href="/browse"
            className="inline-flex shrink-0 items-center gap-2 rounded-sm border border-gold-400/50 bg-gradient-to-b from-gold-400 to-gold-600 px-7 py-3.5 font-display text-xs font-semibold uppercase tracking-[0.18em] text-forest-950 shadow-glow-gold transition hover:-translate-y-0.5 hover:from-gold-300 hover:to-gold-500"
          >
            Browse the shelves
          </Link>
        </div>
      </ManuscriptPanel>
    </section>
  );
}
