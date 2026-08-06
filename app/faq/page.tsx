import { CodexBoxOrnament } from "@/components/preferences/CodexBoxOrnament";
import { CornerFlourish } from "@/components/theme/FantasyDecor";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import {
  BarChart3,
  BookOpen,
  Compass,
  Feather,
  Hourglass,
  Library,
  Scale,
  ScrollText,
  Sparkles,
  Stars,
  Target,
  UserPlus,
} from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "FAQ | LorePath",
  description:
    "LorePath is a book rating platform — Beta answers on ratings, Match Score, preferences, and how new books find their way here.",
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
    label: "Romance",
    blurb:
      "How central romantic love is to the story — separate from Spice Level.",
    levels: [
      "0 — None: no romantic subplot or romantic focus",
      "1 — Hint: a faint spark of romance in the background",
      "2 — Light: romantic threads weave through the tale",
      "3 — Moderate: romance plays a clear supporting role",
      "4 — Strong: romance is a major thread of the story",
      "5 — Central: the heart of the tale is romance itself",
    ],
  },
  {
    label: "Spice Level",
    blurb:
      "How explicit the intimacy is (formerly Sexual Content) — steamy scenes and intensity, not whether a romance exists.",
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

export default async function FaqPage() {
  let isLoggedIn = false;

  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      isLoggedIn = !!user;
    } catch {
      isLoggedIn = false;
    }
  }

  const signupHref = isLoggedIn ? "/preferences" : "/register";

  return (
    <div className="faq-page">
      {/* Same viewport-locked library scene as the homepage hero */}
      <div className="faq-page-scene" aria-hidden="true">
        <div className="scroll-parallax-layer" data-scroll-parallax="">
          <Image
            src="/images/lorepath-library-hero.png"
            alt=""
            fill
            priority
            sizes="100vw"
            className="faq-page-scene-image"
          />
        </div>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_38%,_rgba(7,14,10,0.1)_0%,_rgba(7,14,10,0.5)_55%,_rgba(4,8,6,0.9)_100%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#070e0a]/65 via-transparent to-[#070e0a]/92" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#070e0a]/40 via-transparent to-[#070e0a]/40" />
        {/* Candlelight pools — matches homepage */}
        <div className="absolute bottom-[8%] left-[12%] h-56 w-56 animate-candle-flicker rounded-full bg-[radial-gradient(circle,_rgba(212,170,60,0.22)_0%,_transparent_70%)] blur-2xl" />
        <div className="absolute bottom-[12%] right-[14%] h-48 w-48 animate-candle-flicker rounded-full bg-[radial-gradient(circle,_rgba(184,148,31,0.18)_0%,_transparent_70%)] blur-2xl [animation-delay:0.9s]" />
        <div className="absolute left-1/2 top-[32%] h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,_rgba(212,184,74,0.12)_0%,_transparent_68%)] blur-2xl" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-4.5rem)] max-w-3xl flex-col justify-start px-4 py-7 sm:px-6 sm:py-14">
        <header className="mb-5 text-center sm:mb-7">
          <p className="mx-auto flex items-center justify-center gap-2 font-storybook text-[11px] font-bold uppercase tracking-[0.28em] nav-dragon-gold sm:text-xs sm:tracking-[0.32em]">
            <Sparkles className="h-3.5 w-3.5 text-[#f0d78a]" />
            From the Wizard&apos;s Desk
          </p>
          <h1 className="mt-2.5 font-storybook text-3xl font-bold tracking-[0.05em] nav-dragon-gold sm:mt-3 sm:text-4xl md:text-5xl sm:tracking-[0.06em]">
            Frequently Asked Questions
          </h1>
        </header>

        <div className="book-detail-tome faq-tome relative shadow-[0_28px_70px_rgba(0,0,0,0.55)]">
          <div className="book-detail-tome-parchment faq-tome-parchment" aria-hidden="true" />
          <CornerFlourish className="pointer-events-none absolute left-1 top-1 z-20 h-12 w-12 text-[#a67c2d]/70 sm:left-2 sm:top-2 sm:h-16 sm:w-16" />
          <CornerFlourish className="pointer-events-none absolute right-1 top-1 z-20 h-12 w-12 rotate-90 text-[#a67c2d]/70 sm:right-2 sm:top-2 sm:h-16 sm:w-16" />
          <CornerFlourish className="pointer-events-none absolute bottom-1 left-1 z-20 h-12 w-12 -rotate-90 text-[#a67c2d]/70 sm:bottom-2 sm:left-2 sm:h-16 sm:w-16" />
          <CornerFlourish className="pointer-events-none absolute bottom-1 right-1 z-20 h-12 w-12 rotate-180 text-[#a67c2d]/70 sm:bottom-2 sm:right-2 sm:h-16 sm:w-16" />

          <div className="book-detail-tome-content relative z-[2] space-y-5 p-4 sm:space-y-6 sm:p-8">
            <SectionCard
              icon={Stars}
              eyebrow="A note from the Archives"
              title="Content ratings, not star ratings"
            >
              <p className="font-heading text-lg leading-relaxed nav-dragon-gold">
                LorePath does not use the traditional star rating system as
                others do. There are no five-star crowns for whether a book is
                &ldquo;good&rdquo; or &ldquo;bad.&rdquo;
              </p>
              <p className="font-heading text-lg leading-relaxed nav-dragon-gold">
                Instead, readers mark the content itself — spice, pacing, horror,
                and more — so you can sense a book&apos;s tone before you begin.
                Think of each mark as a lantern on a dark winding path: it lights
                what lies in wait without ruining the plot, not whether the
                journey deserves high praise or tomato-hurling.
              </p>
            </SectionCard>

            <SectionCard
              icon={ScrollText}
              eyebrow="Chapter 1 of 8 · The Path Begins"
              title="Chapter 1 · What is the LorePath Beta?"
            >
              <p className="font-heading text-lg leading-relaxed nav-dragon-gold">
                LorePath is a rating platform for books of every genre.
              </p>
              <p className="font-heading text-lg leading-relaxed nav-dragon-gold">
                Here you rate books across content themes (pacing, horror, romance,
                spice, and more), set your preferences in the Preferences Codex, and
                receive a Match Score that shows how well each tome fits the kind of
                journey you want. Think of it as an open classroom: the shelves are
                ready, the candles are lit, and every rating helps fellow wanderers
                choose their next adventure.
              </p>
            </SectionCard>

            <SectionCard
              icon={Scale}
              eyebrow="Chapter 2 of 8 · Ratings Explained"
              title="Chapter 2 · How Do the Ratings Work?"
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
                    className="flex items-start gap-3 codex-inset px-4 py-3"
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
                Pacing is about tempo; Romance is about love-story focus; Spice
                Level is about explicitness; the others measure how much of that
                content appears.
              </p>
              <div className="mt-3 space-y-2.5">
                {ratingCategoryGuides.map((category) => (
                  <details
                    key={category.label}
                    className="faq-rating-details codex-inset open:border-gold-600/55 open:bg-[#184033]/70"
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

            <SectionCard
              icon={Target}
              eyebrow="Chapter 3 of 8 · Match Score"
              title="Chapter 3 · How Does the Match Score Work?"
            >
              <p className="font-heading text-lg leading-relaxed nav-dragon-gold">
                Your Match Score is a friendly percentage that shows how well a
                book fits the preferences you set in the Preferences Codex.
                Think of it as a compass for each tome: the higher the number,
                the closer the community&apos;s ratings land to what you enjoy —
                and what you prefer to leave on the shelf.
              </p>
              <p className="font-heading text-lg leading-relaxed nav-dragon-gold">
                We compare the community average for each category to your
                preference settings, score every category from 0–100%, then
                average those scores into one Match Score. Categories with a
                comfort ceiling (like Horror or Spice Level) stay at 100% when
                the book sits at or below your limit, and drop as the book goes
                over it. Categories with a preferred level (like Pacing) score
                higher the closer the book lands to the number you chose
                (Romance works the same way as Pacing).
              </p>
              <p className="font-heading text-lg leading-relaxed nav-dragon-gold">
                A high score means the story&apos;s tone and content are likely a
                good fit for you. A lower score is a gentle heads-up that the
                book may wander outside your comfort zone. Rough guide: around
                90%+ is an excellent match, 75%+ is good, 50%+ is moderate, and
                lower scores mean a weaker fit. During Beta, Match Score is free
                for every signed-in reader.
              </p>

              <div className="codex-inset px-4 py-3">
                <p className="font-heading text-base leading-snug nav-dragon-gold">
                  Tip from the desk: set your preferences first, then open any
                  book — your Match Score appears at the top of the right-hand
                  column once community ratings are in place.
                </p>
              </div>
            </SectionCard>

            <SectionCard
              icon={BarChart3}
              eyebrow="Chapter 4 of 8 · Reading Stats"
              title="Chapter 4 · What Does “Your Average Mark” Mean?"
            >
              <p className="font-heading text-lg leading-relaxed nav-dragon-gold">
                On your Reading Stats page,{" "}
                <span className="font-semibold">Your Average Mark</span> is a
                single number that gathers every content rating you have left
                across the archives — Spice Level, Romance, Horror, Pacing,
                LGBTQ+ Representation, Social &amp; Political Themes, and the
                rest — and averages them into one score on the familiar 0–5
                scale.
              </p>
              <p className="font-heading text-lg leading-relaxed nav-dragon-gold">
                Think of it as a quick glance at your rating style: are you a
                gentle marker who tends toward quieter tales, or do your marks
                often climb toward richer spice, sharper horror, or faster
                pacing? It does not judge whether a book was “good” or “bad” —
                it simply reflects the kinds of content you tend to note when
                you rate.
              </p>
              <p className="font-heading text-lg leading-relaxed nav-dragon-gold">
                Use it as a snapshot of your journey so far. For a finer map of
                where your marks land, look at{" "}
                <span className="font-semibold">Marks by category</span> on the
                same page — that breakdown shows your average in each theme on
                its own.
              </p>

              <div className="codex-inset px-4 py-3">
                <p className="font-heading text-base leading-snug nav-dragon-gold">
                  Tip from the desk: open{" "}
                  <Link
                    href="/stats"
                    className="font-semibold nav-dragon-gold underline decoration-gold-500/60 underline-offset-4 transition hover:brightness-125"
                  >
                    Reading Stats
                  </Link>{" "}
                  anytime to see Your Average Mark update as you rate more
                  tomes.
                </p>
              </div>
            </SectionCard>

            <SectionCard
              icon={Feather}
              eyebrow="Chapter 5 of 8 · Beta Capabilities"
              title="Chapter 5 · What can I do during Beta?"
            >
              <p className="mb-3 font-heading text-lg leading-relaxed nav-dragon-gold">
                During Beta, you are welcome to explore freely. Here is what you
                can do today:
              </p>
              <ul className="space-y-2.5">
                {betaFeatures.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-3 codex-inset px-4 py-3"
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
              eyebrow="Chapter 6 of 8 · The Road Ahead"
              title="Chapter 6 · What’s coming in the future?"
            >
              <p className="mb-3 font-heading text-lg leading-relaxed nav-dragon-gold">
                After Beta, we hope to add more tools that make finding the right
                book easier. Here is what we have planned:
              </p>
              <ul className="space-y-2.5">
                {upcomingFeatures.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-3 codex-inset px-4 py-3"
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
              icon={Hourglass}
              eyebrow="Chapter 7 of 8 · The Timeline"
              title="Chapter 7 · How long will the Beta last?"
            >
              <p className="font-heading text-lg leading-relaxed nav-dragon-gold">
                We expect the Beta to run for a few months while we polish the
                experience and grow alongside our community. We will share
                updates as the journey unfolds, so you will always know when the
                next chapter begins.
              </p>
            </SectionCard>

            <SectionCard
              icon={BookOpen}
              eyebrow="Chapter 8 of 8 · The Growing Library"
              title="Chapter 8 · How do new books get added?"
            >
              <p className="font-heading text-lg leading-relaxed nav-dragon-gold">
                New and recently published titles are added regularly so the
                catalog stays fresh. Over time, the library continues to grow
                with both new releases and older works for readers to explore.
              </p>
            </SectionCard>

            <div className="preference-codex-box relative text-center">
              <CodexBoxOrnament />
              <div className="relative z-[3] flex flex-col items-center px-1 py-2">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-sm border border-gold-600/50 bg-gradient-to-br from-gold-500/30 to-transparent text-accent">
                  <UserPlus className="h-5 w-5" />
                </div>
                <p className="font-storybook text-[11px] font-bold uppercase tracking-[0.28em] nav-dragon-gold">
                  Join the archives
                </p>
                <h2 className="mt-1 font-storybook text-2xl font-bold tracking-[0.08em] nav-dragon-gold">
                  Sign up for free
                </h2>
                <p className="mt-3 max-w-md font-heading text-lg leading-relaxed nav-dragon-gold">
                  Create your free account to leave marks and set your reading
                  preferences.
                </p>
                <Link
                  href={signupHref}
                  className="btn-primary mt-5 px-8 py-3.5 text-center normal-case tracking-[0.06em]"
                >
                  <ScrollText className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Create free account
                </Link>
              </div>
            </div>

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
