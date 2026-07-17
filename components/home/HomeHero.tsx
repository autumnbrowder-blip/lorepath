import { BookOpen, Feather } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export function HomeHero() {
  return (
    <section
      aria-labelledby="home-tagline"
      className="relative flex min-h-[calc(100vh-4.5rem)] flex-col overflow-hidden bg-[#070e0a]"
    >
      {/* Immersive fantasy library background */}
      <div className="absolute inset-0">
        <Image
          src="/images/lorepath-library-hero.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center scale-[1.02]"
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_38%,_rgba(7,14,10,0.1)_0%,_rgba(7,14,10,0.5)_55%,_rgba(4,8,6,0.9)_100%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#070e0a]/65 via-transparent to-[#070e0a]/92" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#070e0a]/40 via-transparent to-[#070e0a]/40" />
        {/* Candlelight pools */}
        <div className="absolute bottom-[8%] left-[12%] h-56 w-56 animate-candle-flicker rounded-full bg-[radial-gradient(circle,_rgba(212,170,60,0.22)_0%,_transparent_70%)] blur-2xl" />
        <div className="absolute bottom-[12%] right-[14%] h-48 w-48 animate-candle-flicker rounded-full bg-[radial-gradient(circle,_rgba(184,148,31,0.18)_0%,_transparent_70%)] blur-2xl [animation-delay:0.9s]" />
        <div className="absolute left-1/2 top-[32%] h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,_rgba(212,184,74,0.12)_0%,_transparent_68%)] blur-2xl" />
      </div>

      {/* Magical dust */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden="true"
      >
        {[
          { t: "16%", l: "20%", d: "0s" },
          { t: "26%", l: "72%", d: "1.1s" },
          { t: "40%", l: "40%", d: "2s" },
          { t: "55%", l: "80%", d: "0.4s" },
          { t: "64%", l: "16%", d: "1.6s" },
          { t: "22%", l: "54%", d: "2.4s" },
          { t: "72%", l: "48%", d: "0.9s" },
          { t: "34%", l: "88%", d: "1.8s" },
        ].map((p, i) => (
          <span
            key={i}
            className="absolute h-1 w-1 animate-dust rounded-full bg-gold-300/70"
            style={{ top: p.t, left: p.l, animationDelay: p.d }}
          />
        ))}
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-10 sm:px-6 sm:py-12">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="animate-fade-in-up w-full">
            {/* Translucent antique-gold LorePath mark */}
            <div className="relative mx-auto w-full max-w-[320px] sm:max-w-[420px] md:max-w-[500px] lg:max-w-[580px]">
              <div className="pointer-events-none absolute left-1/2 top-1/2 h-[125%] w-[125%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,_rgba(212,175,55,0.28)_0%,_transparent_65%)] blur-3xl" />
              <Image
                src="/images/lorepath-logo.png"
                alt="LorePath"
                width={917}
                height={1024}
                priority
                unoptimized
                className="relative mx-auto h-auto w-full drop-shadow-[0_0_40px_rgba(212,175,55,0.5)]"
              />
            </div>

            <p
              id="home-tagline"
              className="nav-dragon-gold mx-auto mt-4 max-w-xl font-storybook text-xl leading-relaxed tracking-[0.06em] sm:mt-6 sm:text-2xl md:text-[1.75rem]"
            >
              Built for readers by readers who wander between worlds.
            </p>
          </div>
        </div>

        <div
          className="animate-fade-in-up pb-4 pt-8 sm:pb-8"
          style={{ animationDelay: "120ms" }}
        >
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-5">
            <Link
              href="/browse"
              className="group relative inline-flex w-full max-w-xs items-center justify-center gap-2 overflow-hidden rounded-sm border border-gold-500/70 px-8 py-4 font-storybook text-xs font-normal uppercase tracking-[0.2em] text-forest-950 transition hover:-translate-y-1 sm:w-auto"
              style={{
                background:
                  "linear-gradient(180deg, #d0b67a 0%, #b38b4d 42%, #a67c2d 100%)",
                boxShadow:
                  "0 10px 28px rgba(166,124,45,0.35), inset 0 1px 0 rgba(255,245,210,0.4), inset 0 -2px 4px rgba(90,60,10,0.35)",
              }}
            >
              <span
                className="pointer-events-none absolute inset-0 opacity-30 mix-blend-overlay"
                style={{
                  backgroundImage:
                    "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
                }}
              />
              <BookOpen className="relative h-4 w-4" />
              <span className="relative">Browse the Archives</span>
            </Link>

            <Link
              href="/preferences"
              className="group relative inline-flex w-full max-w-xs items-center justify-center gap-2 overflow-hidden rounded-sm border border-gold-600/50 px-8 py-4 font-storybook text-xs font-normal uppercase tracking-[0.2em] text-gold-300 transition hover:-translate-y-1 hover:text-gold-200 sm:w-auto"
              style={{
                background:
                  "linear-gradient(180deg, #4a3a22 0%, #2a2014 48%, #120e0a 100%)",
                boxShadow:
                  "0 10px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(179,139,77,0.22), inset 0 -2px 4px rgba(0,0,0,0.5)",
              }}
            >
              <span
                className="pointer-events-none absolute inset-0 opacity-25 mix-blend-overlay"
                style={{
                  backgroundImage:
                    "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
                }}
              />
              <Feather className="relative h-4 w-4" />
              <span className="relative">Set Your Preferences</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
