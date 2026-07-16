import { CodexBoxOrnament } from "@/components/preferences/CodexBoxOrnament";
import { CornerFlourish } from "@/components/theme/FantasyDecor";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import {
  ArrowLeft,
  Bookmark,
  Compass,
  Crown,
  Download,
  History,
  Layers,
  SlidersHorizontal,
  Sparkles,
  Target,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Premium | LorePath",
  description:
    "Unlock Match Score, advanced preferences, personalized recommendations, and more on LorePath Premium.",
};

const PREMIUM_FEATURES: {
  title: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    title: "Match Score",
    description: "See how well a book fits your preferences.",
    icon: Target,
  },
  {
    title: "Advanced Preferences & Filters",
    description: "Fine-tune the kinds of stories that feel right for you.",
    icon: SlidersHorizontal,
  },
  {
    title: "Multiple Saved Preference Profiles",
    description: "Keep different comfort levels for different reading moods.",
    icon: Layers,
  },
  {
    title: "Personalized Book Recommendations",
    description: "Discover tomes matched to your marks and taste.",
    icon: Compass,
  },
  {
    title: "Reading History & Stats",
    description: "Look back on what you’ve rated and how your tastes shift.",
    icon: History,
  },
  {
    title: "Smart Wishlist / TBR tools",
    description: "Keep a living shelf of books you mean to open next.",
    icon: Bookmark,
  },
  {
    title: "Export your ratings and reading data",
    description: "Take your marks with you whenever you need them.",
    icon: Download,
  },
];

export default async function PaidFeaturesPage() {
  let email: string | null = null;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    email = user?.email ?? null;
  }

  return (
    <div className="relative isolate min-h-[calc(100vh-4.5rem)] overflow-hidden bg-[#d8c49a]">
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
        <Image
          src="/images/lorepath-preferences-parchment.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center brightness-[0.96] contrast-[1.06] saturate-[0.92]"
        />
        <div
          className="absolute inset-0 opacity-[0.34] mix-blend-multiply"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 280 280' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.7'/%3E%3C/svg%3E\")",
          }}
        />
        <div className="absolute -left-[8%] top-[12%] h-64 w-72 rounded-full bg-[radial-gradient(ellipse,_rgba(110,70,30,0.18)_0%,_transparent_70%)] blur-2xl" />
        <div className="absolute bottom-[8%] right-[4%] h-72 w-80 rounded-full bg-[radial-gradient(ellipse,_rgba(90,55,20,0.16)_0%,_transparent_68%)] blur-2xl" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_12%,_rgba(166,124,45,0.14)_0%,_transparent_45%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_82%_78%,_rgba(61,107,79,0.14)_0%,_transparent_48%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,_transparent_35%,_rgba(40,28,10,0.22)_72%,_rgba(20,14,6,0.48)_100%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#2a1c0a]/20 via-transparent to-[#1a1208]/35" />
      </div>

      <div className="pointer-events-none absolute inset-0 z-[1]" aria-hidden="true">
        <CornerFlourish className="absolute left-2 top-2 h-16 w-16 text-gold-600/45 sm:left-4 sm:top-4 sm:h-20 sm:w-20" />
        <CornerFlourish className="absolute right-2 top-2 h-16 w-16 rotate-90 text-gold-600/45 sm:right-4 sm:top-4 sm:h-20 sm:w-20" />
        <CornerFlourish className="absolute bottom-2 left-2 h-16 w-16 -rotate-90 text-gold-600/45 sm:bottom-4 sm:left-4 sm:h-20 sm:w-20" />
        <CornerFlourish className="absolute bottom-2 right-2 h-16 w-16 rotate-180 text-gold-600/45 sm:bottom-4 sm:right-4 sm:h-20 sm:w-20" />
      </div>

      <div className="relative z-10 mx-auto max-w-3xl px-6 py-10 sm:py-14">
        <div
          className="pointer-events-none absolute -left-16 top-20 h-64 w-64 animate-candle-flicker rounded-full bg-[radial-gradient(circle,_rgba(212,170,60,0.2)_0%,_transparent_70%)] blur-2xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -right-12 bottom-24 h-52 w-52 animate-candle-flicker rounded-full bg-[radial-gradient(circle,_rgba(61,107,79,0.18)_0%,_transparent_70%)] blur-2xl [animation-delay:0.7s]"
          aria-hidden="true"
        />

        <Link href="/browse" className="preference-codex-box--nav relative mb-10">
          <ArrowLeft className="h-4 w-4" />
          <span className="relative z-[1] nav-dragon-gold">Back to the Archives</span>
        </Link>

        <header className="relative mb-8 text-center sm:mb-10 sm:text-left">
          <div className="section-label metallic-emerald-darker justify-center !text-xs !font-bold tracking-[0.32em] sm:justify-start">
            <Crown className="h-3.5 w-3.5 text-[#0a1f18]" />
            LorePath Premium
          </div>
          <h1 className="metallic-emerald-deep mt-2 font-storybook text-4xl font-normal tracking-[0.06em] sm:text-5xl">
            Paid Features
          </h1>
          <div
            className="mx-auto mt-3 h-px w-40 bg-gradient-to-r from-transparent via-gold-600/70 to-transparent sm:mx-0"
            aria-hidden="true"
          />

          <div className="preference-codex-box relative mt-7 text-left">
            <CodexBoxOrnament />
            <p className="relative z-[3] px-1 font-heading text-xl leading-relaxed tracking-wide metallic-gold-soft sm:text-2xl">
              {email ? (
                <>
                  Welcome back,{" "}
                  <span className="font-semibold metallic-gold">{email}</span>.
                  These tools wait beyond the trial for readers who want a finer
                  path through the shelves.
                </>
              ) : (
                <>
                  These tools wait beyond the trial for readers who want a finer
                  path through the shelves.
                </>
              )}
            </p>
          </div>
        </header>

        <section
          aria-labelledby="premium-features-heading"
          className="preference-codex-box relative"
        >
          <CodexBoxOrnament />
          <div className="relative z-[3] mb-5 flex items-start gap-3 px-1">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-gold-600/50 bg-gradient-to-br from-gold-500/30 to-transparent text-accent">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="font-storybook text-[11px] font-bold uppercase tracking-[0.28em] nav-dragon-gold">
                The Premium Codex
              </p>
              <h2
                id="premium-features-heading"
                className="mt-1 font-storybook text-2xl font-bold tracking-[0.08em] nav-dragon-gold"
              >
                What awaits subscribers
              </h2>
            </div>
          </div>

          <ul className="relative z-[3] space-y-3 px-1">
            {PREMIUM_FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <li
                  key={feature.title}
                  className="rounded-sm border border-gold-600/35 bg-forest-950/45 px-4 py-3.5"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-gold-600/40 bg-forest-950/50 text-accent">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-storybook text-base font-bold tracking-[0.06em] nav-dragon-gold sm:text-lg">
                        {feature.title}
                      </p>
                      <p
                        className="mt-1.5 font-heading text-sm font-medium leading-relaxed tracking-wide sm:text-base sm:leading-snug"
                        style={{ color: "#f3e6c4" }}
                      >
                        {feature.description}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
