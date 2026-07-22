import { AvatarCrest } from "@/components/profile/AvatarCrest";
import { FantasyPageShell } from "@/components/theme/FantasyPageShell";
import {
  getAdminDashboardStats,
  requireAdmin,
  type AdminRecentRating,
  type AdminUserRow,
} from "@/lib/admin";
import { RATING_CATEGORIES } from "@/lib/rating-categories";
import { BookOpen, ScrollText, Shield, Users } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin | LorePath",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

function StatTile({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Users;
}) {
  return (
    <div className="rounded-sm border border-gold-600/35 bg-forest-950/45 px-4 py-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-gold-600/50 bg-gradient-to-br from-gold-500/30 to-transparent text-accent">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
        <p className="font-display text-[10px] uppercase tracking-[0.2em] nav-dragon-gold">
          {label}
        </p>
      </div>
      <p className="font-storybook text-3xl font-bold tabular-nums leading-none nav-dragon-gold">
        {value}
      </p>
    </div>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function scoreChip(label: string, value: number) {
  return (
    <span
      key={label}
      className="inline-flex items-center gap-1 rounded-sm border border-gold-600/30 bg-forest-950/60 px-1.5 py-0.5 font-heading text-[11px] tabular-nums text-[#e2c06a]/90"
    >
      <span className="opacity-75">{label}</span>
      <span className="font-semibold text-[#f0d78a]">{value}</span>
    </span>
  );
}

function StatusPill({
  active,
  activeLabel,
  inactiveLabel,
}: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 font-display text-[10px] uppercase tracking-[0.14em] ${
        active
          ? "border-gold-500/55 bg-gold-500/15 text-[#f0d78a]"
          : "border-gold-600/25 bg-forest-950/50 text-[#e2c06a]/65"
      }`}
    >
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}

function RecentRatingRow({ rating }: { rating: AdminRecentRating }) {
  return (
    <li className="rounded-sm border border-gold-600/30 bg-forest-950/40 px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="min-w-0 font-heading text-base font-semibold leading-snug nav-dragon-gold sm:text-lg">
          {rating.book_title}
        </h3>
        <time
          dateTime={rating.created_at}
          className="shrink-0 font-display text-[10px] uppercase tracking-[0.16em] text-[#e2c06a]/75"
        >
          {formatDate(rating.created_at)}
        </time>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {RATING_CATEGORIES.map((category) =>
          scoreChip(category.label, rating[category.key])
        )}
      </div>
    </li>
  );
}

function UserRow({ user }: { user: AdminUserRow }) {
  const avatarCaption = user.avatarKey
    ? `${user.avatarLabel} · ${user.clan}`
    : "No crest chosen";

  return (
    <li className="rounded-sm border border-gold-600/30 bg-forest-950/40 px-3 py-3 sm:px-4">
      <div className="flex gap-3 sm:gap-4">
        <AvatarCrest
          avatarKey={user.avatarKey}
          className="h-12 w-12 shrink-0 rounded-sm sm:h-14 sm:w-14"
          size={56}
          title={avatarCaption}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="min-w-0 font-heading text-base font-semibold leading-snug nav-dragon-gold sm:text-lg">
              {user.name}
            </h3>
            <time
              dateTime={user.createdAt}
              className="shrink-0 font-display text-[10px] uppercase tracking-[0.16em] text-[#e2c06a]/75"
            >
              Joined {formatDate(user.createdAt)}
            </time>
          </div>

          <p className="mt-1 break-all font-heading text-sm text-[#e2c06a]/90">
            {user.email ?? (
              <span className="italic text-[#e2c06a]/65">
                {user.emailNote ?? "Email not accessible"}
              </span>
            )}
          </p>

          <p className="mt-1 font-heading text-sm text-[#e2c06a]/80">
            <span className="font-display text-[10px] uppercase tracking-[0.14em] text-[#e2c06a]/65">
              Crest
            </span>{" "}
            {user.avatarKey ?? "—"}
            <span className="text-[#e2c06a]/55"> · </span>
            {user.clan}
          </p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            <StatusPill
              active={user.isSubscriber}
              activeLabel="Subscriber"
              inactiveLabel="Free"
            />
            <StatusPill
              active={user.isAdmin}
              activeLabel="Admin"
              inactiveLabel="Traveler"
            />
          </div>
        </div>
      </div>
    </li>
  );
}

export default async function AdminPage() {
  await requireAdmin();
  const stats = await getAdminDashboardStats();

  return (
    <FantasyPageShell>
      <div className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
        <header className="mb-8 text-center sm:mb-10 sm:text-left">
          <p className="font-display text-[10px] uppercase tracking-[0.28em] text-[#e2c06a]/80">
            Restricted ledger
          </p>
          <h1 className="page-title mt-2 nav-dragon-gold">Admin Dashboard</h1>
          <p className="mt-2 font-heading text-lg nav-dragon-gold">
            A quiet tally of the realm — users, ratings, and recent marks.
          </p>
        </header>

        <div className="parchment-panel space-y-8 px-6 py-8 sm:px-8">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile
              label="Registered users"
              value={String(stats.totalUsers)}
              icon={Users}
            />
            <StatTile
              label="Ratings submitted"
              value={String(stats.totalRatings)}
              icon={ScrollText}
            />
            <StatTile
              label="Books with ratings"
              value={String(stats.booksWithRatings)}
              icon={BookOpen}
            />
          </div>

          <div
            className="h-px w-full bg-gradient-to-r from-transparent via-gold-600/50 to-transparent"
            aria-hidden="true"
          />

          <section aria-labelledby="admin-users-heading">
            <div className="mb-4 flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-gold-600/50 bg-gradient-to-br from-gold-500/30 to-transparent text-accent">
                <Users className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2
                  id="admin-users-heading"
                  className="font-storybook text-base font-bold tracking-[0.1em] nav-dragon-gold sm:text-lg"
                >
                  Users
                </h2>
                <p className="font-heading text-sm nav-dragon-gold">
                  {stats.users.length} registered{" "}
                  {stats.users.length === 1 ? "traveler" : "travelers"} · newest
                  first
                </p>
              </div>
            </div>

            {stats.users.length === 0 ? (
              <div className="rounded-sm border border-dashed border-gold-600/35 bg-forest-950/45 px-3 py-4">
                <p className="font-heading text-sm leading-snug nav-dragon-gold">
                  No profiles have been inscribed yet.
                </p>
              </div>
            ) : (
              <ul className="space-y-2.5">
                {stats.users.map((user) => (
                  <UserRow key={user.id} user={user} />
                ))}
              </ul>
            )}
          </section>

          <div
            className="h-px w-full bg-gradient-to-r from-transparent via-gold-600/50 to-transparent"
            aria-hidden="true"
          />

          <section aria-labelledby="admin-recent-ratings-heading">
            <div className="mb-4 flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-gold-600/50 bg-gradient-to-br from-gold-500/30 to-transparent text-accent">
                <Shield className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2
                  id="admin-recent-ratings-heading"
                  className="font-storybook text-base font-bold tracking-[0.1em] nav-dragon-gold sm:text-lg"
                >
                  Most recent ratings
                </h2>
                <p className="font-heading text-sm nav-dragon-gold">
                  The last {stats.recentRatings.length} marks left across the
                  archives
                </p>
              </div>
            </div>

            {stats.recentRatings.length === 0 ? (
              <div className="rounded-sm border border-dashed border-gold-600/35 bg-forest-950/45 px-3 py-4">
                <p className="font-heading text-sm leading-snug nav-dragon-gold">
                  No ratings have been inscribed yet.
                </p>
              </div>
            ) : (
              <ul className="space-y-2.5">
                {stats.recentRatings.map((rating) => (
                  <RecentRatingRow key={rating.id} rating={rating} />
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </FantasyPageShell>
  );
}
