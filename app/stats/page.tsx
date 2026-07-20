import { CodexBoxOrnament } from "@/components/preferences/CodexBoxOrnament";
import { AvatarCrest } from "@/components/profile/AvatarCrest";
import { FantasyPageShell } from "@/components/theme/FantasyPageShell";
import {
  getAvatarOption,
  resolveAvatarKey,
  resolveDisplayName,
} from "@/lib/avatars";
import {
  PREFERENCE_CATEGORIES,
  RATING_CATEGORIES,
} from "@/lib/rating-categories";
import { getUserReadingStats } from "@/lib/ratings";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { ContentRating } from "@/types";
import { ArrowLeft, BarChart3, BookOpen, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Reading Stats | LorePath",
  description:
    "A ledger of the books you have rated and the marks you leave across categories.",
};

type PreferenceLevel = 0 | 1 | 2 | 3 | 4 | 5;

function preferenceFor(key: keyof ContentRating) {
  return PREFERENCE_CATEGORIES.find((item) => item.key === key);
}

function nearestLevel(value: number): PreferenceLevel {
  return Math.min(5, Math.max(0, Math.round(value))) as PreferenceLevel;
}

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-sm border border-gold-600/35 bg-forest-950/45 px-4 py-4">
      <p className="font-display text-[10px] uppercase tracking-[0.2em] nav-dragon-gold">
        {label}
      </p>
      <p className="mt-2 font-storybook text-2xl font-bold tabular-nums leading-none nav-dragon-gold sm:text-3xl">
        {value}
      </p>
      {hint ? (
        <p className="mt-2 font-heading text-sm leading-snug text-[#e2c06a]/85">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function CategoryBar({
  categoryKey,
  label,
  value,
  index,
}: {
  categoryKey: keyof ContentRating;
  label: string;
  value: number;
  index: number;
}) {
  const preference = preferenceFor(categoryKey);
  const blurb = preference?.levelDescriptions?.[nearestLevel(value)];
  const width = `${(value / 5) * 100}%`;

  return (
    <div
      className="rounded-sm border border-gold-600/35 bg-forest-950/45 px-3 py-3"
      style={{ animationDelay: `${index * 45}ms` }}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-heading text-base font-semibold leading-snug nav-dragon-gold sm:text-lg">
            {label}
          </p>
          {blurb ? (
            <p className="mt-1 font-heading text-sm leading-snug tracking-wide text-[#e2c06a]/85">
              {blurb}
            </p>
          ) : null}
        </div>
        <span className="inline-flex shrink-0 flex-col items-end">
          <span className="font-storybook text-xl font-bold tabular-nums leading-none nav-dragon-gold sm:text-2xl">
            {value.toFixed(1)}
          </span>
          <span className="mt-0.5 font-heading text-xs nav-dragon-gold/80">
            out of 5
          </span>
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-sm border border-gold-600/25 bg-forest-950/70">
        <div
          className="h-full rounded-sm bg-gradient-to-r from-gold-700 via-gold-500 to-gold-300 transition-all duration-500"
          style={{ width }}
        />
      </div>
    </div>
  );
}

export default async function ReadingStatsPage() {
  if (!isSupabaseConfigured()) {
    redirect("/login?redirect=/stats");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/stats");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_key")
    .eq("id", user.id)
    .maybeSingle();

  const displayName = resolveDisplayName(
    typeof profile?.display_name === "string" ? profile.display_name : null,
    user.user_metadata as Record<string, unknown> | undefined,
    user.email
  );
  const avatarKey = resolveAvatarKey(profile?.avatar_key);
  const avatar = getAvatarOption(avatarKey);

  const stats = await getUserReadingStats(user.id);
  const hasRatings = stats.totalBooksRated > 0 && stats.byCategory !== null;
  const spotlight =
    stats.topGenre ?? stats.topContentCategory?.label ?? null;
  const spotlightHint = stats.topGenre
    ? "Most common genre among your rated tomes"
    : stats.topContentCategory
      ? "Highest average content mark you leave"
      : undefined;

  return (
    <FantasyPageShell>
      <div className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
        <Link href="/browse" className="preference-codex-box--nav relative mb-10">
          <ArrowLeft className="h-4 w-4" />
          <span className="relative z-[1] nav-dragon-gold">Back to the Archives</span>
        </Link>

        <header className="mb-8 text-center sm:mb-10 sm:text-left">
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start sm:gap-6">
            <AvatarCrest
              avatarKey={avatarKey}
              variant="display"
              className="h-40 w-40 sm:h-44 sm:w-44 md:h-48 md:w-48"
              size={192}
              title={avatar.label}
            />
            <div className="min-w-0 sm:pt-1">
              <h1 className="page-title nav-dragon-gold">
                {displayName} Reading Stats
              </h1>
              <p className="mt-2 font-heading text-lg nav-dragon-gold">
                A quiet tally of the marks you leave across the archives.
              </p>
            </div>
          </div>
        </header>

        <div className="parchment-panel space-y-6 px-6 py-8 sm:px-8">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile
              label="Tomes rated"
              value={String(stats.totalBooksRated)}
              hint={
                stats.totalBooksRated === 0
                  ? "Open a book and leave your first mark"
                  : undefined
              }
            />
            <StatTile
              label="Your average mark"
              value={
                stats.overallAverage !== null
                  ? stats.overallAverage.toFixed(1)
                  : "—"
              }
              hint="Across every content rating you've left — Spice, Romance, Horror, Pacing, and more"
            />
            <StatTile
              label="Most marked"
              value={spotlight ?? "—"}
              hint={spotlightHint}
            />
          </div>

          <div
            className="h-px w-full bg-gradient-to-r from-transparent via-gold-600/50 to-transparent"
            aria-hidden="true"
          />

          <section
            aria-labelledby="reading-stats-breakdown-heading"
            className="preference-codex-box animate-fade-in-up relative flex h-auto flex-col self-start"
          >
            <CodexBoxOrnament />
            <div className="relative z-[3] mb-3 flex items-center gap-2.5 px-0.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-gold-600/50 bg-gradient-to-br from-gold-500/30 to-transparent text-accent">
                <BarChart3 className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h2
                  id="reading-stats-breakdown-heading"
                  className="font-storybook text-base font-bold tracking-[0.1em] nav-dragon-gold sm:text-lg"
                >
                  Marks by category
                </h2>
                <p className="font-heading text-sm nav-dragon-gold">
                  Your average rating in each content field
                </p>
              </div>
            </div>

            <div className="relative z-[3] px-0.5">
              {!hasRatings ? (
                <div className="mb-3 rounded-sm border border-dashed border-gold-600/35 bg-forest-950/45 px-3 py-2.5">
                  <p className="font-heading text-sm leading-snug nav-dragon-gold">
                    No ratings yet — browse the archives and inscribe your first
                    tome.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {RATING_CATEGORIES.map((category, index) => {
                    const preference = preferenceFor(category.key);
                    return (
                      <CategoryBar
                        key={category.key}
                        categoryKey={category.key}
                        label={preference?.label ?? category.label}
                        value={stats.byCategory![category.key]}
                        index={index}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <Link href="/rated" className="btn-secondary inline-flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Your rated tomes
            </Link>
            <Link href="/browse" className="btn-secondary inline-flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Browse books
            </Link>
          </div>
        </div>
      </div>
    </FantasyPageShell>
  );
}
