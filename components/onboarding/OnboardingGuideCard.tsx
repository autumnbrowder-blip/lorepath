"use client";

import { CodexBoxOrnament } from "@/components/preferences/CodexBoxOrnament";
import {
  celebrationDismissStorageKey,
  ONBOARDING_GUIDE_COPY,
  resolveOnboardingGuideState,
  type OnboardingGuideState,
  type OnboardingGuideVariant,
} from "@/lib/onboarding-guide";
import { Feather, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type OnboardingGuideCardProps = {
  userId: string;
  hasPreferences: boolean;
  ratingCount: number;
  variant?: OnboardingGuideVariant;
  className?: string;
};

function GuideActions({
  state,
  variant,
}: {
  state: OnboardingGuideState;
  variant: OnboardingGuideVariant;
}) {
  // Preferences: helper text only (save already routes the reader onward).
  if (variant === "short") return null;
  // Celebration: dismiss control only — no CTAs.
  if (state === "celebration") return null;

  if (state === "begin-path") {
    return (
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Link
          href="/preferences"
          className="btn-primary w-full justify-center px-5 py-3 text-[11px] tracking-[0.14em] sm:w-auto"
        >
          Set Preferences
        </Link>
        <Link
          href="/browse"
          className="btn-secondary w-full justify-center px-5 py-3 text-[11px] tracking-[0.14em] sm:w-auto"
        >
          Browse Tomes
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap gap-3 sm:mt-5">
      <Link
        href="/browse"
        className="btn-primary w-full justify-center px-5 py-3 text-[11px] tracking-[0.14em] sm:w-auto"
      >
        <Feather className="h-3.5 w-3.5" aria-hidden="true" />
        Browse Tomes
      </Link>
    </div>
  );
}

export function OnboardingGuideCard({
  userId,
  hasPreferences,
  ratingCount,
  variant = "full",
  className = "",
}: OnboardingGuideCardProps) {
  const [celebrationDismissed, setCelebrationDismissed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(
        celebrationDismissStorageKey(userId)
      );
      setCelebrationDismissed(raw === "1");
    } catch {
      setCelebrationDismissed(false);
    }
    setHydrated(true);
  }, [userId]);

  // Avoid flashing celebration before we know if it was dismissed.
  const dismissedForResolve =
    ratingCount >= 1 ? (hydrated ? celebrationDismissed : true) : false;

  const state = resolveOnboardingGuideState({
    hasPreferences,
    ratingCount,
    celebrationDismissed: dismissedForResolve,
  });

  if (!state) return null;

  const copy = ONBOARDING_GUIDE_COPY[state];
  const body = copy.body[variant];
  const isCelebration = state === "celebration";
  const padding =
    variant === "short"
      ? "!px-4 !py-4 sm:!px-5 sm:!py-4"
      : "!px-4 !py-5 sm:!px-6 sm:!py-6";

  function dismissCelebration() {
    try {
      window.localStorage.setItem(celebrationDismissStorageKey(userId), "1");
    } catch {
      // Ignore quota / private-mode failures — hide for this session anyway.
    }
    setCelebrationDismissed(true);
  }

  return (
    <aside
      className={`preference-codex-box relative ${padding} ${className}`}
      aria-labelledby={`onboarding-guide-${state}-title`}
    >
      <CodexBoxOrnament />
      <div className="relative z-[3]">
        {isCelebration ? (
          <div className="mb-3 flex items-start justify-between gap-3">
            <Sparkles
              className="mt-0.5 h-5 w-5 shrink-0 text-gold-500"
              aria-hidden="true"
            />
            <button
              type="button"
              onClick={dismissCelebration}
              className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-sm border border-gold-600/40 bg-forest-950/40 text-gold-400/90 transition hover:border-gold-500/60 hover:text-gold-300"
              aria-label="Dismiss first mark celebration"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ) : null}

        <h2
          id={`onboarding-guide-${state}-title`}
          className={`font-storybook font-semibold tracking-[0.06em] nav-dragon-gold ${
            variant === "short"
              ? "text-lg sm:text-xl"
              : "text-xl sm:text-2xl"
          }`}
        >
          {copy.title}
        </h2>
        <div
          className="mt-2.5 h-px w-28 bg-gradient-to-r from-gold-600/70 to-transparent"
          aria-hidden="true"
        />
        <p
          className={`mt-3 font-heading leading-relaxed nav-dragon-gold ${
            variant === "short"
              ? "text-sm sm:text-[0.95rem]"
              : "text-sm sm:text-base"
          }`}
        >
          {body}
        </p>

        <GuideActions state={state} variant={variant} />
      </div>
    </aside>
  );
}
