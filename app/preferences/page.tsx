import { CodexBoxOrnament } from "@/components/preferences/CodexBoxOrnament";
import { PreferencesForm } from "@/components/preferences/PreferencesForm";
import { AvatarCrest } from "@/components/profile/AvatarCrest";
import { CornerFlourish } from "@/components/theme/FantasyDecor";
import {
  getAvatarOption,
  resolveAvatarKey,
  resolveDisplayName,
} from "@/lib/avatars";
import { loadPreferencesForPage } from "@/lib/preferences";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { ArrowLeft, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PreferencesPage() {
  if (!isSupabaseConfigured()) {
    redirect("/login?redirect=/preferences&message=preferences");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/preferences&message=preferences");
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

  const prefsLoad = await loadPreferencesForPage(user.id);
  const preferences = prefsLoad.preferences;
  const loadError = "error" in prefsLoad ? prefsLoad.error : null;

  return (
    <div className="preferences-page">
      {/* Viewport-locked parchment scene — does not rescale when sliders/notes expand */}
      <div className="preferences-page-scene" aria-hidden="true">
        <Image
          src="/images/lorepath-preferences-parchment.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="preferences-page-scene-image"
        />
        {/* Fiber grain + coffee stains */}
        <div
          className="absolute inset-0 opacity-[0.34] mix-blend-multiply"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 280 280' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.7'/%3E%3C/svg%3E\")",
          }}
        />
        <div className="absolute -left-[8%] top-[12%] h-64 w-72 rounded-full bg-[radial-gradient(ellipse,_rgba(110,70,30,0.18)_0%,_transparent_70%)] blur-2xl" />
        <div className="absolute bottom-[8%] right-[4%] h-72 w-80 rounded-full bg-[radial-gradient(ellipse,_rgba(90,55,20,0.16)_0%,_transparent_68%)] blur-2xl" />
        <div className="absolute left-[35%] top-[42%] h-40 w-52 rotate-12 rounded-full bg-[radial-gradient(ellipse,_rgba(80,50,20,0.1)_0%,_transparent_70%)] blur-xl" />
        {/* Crease / open-book gutter */}
        <div className="absolute inset-y-0 left-1/2 z-[1] w-[3px] -translate-x-1/2 bg-gradient-to-b from-transparent via-[#5a3c12]/35 to-transparent" />
        <div className="absolute inset-y-[6%] left-[calc(50%-4px)] w-2 rounded-full bg-gradient-to-b from-transparent via-[#3d2a0e]/12 to-transparent blur-[2px]" />
        {/* Soft candlelight + forest washes */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_12%,_rgba(166,124,45,0.14)_0%,_transparent_45%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_82%_78%,_rgba(61,107,79,0.14)_0%,_transparent_48%)]" />
        {/* Magical vignette */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,_transparent_35%,_rgba(40,28,10,0.22)_72%,_rgba(20,14,6,0.48)_100%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#2a1c0a]/20 via-transparent to-[#1a1208]/35" />

        <CornerFlourish className="absolute left-2 top-2 h-16 w-16 text-gold-600/45 sm:left-4 sm:top-4 sm:h-20 sm:w-20" />
        <CornerFlourish className="absolute right-2 top-2 h-16 w-16 rotate-90 text-gold-600/45 sm:right-4 sm:top-4 sm:h-20 sm:w-20" />
        <CornerFlourish className="absolute bottom-2 left-2 h-16 w-16 -rotate-90 text-gold-600/45 sm:bottom-4 sm:left-4 sm:h-20 sm:w-20" />
        <CornerFlourish className="absolute bottom-2 right-2 h-16 w-16 rotate-180 text-gold-600/45 sm:bottom-4 sm:right-4 sm:h-20 sm:w-20" />
      </div>

      <div className="relative z-10 mx-auto max-w-2xl px-6 py-10 sm:py-14">
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

        <header className="relative mb-10 text-center sm:mb-12 sm:text-left">
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start sm:gap-6">
            <AvatarCrest
              avatarKey={avatarKey}
              variant="display"
              className="h-40 w-40 sm:h-44 sm:w-44 md:h-48 md:w-48"
              size={192}
              title={avatar.label}
            />
            <div className="min-w-0 sm:pt-1">
              <div className="section-label metallic-emerald-darker justify-center !text-xs !font-bold tracking-[0.32em] sm:justify-start">
                <Sparkles className="h-3.5 w-3.5 text-[#0a1f18]" />
                Comfort Levels
              </div>
              <h1 className="metallic-emerald-deep mt-2 font-storybook text-4xl font-normal tracking-[0.06em] sm:text-5xl">
                {displayName}&apos;s Preference Codex
              </h1>
              <div
                className="mx-auto mt-3 h-px w-40 bg-gradient-to-r from-transparent via-gold-600/70 to-transparent sm:mx-0"
                aria-hidden="true"
              />
            </div>
          </div>

          <div className="preference-codex-box relative mt-4 !p-3.5 !pt-4 text-left sm:mt-5 sm:!p-4 sm:!pt-4">
            <CodexBoxOrnament />
            <p className="relative z-[3] px-0.5 font-heading text-sm leading-snug tracking-wide nav-dragon-gold sm:text-[0.95rem]">
              Set your comfort levels across themes for Match Score. During
              Beta, preferences and Match Score are free for every account.
            </p>
          </div>
        </header>

        <div className="relative space-y-5">
          <PreferencesForm
            initialPreferences={preferences}
            loadError={loadError}
          />
        </div>
      </div>
    </div>
  );
}
