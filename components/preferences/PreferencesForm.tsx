"use client";

import { CodexBoxOrnament } from "@/components/preferences/CodexBoxOrnament";
import { PreferenceSlider } from "@/components/preferences/PreferenceSlider";
import {
  DEFAULT_USER_PREFERENCES,
  PREFERENCE_CATEGORIES,
} from "@/lib/rating-categories";
import { getBrowserAccessToken } from "@/lib/supabase";
import type { ContentRating } from "@/types";
import { AlertCircle, CheckCircle2, Feather, Loader2, Scroll } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";

type PreferencesFormProps = {
  /** Previously saved prefs; null when no row exists yet. */
  initialPreferences: ContentRating | null;
  /** Server-side load failure (e.g. missing SUPABASE_SERVICE_ROLE_KEY). */
  loadError?: string | null;
  /** When true, skips API persistence (local testing without login). */
  testingMode?: boolean;
  /**
   * Where to go after a successful save.
   * First-time readers → `/onboarding/first-rating`; readers who already
   * have a mark → `/browse` (avoids re-showing the first-mark prompt).
   */
  afterSaveHref?: string;
};

function preferencesEqual(a: ContentRating, b: ContentRating): boolean {
  return PREFERENCE_CATEGORIES.every(
    (category) => a[category.key] === b[category.key]
  );
}

export function PreferencesForm({
  initialPreferences,
  loadError = null,
  testingMode = false,
  afterSaveHref = "/onboarding/first-rating",
}: PreferencesFormProps) {
  const router = useRouter();
  const [preferences, setPreferences] = useState<ContentRating>(
    initialPreferences ?? DEFAULT_USER_PREFERENCES
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(loadError);
  const [success, setSuccess] = useState(false);
  /** Keeps confirmed prefs across a refresh that temporarily returns null. */
  const confirmedRef = useRef<ContentRating | null>(initialPreferences);

  // Hydrate from server when a saved row exists. Do not wipe just-saved
  // values if SSR briefly returns null/defaults after router.refresh().
  useEffect(() => {
    if (initialPreferences != null) {
      confirmedRef.current = initialPreferences;
      setPreferences((prev) =>
        preferencesEqual(prev, initialPreferences) ? prev : initialPreferences
      );
      return;
    }
    if (confirmedRef.current != null) {
      setPreferences(confirmedRef.current);
    }
  }, [initialPreferences]);

  useEffect(() => {
    if (loadError) setError(loadError);
  }, [loadError]);

  function updatePreference(key: keyof ContentRating, value: number) {
    setPreferences((prev) => ({ ...prev, [key]: value }));
    setSuccess(false);
    setError(null);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      if (testingMode) {
        try {
          sessionStorage.setItem(
            "lorepath-preferences-test",
            JSON.stringify(preferences)
          );
        } catch {
          // sessionStorage may be unavailable; still treat UI as success
        }
        confirmedRef.current = preferences;
        setSuccess(true);
        return;
      }

      const token = await getBrowserAccessToken();
      if (!token) {
        throw new Error(
          "You are not signed in (no access token). Please sign out and back in, then try again."
        );
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      };

      const response = await fetch("/api/preferences", {
        method: "PUT",
        headers,
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify(preferences),
      });

      let data: {
        error?: string;
        message?: string;
        preferences?: ContentRating;
        code?: string;
        supabaseMessage?: string;
        sessionUserId?: string | null;
        bodyUserId?: string | null;
        hadAuthorizationHeader?: boolean;
        userIdMatched?: boolean | null;
      } = {};
      try {
        data = await response.json();
      } catch {
        throw new Error("Could not read the server response. Please try again.");
      }

      if (!response.ok) {
        const status = response.status;
        if (status === 401 || status === 403) {
          throw new Error(
            data.error ?? "You are not signed in. Please sign in and try again."
          );
        }
        const parts = [
          data.code,
          data.supabaseMessage,
          data.sessionUserId ? `sessionUserId=${data.sessionUserId}` : null,
          data.bodyUserId != null ? `bodyUserId=${data.bodyUserId}` : null,
          typeof data.hadAuthorizationHeader === "boolean"
            ? `hadAuthorizationHeader=${data.hadAuthorizationHeader}`
            : null,
        ].filter(Boolean);
        const detail = parts.length ? ` (${parts.join("; ")})` : "";
        throw new Error(
          `${data.error ?? "Failed to save preferences."}${detail}`
        );
      }

      // Keep confirmed values from THIS save. Do not GET again — a follow-up
      // read without JWT can return 0 rows and blank the sliders.
      if (data.preferences) {
        confirmedRef.current = data.preferences;
        setPreferences(data.preferences);
      } else {
        confirmedRef.current = preferences;
      }

      setSuccess(true);
      router.push(afterSaveHref);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setPreferences(DEFAULT_USER_PREFERENCES);
    setSuccess(false);
    setError(null);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="ornate-plaque preference-codex-box flex items-start gap-3">
        <CodexBoxOrnament />
        <div className="relative z-[3] flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-gold-600/50 bg-gradient-to-br from-gold-500/30 to-transparent text-accent shadow-[0_0_16px_rgba(166,124,45,0.22)]">
          <Scroll className="h-5 w-5" />
        </div>
        <div className="relative z-[3]">
          <h2 className="font-heading text-2xl font-medium tracking-normal nav-dragon-gold">
            Your Reading Path
          </h2>
          <p className="mt-2 font-heading text-lg leading-relaxed tracking-wide nav-dragon-gold">
            Guide the ink — each mark helps LorePath understand the kinds of
            stories that feel like home to you.
          </p>
        </div>
      </div>

      {testingMode && (
        <p className="rounded-sm border border-gold-600/35 bg-forest-950/70 px-3 py-2 font-heading text-lg nav-dragon-gold">
          Testing save is local only and is not written to your account.
        </p>
      )}

      {error && (
        <div className="alert-error" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {success && (
        <div className="alert-success" role="status">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {testingMode
              ? "Preferences saved locally for testing (not persisted)."
              : "Your preferences have been inscribed."}
          </p>
        </div>
      )}

      {PREFERENCE_CATEGORIES.map((category, index) => (
        <PreferenceSlider
          key={category.key}
          id={`pref-${category.key}`}
          label={category.label}
          description={category.description}
          note={category.note}
          levelLabels={category.levelLabels}
          levelDescriptions={category.levelDescriptions}
          hintLow={category.hintLow}
          hintHigh={category.hintHigh}
          value={preferences[category.key]}
          onChange={(value) => updatePreference(category.key, value)}
          index={index}
        />
      ))}

      <div className="flex flex-wrap gap-3 pt-1">
        <button type="submit" disabled={loading || Boolean(loadError)} className="btn-primary">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Feather className="h-4 w-4" />
          )}
          Save Preferences
        </button>
        <button type="button" onClick={handleReset} className="btn-secondary">
          <span className="metallic-gold">Reset to defaults</span>
        </button>
      </div>
    </form>
  );
}
