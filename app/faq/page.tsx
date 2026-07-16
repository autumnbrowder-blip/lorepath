import { CodexBoxOrnament } from "@/components/preferences/CodexBoxOrnament";
import { CornerFlourish } from "@/components/theme/FantasyDecor";
import {
  BookOpen,
  Compass,
  Feather,
  Hourglass,
  Library,
  Scale,
  ScrollText,
  Sparkles,
  Stars,
} from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "FAQ | LorePath",
  description:
    "Friendly answers from the LorePath classroom — Beta details, what you can try today, and how new books find their way here.",
};

const betaFeatures = [
  "Search for stories across the growing LorePath library",
  "Rate books and leave clear notes on tone, content, and pacing",
  "View community ratings from other readers",
  "Set preferences in the Preferences Codex as it grows",
  "Match Score — free for every signed-in account during Beta",
  "Share feedback that helps guide what we build next",
];

const upcomingFeatures = [
  "Advanced preferences and filters",
  "Multiple saved profiles",
  "Book recommendations matched to your preferences",
  "See your reading history in one place",
  "Wishlist",
  "Mobile app",
  "New avatars",
  '"Surprise Me" Button',
  "Quick Rate from Browse",
];

const ratingScaleOverview = [
  { level: 0, meaning: "None / lowest — the category is absent or at its minimum" },
  { level: 1, meaning: "Very mild or minor presence" },
  { level: 2, meaning: "Some presence, still moderate overall" },
  { level: 3, meaning: "Clear, noticeable presence throughout" },
  { level: 4, meaning: "Strong or prominent — a major part of the book" },
  { level: 5, meaning: "Highest — central, intense, or extreme for that category" },
];

const ratingCategoryGuides = [
  {
    label: "Pacing",
    blurb: "How fast or slow the story moves.",
    levels: [
      "0 — Very Slow: heavy on description and character development",
      "1 — Slow: more atmosphere and detail",
      "2 — Moderate: quieter stretches mixed with quicker spurts",
      "3 — Fast: steady momentum",
      "4 — Very Fast: little downtime",
      "5 — Breakneck: extremely fast; can feel rushed",
    ],
  },
  {
    label: "Horror",
    blurb: "Frightening, violent, or disturbing content.",
    levels: [
      "0 — None",
      "1 — Mild: light tension or minimal scares",
      "2 — Moderate: some horror and unsettling moments",
      "3 — Dark: strong horror themes and tension",
      "4 — Intense: heavy horror, graphic violence, strong psychological elements",
      "5 — Extreme: very graphic horror, gore, and multiple potential triggers",
    ],
  },
  {
    label: "Sexual Content",
    blurb: "Romance, intimacy, or sexual themes.",
    levels: [
      "0 — None",
      "1 — PG: very mild",
      "2 — PG-13: some tension or mild scenes",
      "3 — R: moderate, more descriptive",
      "4 — Mature: explicit scenes, but not the main focus",
      "5 — Adult: heavy smut / very explicit",
    ],
  },
  {
    label: "LGBTQ+",
    blurb: "LGBTQ+ characters, relationships, or themes.",
    levels: [
      "0 — None",
      "1 — Very Minor: brief or very small roles",
      "2 — Minor: present, but not central",
      "3 — Moderate: a noticeable supporting role",
      "4 — Major: significant to the story",
      "5 — Central: the main focus of the book",
    ],
  },
  {
    label: "Social & Political Themes in Stories",
    blurb: "How much social or political messaging appears in the story.",
    levels: [
      "0 — None: no noticeable messaging",
      "1 — Minimal",
      "2 — Subtle: present but understated",
      "3 — Noticeable: clear themes throughout",
      "4 — Prominent: a major part of the book",
      "5 — Central: primarily focused on these themes",
    ],
  },
] as const;

