"use client";

import { CodexBoxOrnament } from "@/components/preferences/CodexBoxOrnament";
import { PreferenceSlider } from "@/components/preferences/PreferenceSlider";
import {
  DEFAULT_USER_PREFERENCES,
  PREFERENCE_CATEGORIES,
} from "@/lib/rating-categories";
import { createClient } from "@/lib/supabase";
import type { ContentRating } from "@/types";
import { AlertCircle, CheckCircle2, Feather, Loader2, Scroll } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

type PreferencesFormProps = {
  initialPreferences: ContentRating;
  /** When true, skips API persistence (local testing without login). */
  testingMode?: boolean;
};

export function PreferencesForm({
  initialPreferences,
  testingMode = false,
}: PreferencesFormProps) {
  const router = useRouter();
  const [preferences, setPreferences] =
    useState<ContentRating>(initialPreferences);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setPreferences(initialPreferences);
  }, [initialPreferences]);

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
        setSuccess(true);
        return;
      }

      // Pass the browser session JWT explicitly. Cookie-only SSR often validates
      // getUser() but omits Authorization on PostgREST → auth.uid() null → RLS.
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.access_token) {
          headers.Authorization = `Bearer ${session.access_token}`;
        }
      } catch {
        // Fall back to cookie session on the API if browser session read fails.
      }

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
      } = {};
      try {
        data = await response.json();
      } catch {
        throw new Error("Could not read the server response. Please try again.");
      }

      if (!response.ok) {
        const detail =
          data.code || data.supabaseMessage
            ? ` (${[data.code, data.supabaseMessage].filter(Boolean).join(": ")})`
            : "";
        throw new Error(
          `${data.error ?? "Failed to save preferences."}${detail}`
        );
      }

      if (data.preferences) {
        setPreferences(data.preferences);
      }

      setSuccess(true);
      // Bust the App Router cache so leaving and returning shows DB values.
      router.refresh();
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
      <div className="preference-codex-box flex items-start gap-3">
        <CodexBoxOrnament />
        <div className="relative z-[3] flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-gold-600/50 bg-gradient-to-br from-gold-500/30 to-transparent text-accent shadow-[0_0_16px_rgba(166,124,45,0.22)]">
          <Scroll className="h-5 w-5" />
        </div>
        <div className="relative z-[3]">
          <h2 className="font-storybook text-2xl font-bold tracking-[0.14em] nav-dragon-gold">
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
        <button type="submit" disabled={loading} className="btn-primary">
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
