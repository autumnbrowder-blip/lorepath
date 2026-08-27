import { TrackOnMount } from "@/components/analytics/TrackOnMount";
import { CodexBoxOrnament } from "@/components/preferences/CodexBoxOrnament";
import { LibraryClassicalScene } from "@/components/theme/LibraryClassicalScene";
import Link from "next/link";
import type { CSSProperties } from "react";

const heroBoxFill: CSSProperties = {
  background:
    "linear-gradient(155deg, rgba(11, 22, 16, 0.86) 0%, rgba(16, 32, 24, 0.82) 100%)",
};

const heroCtaStyle: CSSProperties = {
  fontFamily: "var(--font-heading), Georgia, serif",
  color: "#1a140c",
  WebkitTextFillColor: "#1a140c",
  background: "linear-gradient(180deg, #d4b36a 0%, #c4a056 100%)",
  border: "1px solid #a67c2d",
};

export function HomeHero() {
  return (
    <section
      aria-labelledby="home-headline"
      className="home-hero-page relative flex min-h-[calc(100svh-4.5rem)] min-h-[calc(100dvh-4.5rem)] flex-col overflow-x-clip bg-[#070e0a]"
    >
      <TrackOnMount event="view_home" />
      <LibraryClassicalScene />

      <div className="relative z-10 mx-auto flex w-full flex-1 flex-col items-center justify-center px-4 py-6 sm:px-6">
        <div
          className="preference-codex-box relative !px-6 !py-8 sm:!px-8 home-hero-frame"
          style={heroBoxFill}
        >
          <CodexBoxOrnament />
          <div className="relative z-[3]">
            <h1
              id="home-headline"
              className="home-hero-title"
            >
              Preview spice, pacing, horror, and more
            </h1>
            <p className="home-hero-lede">
              Rate books by content, set your preferences, and see Match Scores
              on books the community has marked.
            </p>
            <Link
              href="/register"
              className="mt-7 inline-flex h-[43px] w-auto items-center justify-center rounded-[4px] px-5 text-base font-semibold tracking-wide no-underline"
              style={heroCtaStyle}
            >
              Create free account
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
