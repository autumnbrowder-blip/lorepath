"use client";

/** Decorative immersive fantasy library backdrop — pure visuals, no interaction. */
export function LibraryHeroScene() {
  const dust = [
    { top: "12%", left: "18%", delay: "0s", size: 2 },
    { top: "22%", left: "72%", delay: "1.2s", size: 3 },
    { top: "38%", left: "45%", delay: "2.1s", size: 2 },
    { top: "55%", left: "28%", delay: "0.6s", size: 2 },
    { top: "68%", left: "82%", delay: "1.8s", size: 3 },
    { top: "15%", left: "55%", delay: "2.8s", size: 2 },
    { top: "78%", left: "40%", delay: "0.9s", size: 2 },
    { top: "48%", left: "12%", delay: "1.5s", size: 3 },
    { top: "30%", left: "88%", delay: "2.4s", size: 2 },
    { top: "85%", left: "65%", delay: "0.3s", size: 2 },
  ];

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden="true"
    >
      {/* Deep forest chamber */}
      <div className="absolute inset-0 bg-[#070e0a]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_35%,_#1a2e22_0%,_transparent_55%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_30%,_rgba(4,8,6,0.85)_100%)]" />

      {/* Left bookshelf wall */}
      <BookshelfWall side="left" />
      {/* Right bookshelf wall */}
      <BookshelfWall side="right" />

      {/* Distant center shelving haze */}
      <div className="absolute inset-x-[20%] top-[8%] bottom-[18%] opacity-40 sm:opacity-50">
        <div className="h-full w-full bg-gradient-to-b from-[#1c2a20]/80 via-[#152018]/40 to-transparent" />
        <div
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, transparent 0, transparent 42px, rgba(30,45,35,0.9) 42px, rgba(30,45,35,0.9) 46px)",
          }}
        />
      </div>

      {/* Warm candlelight pools */}
      <div className="absolute bottom-[12%] left-[8%] h-48 w-48 animate-candle-flicker rounded-full bg-[radial-gradient(circle,_rgba(212,170,60,0.35)_0%,_transparent_70%)] blur-2xl sm:left-[12%] sm:h-64 sm:w-64" />
      <div className="absolute bottom-[18%] right-[10%] h-40 w-40 animate-candle-flicker rounded-full bg-[radial-gradient(circle,_rgba(184,148,31,0.28)_0%,_transparent_70%)] blur-2xl [animation-delay:0.8s] sm:right-[14%] sm:h-56 sm:w-56" />
      <div className="absolute left-1/2 top-[30%] h-72 w-72 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,_rgba(212,184,74,0.12)_0%,_transparent_65%)] blur-3xl" />

      {/* Floor glow / carpet of light */}
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#0a1410] via-[#0a1410]/70 to-transparent" />
      <div className="absolute inset-x-[15%] bottom-0 h-24 bg-[radial-gradient(ellipse_at_center,_rgba(184,148,31,0.15)_0%,_transparent_70%)] blur-xl" />

      {/* Floating tomes */}
      <FloatingBook className="absolute left-[8%] top-[28%] hidden rotate-[-18deg] animate-float-book sm:block" />
      <FloatingBook className="absolute right-[10%] top-[22%] rotate-[14deg] animate-float-book-slow" delay="1.2s" />
      <FloatingBook className="absolute left-[14%] top-[58%] rotate-[8deg] animate-float-book-slow opacity-80" delay="2s" />
      <FloatingBook className="absolute right-[16%] top-[52%] hidden rotate-[-12deg] animate-float-book opacity-90 lg:block" delay="0.5s" />

      {/* Parchment scrolls */}
      <ScrollIcon className="absolute left-[6%] bottom-[28%] h-16 w-16 rotate-[-25deg] text-gold-400/50 animate-float-book-slow sm:h-20 sm:w-20" />
      <ScrollIcon className="absolute right-[7%] bottom-[32%] h-14 w-14 rotate-[20deg] text-gold-500/40 animate-float-book" />

      {/* Candle silhouettes */}
      <Candle className="absolute bottom-[14%] left-[18%] hidden sm:block" />
      <Candle className="absolute bottom-[16%] right-[20%] hidden sm:block" />

      {/* Magical dust / golden particles */}
      {dust.map((p, i) => (
        <span
          key={i}
          className="absolute animate-dust rounded-full bg-gold-300/70"
          style={{
            top: p.top,
            left: p.left,
            width: p.size,
            height: p.size,
            animationDelay: p.delay,
          }}
        />
      ))}

      {/* Soft star sparkles */}
      <span className="absolute left-[35%] top-[18%] h-1.5 w-1.5 animate-twinkle bg-gold-300 [clip-path:polygon(50%_0%,61%_35%,100%_50%,61%_65%,50%_100%,39%_65%,0%_50%,39%_35%)]" />
      <span className="absolute left-[62%] top-[25%] h-2 w-2 animate-twinkle bg-gold-400 [animation-delay:1s] [clip-path:polygon(50%_0%,61%_35%,100%_50%,61%_65%,50%_100%,39%_65%,0%_50%,39%_35%)]" />
      <span className="absolute left-[48%] top-[70%] h-1.5 w-1.5 animate-twinkle bg-gold-300/80 [animation-delay:1.8s] [clip-path:polygon(50%_0%,61%_35%,100%_50%,61%_65%,50%_100%,39%_65%,0%_50%,39%_35%)]" />
    </div>
  );
}