function SectionCard({
  icon: Icon,
  title,
  eyebrow,
  children,
}: {
  icon: typeof BookOpen;
  title: string;
  eyebrow: string;
  children: ReactNode;
}) {
  return (
    <section className="preference-codex-box relative">
      <CodexBoxOrnament />
      <div className="relative z-[3] mb-4 flex items-start gap-3 px-1">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-gold-600/50 bg-gradient-to-br from-gold-500/30 to-transparent text-accent">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="font-storybook text-[11px] font-bold uppercase tracking-[0.28em] nav-dragon-gold">
            {eyebrow}
          </p>
          <h2 className="mt-1 font-storybook text-2xl font-bold tracking-[0.08em] nav-dragon-gold">
            {title}
          </h2>
        </div>
      </div>
      <div className="relative z-[3] space-y-3 px-1">{children}</div>
    </section>
  );
}

export default function FaqPage() {
  return (
    <div className="faq-page">
      {/* Full-page classroom scene — stretches with content and scrolls with it */}
      <div className="faq-page-scene" aria-hidden="true">
        <div className="absolute inset-y-0 left-0 w-full lg:w-[48%]">
          <Image
            src="/images/lorepath-faq-wizard-left.png"
            alt=""
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 48vw"
            className="object-cover object-[42%_center] opacity-90 lg:opacity-100"
          />
        </div>
        <div className="absolute inset-y-0 right-0 hidden w-[52%] lg:block">
          <Image
            src="/images/lorepath-faq-auditorium-amphitheater.png"
            alt=""
            fill
            priority
            sizes="52vw"
            className="object-cover object-[58%_center]"
          />
        </div>

        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,_rgba(8,16,12,0.55)_0%,_rgba(8,16,12,0.22)_38%,_transparent_68%)]" />
        <div className="absolute inset-y-0 left-[42%] hidden w-[16%] bg-gradient-to-r from-transparent via-[#07120c]/35 to-transparent lg:block" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#07120c]/40 via-transparent to-[#050a08]/72" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_18%_70%,_rgba(166,124,45,0.12)_0%,_transparent_45%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_88%_35%,_rgba(61,107,79,0.14)_0%,_transparent_42%)]" />

        <div className="absolute left-[12%] top-[22%] h-40 w-40 animate-candle-flicker rounded-full bg-[radial-gradient(circle,_rgba(240,215,138,0.22)_0%,_transparent_70%)] blur-2xl" />
        <div className="absolute right-[14%] top-[30%] h-48 w-48 animate-candle-flicker rounded-full bg-[radial-gradient(circle,_rgba(240,215,138,0.18)_0%,_transparent_70%)] blur-2xl [animation-delay:0.8s]" />

        <CornerFlourish className="absolute left-2 top-2 h-16 w-16 text-gold-500/55 sm:left-4 sm:top-4 sm:h-20 sm:w-20" />
        <CornerFlourish className="absolute right-2 top-2 h-16 w-16 rotate-90 text-gold-500/55 sm:right-4 sm:top-4 sm:h-20 sm:w-20" />
        <CornerFlourish className="absolute bottom-2 left-2 h-16 w-16 -rotate-90 text-gold-500/55 sm:bottom-4 sm:left-4 sm:h-20 sm:w-20" />
        <CornerFlourish className="absolute bottom-2 right-2 h-16 w-16 rotate-180 text-gold-500/55 sm:bottom-4 sm:right-4 sm:h-20 sm:w-20" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-4.5rem)] max-w-3xl flex-col justify-start px-4 py-10 sm:px-6 sm:py-14">
        <header className="mb-7 text-center">
          <p className="mx-auto flex items-center justify-center gap-2 font-storybook text-xs font-bold uppercase tracking-[0.32em] nav-dragon-gold drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)]">
            <Sparkles className="h-3.5 w-3.5 text-[#f0d78a]" />
            From the Wizard&apos;s Desk
          </p>
          <h1 className="mt-3 font-storybook text-4xl font-bold tracking-[0.06em] nav-dragon-gold drop-shadow-[0_4px_18px_rgba(0,0,0,0.5)] sm:text-5xl">
            Frequently Asked Questions
          </h1>
          <p className="mx-auto mt-3 max-w-xl font-heading text-lg leading-relaxed nav-dragon-gold drop-shadow-[0_2px_12px_rgba(0,0,0,0.75)]">
            Sit among the students in the enchanted classroom — open the
            professor&apos;s tome for answers about Beta, the road ahead, and
            how new books find their way to LorePath.
          </p>
        </header>

        <div className="preference-codex-box relative mb-7 text-center">
          <CodexBoxOrnament />
          <div className="relative z-[3] px-1 py-1">
            <p className="font-storybook text-sm font-bold uppercase tracking-[0.22em] nav-dragon-gold">
              Welcome
            </p>
            <p className="mt-3 font-heading text-lg leading-relaxed nav-dragon-gold">
              Welcome to the LorePath Beta. Everything is free while we build
              something magical together. Your ratings and feedback help shape
              the stories ahead — thank you for being here.
            </p>
          </div>
        </div>

        <div className="book-detail-tome faq-tome relative shadow-[0_28px_70px_rgba(0,0,0,0.55)]">
          <div className="book-detail-tome-parchment faq-tome-parchment" aria-hidden="true" />
          <CornerFlourish className="pointer-events-none absolute left-1 top-1 z-20 h-14 w-14 text-[#a67c2d]/70 sm:left-2 sm:top-2 sm:h-16 sm:w-16" />
          <CornerFlourish className="pointer-events-none absolute right-1 top-1 z-20 h-14 w-14 rotate-90 text-[#a67c2d]/70 sm:right-2 sm:top-2 sm:h-16 sm:w-16" />
          <CornerFlourish className="pointer-events-none absolute bottom-1 left-1 z-20 h-14 w-14 -rotate-90 text-[#a67c2d]/70 sm:bottom-2 sm:left-2 sm:h-16 sm:w-16" />
          <CornerFlourish className="pointer-events-none absolute bottom-1 right-1 z-20 h-14 w-14 rotate-180 text-[#a67c2d]/70 sm:bottom-2 sm:right-2 sm:h-16 sm:w-16" />

          <div className="book-detail-tome-content relative z-[2] space-y-6 p-5 sm:p-8">
            <SectionCard
              icon={ScrollText}
              eyebrow="Chapter I"
              title="What is the LorePath Beta?"
            >
              <p className="font-heading text-lg leading-relaxed nav-dragon-gold">
                LorePath Beta is the early chapter of our story — a living archive
                where everything remains free while we listen, learn, and gather
                ratings and feedback from readers like you. Think of it as an open
                classroom: the shelves are ready, the candles are lit, and your
                voice helps us shape what LorePath becomes next.
              </p>
            </SectionCard>

            <SectionCard
              icon={Hourglass}
              eyebrow="Chapter II"
              title="How long will the Beta last?"
            >
              <p className="font-heading text-lg leading-relaxed nav-dragon-gold">
                We expect the Beta to run for a few months while we polish the
                experience and grow alongside our community. We will share
                updates as the journey unfolds, so you will always know when the
                next chapter begins.
              </p>
            </SectionCard>

            <SectionCard
              icon={Feather}
              eyebrow="Chapter III"
              title="What can I do during Beta?"
            >
              <p className="mb-3 font-heading text-lg leading-relaxed nav-dragon-gold">
                During Beta, you are welcome to explore freely. Here is what you
                can do today:
              </p>
              <ul className="space-y-2.5">
                {betaFeatures.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-3 rounded-sm border border-gold-600/30 bg-forest-950/45 px-4 py-3"
                  >
                    <Library className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    <span className="font-heading text-lg leading-snug nav-dragon-gold">
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>
            </SectionCard>

            <SectionCard
              icon={Stars}
              eyebrow="Chapter IV"
              title="What’s coming in the future?"
            >
              <p className="mb-3 font-heading text-lg leading-relaxed nav-dragon-gold">
                After Beta, we hope to add more tools that make finding the right
                book easier. Here is what we have planned:
              </p>
              <ul className="space-y-2.5">
                {upcomingFeatures.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-3 rounded-sm border border-gold-600/30 bg-forest-950/45 px-4 py-3"
                  >
                    <Compass className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    <span className="font-heading text-lg leading-snug nav-dragon-gold">
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>
            </SectionCard>

            <SectionCard
              icon={BookOpen}
              eyebrow="Chapter V"
              title="How do new books get added?"
            >
              <p className="font-heading text-lg leading-relaxed nav-dragon-gold">
                New and recently published titles are added regularly so the
                catalog stays fresh. Over time, the library continues to grow
                with both new releases and older works for readers to explore.
              </p>
            </SectionCard>

            <SectionCard
              icon={Scale}
              eyebrow="Chapter VI · Ratings Explained"
              title="How Do the Ratings Work?"
            >
              <p className="font-heading text-lg leading-relaxed nav-dragon-gold">
                LorePath uses a shared 0–5 scale for each content category. The
                numbers mean the same idea everywhere: lower scores mean little
                or none of that element; higher scores mean more of it. Ratings
                describe what is in the book — not whether the book is “good” or
                “bad.”
              </p>

              <p className="mt-4 font-storybook text-sm font-bold uppercase tracking-[0.2em] nav-dragon-gold">
                Understanding the 0–5 Scale
              </p>
              <ul className="mt-2.5 space-y-2">
                {ratingScaleOverview.map(({ level, meaning }) => (
                  <li
                    key={level}
                    className="flex items-start gap-3 rounded-sm border border-gold-600/30 bg-forest-950/45 px-4 py-3"
                  >
                    <span className="inline-flex h-6 min-w-[1.5rem] shrink-0 items-center justify-center rounded-sm border border-gold-600/50 bg-gradient-to-br from-gold-600 to-gold-500 px-1.5 font-storybook text-xs font-bold text-forest-950">
                      {level}
                    </span>
                    <span className="font-heading text-lg leading-snug nav-dragon-gold">
                      {meaning}
                    </span>
                  </li>
                ))}
              </ul>

              <p className="mt-5 font-storybook text-sm font-bold uppercase tracking-[0.2em] nav-dragon-gold">
                Category details
              </p>
              <p className="mt-2 font-heading text-lg leading-relaxed nav-dragon-gold">
                Open a category below for how readers typically use each number.
                Pacing is about tempo; the others measure how much of that
                content appears.
              </p>
              <div className="mt-3 space-y-2.5">
                {ratingCategoryGuides.map((category) => (
                  <details
                    key={category.label}
                    className="faq-rating-details rounded-sm border border-gold-600/40 bg-forest-950/45 open:border-gold-600/55 open:bg-forest-950/60"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-heading text-lg font-semibold nav-dragon-gold outline-none marker:content-none [&::-webkit-details-marker]:hidden">
                      <span>{category.label}</span>
                      <span
                        aria-hidden="true"
                        className="faq-rating-caret shrink-0 font-storybook text-xs font-bold uppercase tracking-[0.18em] text-[#e2c06a]/80"
                      >
                        ▾
                      </span>
                    </summary>
                    <div className="border-t border-gold-600/25 px-4 pb-3.5 pt-2.5">
                      <p className="font-heading text-base leading-snug text-[#e2c06a]/85">
                        {category.blurb}
                      </p>
                      <ul className="mt-2.5 space-y-1.5">
                        {category.levels.map((line) => (
                          <li
                            key={line}
                            className="font-heading text-base leading-snug nav-dragon-gold"
                          >
                            {line}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </details>
                ))}
              </div>
            </SectionCard>

            <div className="preference-codex-box relative text-center">
              <CodexBoxOrnament />
              <div className="relative z-[3] px-1 py-1">
                <p className="font-storybook text-sm font-bold uppercase tracking-[0.22em] nav-dragon-gold">
                  Ready to turn a page?
                </p>
                <p className="mt-3 font-heading text-lg leading-relaxed nav-dragon-gold">
                  Thank you for sitting with us in this early chapter. When you
                  are ready, start a new journey in{" "}
                  <Link
                    href="/browse"
                    className="font-semibold nav-dragon-gold underline decoration-gold-500/60 underline-offset-4 transition hover:brightness-125"
                  >
                    Browse
                  </Link>
                  .
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
