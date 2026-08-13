import { TrackOnMount } from "@/components/analytics/TrackOnMount";
import { ContactArchivesNote } from "@/components/ContactArchivesNote";
import { BookOpen, ScrollText } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export function HomeHero() {
  return (
    <section
      aria-labelledby="home-headline"
      className="home-hero-page relative flex min-h-[calc(100svh-4.5rem)] min-h-[calc(100dvh-4.5rem)] flex-col overflow-hidden bg-[#070e0a]"
    >
      <TrackOnMount event="view_home" />
      {/* Viewport-locked library — never rescales with layout/interaction */}
      <div className="home-hero-scene" aria-hidden="true">
        <div className="scroll-parallax-layer" data-scroll-parallax="">
          <Image
            src="/images/lorepath-library-hero.png"
            alt=""
            fill
            priority
            sizes="100vw"
            className="home-hero-scene-image"
          />
        </div>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_38%,_rgba(7,14,10,0.1)_0%,_rgba(7,14,10,0.5)_55%,_rgba(4,8,6,0.9)_100%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#070e0a]/65 via-transparent to-[#070e0a]/92" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#070e0a]/40 via-transparent to-[#070e0a]/40" />
        {/* Candlelight pools */}
        <div className="absolute bottom-[8%] left-[12%] h-56 w-56 animate-candle-flicker rounded-full bg-[radial-gradient(circle,_rgba(212,170,60,0.22)_0%,_transparent_70%)] blur-2xl" />
        <div className="absolute bottom-[12%] right-[14%] h-48 w-48 animate-candle-flicker rounded-full bg-[radial-gradient(circle,_rgba(184,148,31,0.18)_0%,_transparent_70%)] blur-2xl [animation-delay:0.9s]" />
        <div className="absolute left-1/2 top-[32%] h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,_rgba(212,184,74,0.12)_0%,_transparent_68%)] blur-2xl" />

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

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-5 sm:px-6 sm:py-12">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="animate-fade-in-up w-full">
            {/* Brand mark — sized so value + primary CTA stay in the first viewport on mobile */}
            <div className="relative mx-auto w-full max-w-[160px] sm:max-w-[300px] md:max-w-[420px] lg:max-w-[500px]">
              <div className="pointer-events-none absolute left-1/2 top-1/2 h-[125%] w-[125%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,_rgba(212,175,55,0.28)_0%,_transparent_65%)] blur-3xl" />
              <Image
                src="/images/lorepath-logo.png"
                alt="LorePath"
                width={917}
                height={1024}
                priority
                className="relative mx-auto h-auto w-full drop-shadow-[0_0_40px_rgba(212,175,55,0.5)]"
              />
            </div>

            <h1
              id="home-headline"
              className="nav-dragon-gold mx-auto mt-3 max-w-2xl font-storybook text-xl leading-snug tracking-[0.04em] sm:mt-5 sm:text-3xl md:text-[2rem]"
            >
              Preview spice, pacing, horror, and more
            </h1>
            <p className="mx-auto mt-2 max-w-lg font-heading text-sm leading-relaxed text-gold-200/85 sm:mt-3 sm:text-base md:text-lg">
              Rate books by content, set your preferences, and see Match Scores
              on books the community has marked.
            </p>

            {/* Signup is always the dominant hero action */}
            <div className="mx-auto mt-5 flex w-full max-w-sm flex-col items-center gap-2.5 sm:mt-8 sm:max-w-md sm:gap-3.5">
              <div className="flex w-full flex-col items-center gap-1.5">
                <Link
                  href="/register"
                  className="btn-primary w-full min-h-[3rem] px-8 py-3.5 text-center text-sm tracking-[0.14em] sm:min-h-[3.25rem] sm:px-10 sm:py-4"
                >
                  <ScrollText className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Create free account
                </Link>
                <p className="font-heading text-[11px] tracking-[0.04em] text-gold-200/60 sm:text-xs">
                  Free to start · Takes less than a minute
                </p>
              </div>

              <Link
                href="/browse"
                className="inline-flex w-auto min-h-[2.4rem] items-center justify-center gap-2 rounded-sm border border-gold-500/40 bg-transparent px-5 py-2 font-storybook text-[11px] font-normal uppercase tracking-[0.16em] text-gold-200/75 transition hover:border-gold-500/60 hover:bg-forest-950/35 hover:text-gold-100 sm:min-h-[2.5rem] sm:px-6 sm:py-2.5 sm:text-xs"
              >
                <BookOpen
                  className="h-3.5 w-3.5 opacity-70"
                  aria-hidden="true"
                />
                Browse books
              </Link>
            </div>
          </div>
        </div>

        <div
          className="animate-fade-in-up pb-3 pt-5 sm:pb-8 sm:pt-8"
          style={{ animationDelay: "120ms" }}
        >
          <div className="flex flex-col items-center justify-center">
            <ContactArchivesNote />
          </div>
        </div>
      </div>
    </section>
  );
}
