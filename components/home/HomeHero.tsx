import { TrackOnMount } from "@/components/analytics/TrackOnMount";
import { LibraryClassicalScene } from "@/components/theme/LibraryClassicalScene";
import { ScrollText } from "lucide-react";
import Link from "next/link";

export function HomeHero() {
  return (
    <section
      aria-labelledby="home-headline"
      className="home-hero-page relative flex min-h-[calc(100svh-4.5rem)] min-h-[calc(100dvh-4.5rem)] flex-col overflow-x-clip bg-[#070e0a]"
    >
      <TrackOnMount event="view_home" />
      <LibraryClassicalScene />

      <div className="relative z-10 mx-auto flex w-full flex-1 flex-col items-center justify-center px-4 py-6 sm:px-6">
        <div className="tome-plaque home-hero-frame">
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
          <Link href="/register" className="tome-link home-hero-cta">
            <ScrollText className="h-5 w-5 shrink-0" aria-hidden="true" />
            Create free account
          </Link>
        </div>
      </div>
    </section>
  );
}
