"use client";

import { CodexBoxOrnament } from "@/components/preferences/CodexBoxOrnament";
import { PreferenceSlider } from "@/components/preferences/PreferenceSlider";
import {
  DEFAULT_USER_PREFERENCES,
  PREFERENCE_CATEGORIES,
} from "@/lib/rating-categories";
import type { ContentRating } from "@/types";
import { AlertCircle, CheckCircle2, Feather, Loader2, Scroll } from "lucide-react";
import { FormEvent, useState } from "react";

type PreferencesFormProps = {
  initialPreferences: ContentRating;
  /** When true, skips API persistence (local testing without login). */
  testingMode?: boolean;
};

export function PreferencesForm({
  initialPreferences,
  testingMode = false,
}: PreferencesFormProps) {
  const [preferences, setPreferences] =
    useState<ContentRating>(initialPreferences);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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
      // TEMP: local-only save while testing without login
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

      const response = await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preferences),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to save preferences.");
      }

      setSuccess(true);
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
        <div className="alert-error">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {success && (
        <div className="alert-success">
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
