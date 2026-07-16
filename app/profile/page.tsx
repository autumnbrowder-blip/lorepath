import { LogoutButton } from "@/components/auth/LogoutButton";
import { AvatarCrest } from "@/components/profile/AvatarCrest";
import { AvatarPicker } from "@/components/profile/AvatarPicker";
import { DisplayNameForm } from "@/components/profile/DisplayNameForm";
import { FantasyPageShell } from "@/components/theme/FantasyPageShell";
import {
  DEFAULT_AVATAR_KEY,
  getAvatarOption,
  resolveAvatarKey,
} from "@/lib/avatars";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { ArrowLeft, ScrollText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Your Profile | LorePath",
  description:
    "Edit your LorePath display name and choose a fantasy avatar crest.",
};

function isMissingAvatarColumn(message: string | undefined) {
  if (!message) return false;
  return (
    /avatar_key/i.test(message) &&
    (/schema cache/i.test(message) ||
      /could not find/i.test(message) ||
      /column/i.test(message) ||
      /does not exist/i.test(message))
  );
}

export default async function ProfilePage() {
  if (!isSupabaseConfigured()) {
    redirect("/login?redirect=/profile");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/profile");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("display_name, avatar_key")
    .eq("id", user.id)
    .maybeSingle();

  let displayNameRaw = profile?.display_name as string | null | undefined;
  let avatarKeyRaw = profile?.avatar_key as string | null | undefined;
  let avatarColumnUnavailable = false;

  if (profileError) {
    // Soft-handle missing avatar_key column; page still loads with a migration hint
    avatarColumnUnavailable = isMissingAvatarColumn(profileError.message);
    const { data: basic } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();
    displayNameRaw = basic?.display_name;
    avatarKeyRaw = null;
  }

  const avatarKey = resolveAvatarKey(avatarKeyRaw);
  const avatar = getAvatarOption(avatarKey);

  // Ensure a profiles row + default crest without touching display_name.
  // Prefer UPDATE when the row exists so a partial upsert can never race a
  // display-name save on router.refresh().
  if (!profile) {
    await supabase.from("profiles").upsert(
      { id: user.id, avatar_key: DEFAULT_AVATAR_KEY },
      { onConflict: "id" }
    );
  } else if (!avatarKeyRaw && !avatarColumnUnavailable) {
    await supabase
      .from("profiles")
      .update({ avatar_key: DEFAULT_AVATAR_KEY })
      .eq("id", user.id);
  }

  const email = user.email ?? "—";

  return (
    <FantasyPageShell>
      <div className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
        <Link href="/browse" className="preference-codex-box--nav relative mb-10">
          <ArrowLeft className="h-4 w-4" />
          <span className="relative z-[1] nav-dragon-gold">Back to the Archives</span>
        </Link>

        <header className="mb-8 text-center sm:mb-10 sm:text-left">
          <p className="section-label justify-center text-sm nav-dragon-gold sm:justify-start">
            <ScrollText className="h-3.5 w-3.5" />
            Traveler&apos;s ledger
          </p>
          <h1 className="page-title nav-dragon-gold">Your Profile</h1>
          <p className="mt-2 font-heading text-lg nav-dragon-gold">
            A quiet corner of the archives for your account.
          </p>
        </header>

        <div className="parchment-panel space-y-6 px-6 py-8 sm:px-8">
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start sm:gap-6">
            <div className="flex shrink-0 flex-col items-center gap-2">
              <AvatarCrest
                avatarKey={avatarKey}
                variant="display"
                className="h-40 w-40 sm:h-44 sm:w-44 md:h-48 md:w-48"
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

          <div className="flex flex-wrap items-center gap-3">
            <Link href="/" className="btn-secondary">
              Return home
            </Link>
            <Link href="/browse" className="btn-secondary">
              Browse books
            </Link>
            <LogoutButton label="Logout" />
          </div>
        </div>
      </div>
    </FantasyPageShell>
  );
}
