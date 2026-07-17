import { AccountSettingsPanel } from "@/components/settings/AccountSettingsPanel";
import { AvatarCrest } from "@/components/profile/AvatarCrest";
import { FantasyPageShell } from "@/components/theme/FantasyPageShell";
import {
  getAvatarOption,
  resolveAvatarKey,
  resolveDisplayName,
} from "@/lib/avatars";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { ArrowLeft, Settings } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Account Settings | LorePath",
  description:
    "Change your LorePath password or email, or permanently delete your account.",
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  if (!isSupabaseConfigured()) {
    redirect("/login?redirect=/settings");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/settings");
  }

  const email = user.email?.trim();
  if (!email) {
    redirect("/login?redirect=/settings");
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
              className="h-28 w-28 sm:h-32 sm:w-32"
              size={128}
              title={avatar.label}
            />
            <div className="min-w-0 sm:pt-1">
              <div className="section-label metallic-emerald-darker justify-center !text-xs !font-bold tracking-[0.32em] sm:justify-start">
                <Settings className="h-3.5 w-3.5 text-[#0a1f18]" />
                Account Settings
              </div>
              <h1 className="page-title nav-dragon-gold mt-2">
                {displayName}&apos;s Ward
              </h1>
              <p className="mt-2 font-heading text-lg nav-dragon-gold">
                Password, email, and the gate that seals your account forever.
              </p>
            </div>
          </div>
        </header>

        <div className="parchment-panel space-y-2 px-6 py-8 sm:px-8">
          <AccountSettingsPanel email={email} />
        </div>

        <p className="mt-6 text-center font-heading text-sm nav-dragon-gold sm:text-left">
          Looking for your crest or display name?{" "}
          <Link
            href="/profile"
            className="font-storybook underline decoration-gold-600/50 underline-offset-4 hover:decoration-gold-500"
          >
            Visit your Profile
          </Link>
          .
        </p>
      </div>
    </FantasyPageShell>
  );
}
