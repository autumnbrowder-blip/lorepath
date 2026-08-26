import { TrackOnMount } from "@/components/analytics/TrackOnMount";
import { ContactArchivesNote } from "@/components/ContactArchivesNote";
import { CodexBoxOrnament } from "@/components/preferences/CodexBoxOrnament";
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

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
        <div className="home-hero-frame animate-fade-in-up">
          <CodexBoxOrnament />
          <div className="relative z-[3] flex flex-col items-center text-center">
            <h1
              id="home-headline"
              className="nav-dragon-gold mx-auto max-w-xl font-storybook text-xl leading-snug tracking-[0.04em] sm:text-3xl md:text-[2rem]"
            >
              Preview spice, pacing, horror, and more
            </h1>
            <p className="mx-auto mt-3 max-w-lg font-heading text-sm leading-relaxed text-gold-100/90 sm:mt-4 sm:text-base md:text-lg">
              Rate books by content, set your preferences, and see Match Scores
              on books the community has marked.
            </p>

            <div className="mx-auto mt-6 flex w-full max-w-sm flex-col items-center gap-2.5 sm:mt-8 sm:max-w-md sm:gap-3.5">
              <div className="flex w-full flex-col items-center gap-1.5">
                <Link
                  href="/register"
                  className="btn-primary w-full min-h-[3rem] px-8 py-3.5 text-center text-sm tracking-[0.14em] sm:min-h-[3.25rem] sm:px-10 sm:py-4"
                >
                  <ScrollText className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Create free account
                </Link>
                <p className="font-heading text-[11px] tracking-[0.04em] text-gold-200/70 sm:text-xs">
                  Free to start · Takes less than a minute
                </p>
              </div>

              <Link
                href="/browse"
                className="inline-flex w-auto min-h-[2.4rem] items-center justify-center gap-2 rounded-sm border border-gold-500/40 bg-transparent px-5 py-2 font-storybook text-[11px] font-normal uppercase tracking-[0.16em] text-gold-200/80 transition hover:border-gold-500/60 hover:bg-forest-950/35 hover:text-gold-100 sm:min-h-[2.5rem] sm:px-6 sm:py-2.5 sm:text-xs"
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
          className="animate-fade-in-up mt-6 sm:mt-8"
          style={{ animationDelay: "120ms" }}
        >
          <ContactArchivesNote />
        </div>
      </div>
    </section>
  );
}
