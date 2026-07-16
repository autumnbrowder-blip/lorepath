import Link from "next/link";

type Tome = {
  title: string;
  subtitle: string;
  href: string;
  leather: "forest" | "umber" | "olive";
};

const TOMES: Tome[] = [
  {
    title: "Browse the Archives",
    subtitle: "Wander endless shelves of story",
    href: "/browse",
    leather: "forest",
  },
  {
    title: "Set Your Preferences",
    subtitle: "Inscribe the path you prefer",
    href: "/preferences",
    leather: "umber",
  },
  {
    title: "Your Rated Tomes",
    subtitle: "Return to books you have marked",
    href: "/rated",
    leather: "olive",
  },
];

const leatherStyles: Record<
  Tome["leather"],
  { cover: string; spine: string; emboss: string }
> = {
  forest: {
    cover:
      "from-[#1a2e24] via-[#243d32] to-[#15251d] shadow-[0_12px_28px_rgba(8,20,14,0.45),inset_0_1px_0_rgba(212,184,74,0.18)]",
    spine: "from-[#0f1a14] via-[#1f3228] to-[#0c1611]",
    emboss: "text-gold-400/90",
  },
  umber: {
    cover:
      "from-[#2a2216] via-[#3a2e1c] to-[#221a10] shadow-[0_12px_28px_rgba(20,12,4,0.45),inset_0_1px_0_rgba(212,184,74,0.18)]",
    spine: "from-[#1a140c] via-[#2c2214] to-[#140f09]",
    emboss: "text-gold-300/90",
  },
  olive: {
    cover:
      "from-[#222a1a] via-[#2f3a24] to-[#1a2114] shadow-[0_12px_28px_rgba(10,16,8,0.45),inset_0_1px_0_rgba(212,184,74,0.18)]",
    spine: "from-[#141a10] via-[#28301c] to-[#10140c]",
    emboss: "text-gold-400/90",
  },
};

function AncientTome({ tome }: { tome: Tome }) {
  const style = leatherStyles[tome.leather];

  return (
    <Link
      href={tome.href}
      className="group relative block h-full outline-none focus-visible:ring-2 focus-visible:ring-gold-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
    >
      <article
        className={`relative flex h-full min-h-[220px] overflow-hidden rounded-sm border border-gold-500/35 bg-gradient-to-br transition-all duration-300 ease-out group-hover:-translate-y-2 group-hover:border-gold-400/55 group-hover:shadow-[0_18px_40px_rgba(8,20,14,0.5),0_0_28px_rgba(184,148,31,0.22)] sm:min-h-[260px] ${style.cover}`}
      >
        {/* Leather grain */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.22] mix-blend-soft-light"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          }}
        />

        {/* Spine */}
        <div
          className={`relative z-10 flex w-7 shrink-0 flex-col items-center justify-between border-r border-gold-500/25 bg-gradient-to-b py-4 sm:w-9 ${style.spine}`}
        >
          <span className="h-8 w-[3px] rounded-full bg-gold-500/50" />
          <span className="h-16 w-[2px] rounded-full bg-gold-600/40" />
          <span className="h-8 w-[3px] rounded-full bg-gold-500/50" />
        </div>

        {/* Cover face */}
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-5 py-8 text-center sm:px-6">
          <div className="mb-4 h-px w-16 bg-gradient-to-r from-transparent via-gold-400/70 to-transparent" />
          <div
            className={`mb-3 font-display text-[10px] uppercase tracking-[0.35em] ${style.emboss}`}
          >
            LorePath
          </div>
          <h3
            className={`font-display text-xl font-semibold leading-snug tracking-wide sm:text-2xl ${style.emboss}`}
          >
            {tome.title}
          </h3>
          <p className="mt-3 max-w-[16rem] font-heading text-sm leading-relaxed text-cream-200/75">
            {tome.subtitle}
          </p>
          <div className="mt-5 h-px w-16 bg-gradient-to-r from-transparent via-gold-400/70 to-transparent" />
          <span
            className={`mt-5 inline-flex items-center gap-2 font-display text-[10px] uppercase tracking-[0.28em] opacity-80 transition group-hover:opacity-100 ${style.emboss}`}
          >
            Open Tome
            <span aria-hidden="true" className="text-sm">
              →
            </span>
          </span>
        </div>

        {/* Gold corner embossing */}
        <span className="pointer-events-none absolute left-10 top-3 h-5 w-5 border-l border-t border-gold-400/35 sm:left-12" />
        <span className="pointer-events-none absolute right-3 top-3 h-5 w-5 border-r border-t border-gold-400/35" />
        <span className="pointer-events-none absolute bottom-3 left-10 h-5 w-5 border-b border-l border-gold-400/35 sm:left-12" />
        <span className="pointer-events-none absolute bottom-3 right-3 h-5 w-5 border-b border-r border-gold-400/35" />
      </article>
    </Link>
  );
}

export function AncientTomes() {
  return (
    <section
      aria-labelledby="scholars-desk-heading"
      className="relative mx-auto mt-10 w-full max-w-5xl sm:mt-12"
    >
      {/* Soft candlelight above the desk */}
      <div className="pointer-events-none absolute inset-x-0 -top-16 h-40 bg-[radial-gradient(ellipse_at_center,_rgba(212,160,60,0.16)_0%,_transparent_70%)]" />

      {/* Scholar's desk parchment panel */}
      <div className="relative overflow-hidden rounded-sm border border-gold-500/45 shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(160deg, #ece2c8 0%, #e4d6b4 35%, #dcc9a0 70%, #d4bf92 100%)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35] mix-blend-multiply"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='p'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23p)'/%3E%3C/svg%3E\")",
          }}
        />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_40%,_rgba(90,60,20,0.18)_100%)]" />
        <div className="pointer-events-none absolute inset-0 border border-gold-700/15" />
        <div className="pointer-events-none absolute inset-[6px] border border-gold-700/20" />

        <div className="relative px-4 py-8 sm:px-8 sm:py-10 lg:px-10">
          <div className="mb-8 text-center">
            <p className="font-display text-[10px] font-medium uppercase tracking-[0.35em] text-gold-800/80">
              Upon the scholar&apos;s desk
            </p>
            <h2
              id="scholars-desk-heading"
              className="mt-2 font-display text-2xl font-semibold tracking-wide text-forest-900 sm:text-3xl"
            >
              Choose your next volume
            </h2>
            <p className="mx-auto mt-3 max-w-md font-heading text-base leading-relaxed text-forest-800/75">
              Three ancient tomes await — leather worn soft by decades of
              curious hands.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
            {TOMES.map((tome) => (
              <AncientTome key={tome.href} tome={tome} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