function BookshelfWall({ side }: { side: "left" | "right" }) {
  const isLeft = side === "left";
  const books = [
    { h: "h-[38%]", tone: "bg-[#2a3d30]" },
    { h: "h-[52%]", tone: "bg-[#3a2e1c]" },
    { h: "h-[44%]", tone: "bg-[#243828]" },
    { h: "h-[60%]", tone: "bg-[#4a3a22]" },
    { h: "h-[35%]", tone: "bg-[#1f3328]" },
    { h: "h-[48%]", tone: "bg-[#3d3420]" },
    { h: "h-[55%]", tone: "bg-[#2c402f]" },
    { h: "h-[40%]", tone: "bg-[#45341c]" },
  ];

  return (
    <div
      className={`absolute top-0 hidden h-full w-[22%] max-w-[220px] sm:block lg:w-[18%] ${
        isLeft ? "left-0 origin-left" : "right-0 origin-right"
      }`}
      style={{
        transform: isLeft
          ? "perspective(900px) rotateY(28deg)"
          : "perspective(900px) rotateY(-28deg)",
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-[#1a140e] via-[#241a12] to-[#120e0a]" />
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      {[0, 1, 2, 3, 4].map((shelf) => (
        <div
          key={shelf}
          className="absolute inset-x-2 flex items-end gap-[2px] px-1"
          style={{
            top: `${8 + shelf * 18}%`,
            height: "15%",
          }}
        >
          <div className="absolute inset-x-0 bottom-0 h-1.5 rounded-sm bg-[#3a2a18] shadow-[0_-2px_6px_rgba(0,0,0,0.4)]" />
          {books.map((book, i) => (
            <div
              key={`${shelf}-${i}`}
              className={`relative w-[10%] min-w-[8px] rounded-[1px] border-x border-black/20 ${book.h} ${book.tone}`}
              style={{
                boxShadow: "inset 0 0 0 1px rgba(184,148,31,0.08)",
              }}
            >
              <span className="absolute inset-y-2 left-1/2 w-px -translate-x-1/2 bg-gold-500/25" />
            </div>
          ))}
        </div>
      ))}

      <div
        className={`absolute inset-y-0 w-16 ${
          isLeft
            ? "right-0 bg-gradient-to-l from-[#070e0a] to-transparent"
            : "left-0 bg-gradient-to-r from-[#070e0a] to-transparent"
        }`}
      />
    </div>
  );
}

function FloatingBook({
  className,
  delay,
}: {
  className?: string;
  delay?: string;
}) {
  return (
    <div
      className={`relative ${className ?? ""}`}
      style={delay ? { animationDelay: delay } : undefined}
    >
      <svg
        viewBox="0 0 80 100"
        className="h-16 w-12 drop-shadow-[0_0_18px_rgba(212,184,74,0.35)] sm:h-20 sm:w-16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect
          x="8"
          y="6"
          width="56"
          height="84"
          rx="3"
          fill="#2a3d30"
          stroke="#c5a059"
          strokeWidth="1.5"
        />
        <rect x="14" y="12" width="44" height="72" rx="2" fill="#1a281f" />
        <path
          d="M28 40H50M28 50H46"
          stroke="#d4af37"
          strokeWidth="1.2"
          opacity="0.7"
        />
        <circle cx="40" cy="28" r="4" stroke="#d4af37" strokeWidth="1" />
        <rect x="64" y="10" width="6" height="76" rx="1" fill="#3a2e1c" />
      </svg>
      <div className="absolute inset-0 -z-10 rounded-full bg-gold-400/20 blur-xl" />
    </div>
  );
}

function ScrollIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M16 12C16 8 20 6 24 8L48 14C52 15 54 18 54 22V44C54 48 50 50 46 48L22 42C18 41 16 38 16 34V12Z"
        fill="#e8d9b0"
        stroke="#c5a059"
        strokeWidth="1.2"
        opacity="0.85"
      />
      <path
        d="M24 22H42M24 30H38M24 38H34"
        stroke="#8a7340"
        strokeWidth="1"
        opacity="0.5"
      />
      <circle cx="18" cy="14" r="5" fill="#d4c49a" stroke="#b8941f" />
      <circle cx="50" cy="48" r="5" fill="#d4c49a" stroke="#b8941f" />
    </svg>
  );
}

function Candle({ className }: { className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <div className="mx-auto h-3 w-3 animate-candle-flicker rounded-full bg-gold-300 shadow-[0_0_20px_8px_rgba(212,184,74,0.45)]" />
      <div className="mx-auto h-14 w-4 rounded-sm bg-gradient-to-b from-cream-200 to-cream-400 shadow-md" />
      <div className="mx-auto -mt-0.5 h-2 w-6 rounded-sm bg-[#3a2a18]" />
    </div>
  );
}
