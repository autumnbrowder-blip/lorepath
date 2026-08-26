import { TrackOnMount } from "@/components/analytics/TrackOnMount";
import { LibraryClassicalScene } from "@/components/theme/LibraryClassicalScene";
import { BookOpen, ScrollText } from "lucide-react";
import Link from "next/link";

export function HomeHero() {
  return (
    <section
      aria-labelledby="home-headline"
      className="home-hero-page relative flex min-h-[calc(100svh-4.5rem)] min-h-[calc(100dvh-4.5rem)] flex-col overflow-x-clip bg-[#070e0a]"
    >
      <TrackOnMount event="view_home" />
      <LibraryClassicalScene />

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6">
        <div className="home-hero-frame">
          <div className="flex flex-col items-center text-center">
            <h1
              id="home-headline"
              className="nav-dragon-gold mx-auto max-w-3xl font-display text-[1.35rem] font-medium leading-snug tracking-[0.06em] sm:text-[1.85rem] md:text-[2.05rem]"
            >
              Preview spice, pacing, horror, and more
            </h1>
            <p className="mx-auto mt-4 max-w-2xl font-heading text-[0.95rem] leading-relaxed text-[#f0e4c7]/90 sm:mt-5 sm:text-lg">
              Rate books by content, set your preferences, and see Match Scores
              on books the community has marked.
            </p>

            <div className="mt-7 flex flex-col items-center gap-3 sm:mt-8">
              <Link
                href="/register"
                className="btn-primary min-h-[3rem] w-auto px-8 py-3 text-center text-sm tracking-[0.14em] sm:min-h-[3.1rem] sm:px-10"
              >
                <ScrollText className="h-4 w-4 shrink-0" aria-hidden="true" />
                Create free account
              </Link>
              <p className="font-heading text-[11px] tracking-[0.04em] text-gold-200/70 sm:text-xs">
                Free to start · Takes less than a minute
              </p>
              <Link
                href="/browse"
                className="inline-flex min-h-[2.4rem] items-center justify-center gap-2 px-2 py-1 font-heading text-sm italic text-gold-200/80 transition hover:text-gold-100 sm:min-h-[2.5rem]"
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
      </div>
    </section>
  );
}
