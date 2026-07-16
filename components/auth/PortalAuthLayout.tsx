/** Immersive login scene: open book + magical portal (navbar untouched above). */
export function PortalAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative isolate flex min-h-[calc(100vh-4.5rem)] w-full flex-1 items-center justify-center overflow-hidden px-6 py-12"
      style={{
        backgroundColor: "#070e0a",
        backgroundImage: "url('/images/lorepath-login-portal.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Fallback / reinforced scene image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/lorepath-login-portal.jpg"
        alt=""
        className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover object-center"
        aria-hidden="true"
      />

      {/* Dark forest + gold atmospheric overlays */}
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        aria-hidden="true"
      >
        <div className="absolute inset-0 bg-[#070e0a]/35" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,_rgba(166,124,45,0.2)_0%,_transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_100%,_rgba(7,14,10,0.55)_0%,_transparent_55%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#070e0a]/40 via-transparent to-[#070e0a]/55" />

        {/* Soft portal glow */}
        <div className="absolute left-1/2 top-[38%] h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,_rgba(232,208,120,0.25)_0%,_transparent_68%)] blur-3xl" />
        <div className="absolute bottom-[12%] left-[18%] h-40 w-40 animate-candle-flicker rounded-full bg-[radial-gradient(circle,_rgba(212,170,60,0.18)_0%,_transparent_70%)] blur-2xl" />
        <div className="absolute bottom-[18%] right-[16%] h-36 w-36 animate-candle-flicker rounded-full bg-[radial-gradient(circle,_rgba(166,124,45,0.15)_0%,_transparent_70%)] blur-2xl [animation-delay:0.8s]" />
      </div>

      {/* Floating magical motes */}
      <div
        className="pointer-events-none absolute inset-0 z-[2] overflow-hidden"
        aria-hidden="true"
      >
        {[
          { t: "14%", l: "18%", d: "0s" },
          { t: "22%", l: "72%", d: "1.1s" },
          { t: "38%", l: "42%", d: "2s" },
          { t: "55%", l: "82%", d: "0.4s" },
          { t: "68%", l: "24%", d: "1.6s" },
          { t: "30%", l: "58%", d: "2.4s" },
          { t: "48%", l: "12%", d: "0.9s" },
          { t: "76%", l: "65%", d: "1.8s" },
        ].map((p, i) => (
          <span
            key={i}
            className="absolute h-1.5 w-1.5 animate-dust rounded-full bg-gold-300/80"
            style={{ top: p.t, left: p.l, animationDelay: p.d }}
          />
        ))}
      </div>

      {/* Parchment login box — same image as Browse search bar */}
      <div
        className="relative z-10 w-full max-w-md overflow-hidden rounded-md p-7 sm:p-8"
        style={{
          backgroundImage: "url('/images/parchment.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          border: "3px solid #a67c2d",
          boxShadow:
            "0 6px 16px rgba(0,0,0,0.35), inset 0 0 40px rgba(166, 124, 45, 0.14)",
          fontFamily: "var(--font-heading), Georgia, serif",
        }}
      >
        <div className="pointer-events-none absolute inset-[6px] rounded-[2px] border border-[#a67c2d]/30" />
        <div className="relative z-10">{children}</div>
      </div>
    </div>
  );
}
