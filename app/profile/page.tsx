import { LogoutButton } from "@/components/auth/LogoutButton";
import { OnboardingGuideCard } from "@/components/onboarding/OnboardingGuideCard";
import { AvatarCrest } from "@/components/profile/AvatarCrest";
import { AvatarPicker } from "@/components/profile/AvatarPicker";
import { DisplayNameForm } from "@/components/profile/DisplayNameForm";
import { CodexBoxOrnament } from "@/components/preferences/CodexBoxOrnament";
import { FantasyPageShell } from "@/components/theme/FantasyPageShell";
import {
  getAvatarOption,
  resolveAvatarKey,
} from "@/lib/avatars";
import { getUserPreferences, readProfileDisplayFields } from "@/lib/preferences";
import { getUserRatingCount } from "@/lib/ratings";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, getCachedUser } from "@/lib/supabase/server";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Your Profile | LorePath",
  description:
    "Edit your LorePath display name and choose a fantasy avatar crest.",
};

export default async function ProfilePage() {
  if (!isSupabaseConfigured()) {
    redirect("/login?redirect=/profile");
  }

  const user = await getCachedUser();

  if (!user) {
    redirect("/login?redirect=/profile");
  }

  const supabase = await createClient();
  const profile = await readProfileDisplayFields(supabase, user.id);
  const displayNameRaw = profile.display_name;
  const avatarKeyRaw = profile.avatar_key;
  const avatarColumnUnavailable = profile.avatarColumnUnavailable;

  const avatarKey = resolveAvatarKey(avatarKeyRaw);
  const avatar = getAvatarOption(avatarKey);

  const email = user.email ?? "—";
  const [preferences, ratingCount] = await Promise.all([
    getUserPreferences(user.id),
    getUserRatingCount(user.id),
  ]);
  const hasPreferences = preferences !== null;

  return (
    <FantasyPageShell>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-16">
        <Link href="/browse" className="preference-codex-box--nav relative mb-6 sm:mb-10">
          <ArrowLeft className="h-4 w-4" />
          <span className="relative z-[1] nav-dragon-gold">Back to the Archives</span>
        </Link>

        <header className="mb-6 text-center sm:mb-10 sm:text-left">
          <h1 className="page-title nav-dragon-gold">Your Profile</h1>
          <p className="mt-2 font-heading text-base nav-dragon-gold sm:text-lg">
            A quiet corner of the archives for your account.
          </p>
        </header>

        <OnboardingGuideCard
          userId={user.id}
          hasPreferences={hasPreferences}
          ratingCount={ratingCount}
          variant="full"
          className="mb-6 sm:mb-8"
        />

        <div className="preference-codex-box relative !px-4 !py-6 sm:!px-8 sm:!py-8">
          <CodexBoxOrnament />
          <div className="relative z-[3] space-y-5 sm:space-y-6">
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6">
              <div className="flex shrink-0 flex-col items-center gap-2">
                <AvatarCrest
                  avatarKey={avatarKey}
                  variant="display"
                  className="h-28 w-28 sm:h-40 sm:w-40 md:h-48 md:w-48"
                  size={192}
                  title={avatar.label}
                />
                <p className="font-storybook text-xs font-semibold uppercase tracking-[0.14em] nav-dragon-gold sm:text-[11px]">
                  {avatar.label}
                </p>
                {"clan" in avatar && avatar.clan ? (
                  <p className="font-display text-[9px] uppercase tracking-[0.18em] text-gold-600/90">
                    {avatar.clan}
                  </p>
                ) : null}
              </div>
              <div className="min-w-0 flex-1 space-y-4">
                <DisplayNameForm
                  userId={user.id}
                  initialDisplayName={
                    typeof displayNameRaw === "string" ? displayNameRaw : null
                  }
                />
                <div>
                  <p className="font-display text-[10px] uppercase tracking-[0.2em] nav-dragon-gold">
                    Email
                  </p>
                  <p className="mt-1 break-all font-heading text-lg nav-dragon-gold">
                    {email}
                  </p>
                </div>
              </div>
            </div>

            <div
              className="h-px w-full bg-gradient-to-r from-transparent via-gold-600/50 to-transparent"
              aria-hidden="true"
            />

            <AvatarPicker
              userId={user.id}
              initialAvatarKey={avatarKey}
              avatarColumnUnavailable={avatarColumnUnavailable}
            />

            <div
              className="h-px w-full bg-gradient-to-r from-transparent via-gold-600/50 to-transparent"
              aria-hidden="true"
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Link
                href="/browse"
                className="preference-codex-box--nav relative w-full min-h-[2.75rem] justify-center px-4 py-3 text-center"
              >
                <span className="nav-dragon-gold">Browse books</span>
              </Link>
              <Link
                href="/import"
                className="preference-codex-box--nav relative w-full min-h-[2.75rem] justify-center px-4 py-3 text-center"
              >
                <span className="nav-dragon-gold">Import Reading List</span>
              </Link>
              <Link
                href="/"
                className="preference-codex-box--nav relative w-full min-h-[2.75rem] justify-center px-4 py-3 text-center"
              >
                <span className="nav-dragon-gold">Return home</span>
              </Link>
              <LogoutButton
                label="Logout"
                className="preference-codex-box--nav relative w-full min-h-[2.75rem] justify-center px-4 py-3 text-center"
              />
            </div>
          </div>
        </div>
      </div>
    </FantasyPageShell>
  );
}
