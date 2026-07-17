import { BookLogoMark } from "@/components/theme/BookLogoMark";
import { LibraryInterior } from "@/components/theme/LibraryInterior";
import {
  FantasyBackground,
  OrnateFrame,
} from "@/components/theme/OrnateFrame";
import { ArrowLeft, BookOpen, Feather } from "lucide-react";
import Link from "next/link";

export default function ThemePreviewPage() {
  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden bg-forest-950 text-cream-200">
      <FantasyBackground />

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl flex-col px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-gold-500/30 bg-forest-900/60 px-4 py-2 text-sm text-gold-300 backdrop-blur transition hover:border-gold-400/50 hover:text-gold-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to current theme
          </Link>
          <span className="rounded-full border border-gold-500/30 bg-gold-950/40 px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-gold-300">
            Theme preview
          </span>
        </div>

        <OrnateFrame className="mx-auto flex w-full max-w-4xl flex-col justify-center">
          <div className="py-8 sm:py-12">
            <BookLogoMark />

            <p className="mx-auto mt-8 max-w-md text-center font-heading text-lg leading-relaxed text-cream-300/90 sm:text-xl">
              Built for readers by readers who wander between worlds.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/browse"
                className="inline-flex items-center gap-2 rounded-sm border border-gold-400/50 bg-gradient-to-b from-gold-400 to-gold-600 px-7 py-3 font-display text-xs font-semibold uppercase tracking-[0.18em] text-forest-950 shadow-glow-gold transition hover:-translate-y-0.5 hover:from-gold-300 hover:to-gold-500"
              >
                <BookOpen className="h-4 w-4" />
                Browse Books
              </Link>
              <Link
                href="/preferences"
                className="inline-flex items-center gap-2 rounded-sm border border-gold-500/35 bg-[#1a1510]/70 px-7 py-3 font-display text-xs font-medium uppercase tracking-[0.18em] text-cream-200 backdrop-blur transition hover:border-gold-400/55 hover:text-gold-300"
              >
                <Feather className="h-4 w-4" />
                Set Preferences
              </Link>
            </div>
          </div>
        </OrnateFrame>

        <LibraryInterior />
      </div>
    </div>
  );
}
