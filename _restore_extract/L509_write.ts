"use client";

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
  /** When true, skips API persistence (guest / no-premium testing). */
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
      // TEMP: local-only save while testing without login/premium
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
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="mb-2 flex items-start gap-3 border-b border-gold-600/20 pb-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-gold-500/35 bg-gradient-to-br from-gold-400/20 to-transparent text-accent">
          <Scroll className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold tracking-wide text-foreground">
            Your Reading Path
          </h2>
          <p className="mt-1 font-heading text-sm leading-relaxed text-muted">
            Guide the ink — each mark helps LorePath understand the kinds of
            stories that feel like home to you.
          </p>
        </div>
      </div>

      {testingMode && (
        <p className="rounded-sm border border-gold-600/30 bg-surface/80 px-3 py-2 font-heading text-sm text-muted">
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

      <div className="space-y-4">
        {PREFERENCE_CATEGORIES.map((category, index) => (
          <PreferenceSlider
            key={category.key}
            id={`pref-${category.key}`}
            label={category.label}
            description={category.description}
            hintLow={category.hintLow}
            hintHigh={category.hintHigh}
            value={preferences[category.key]}
            onChange={(value) => updatePreference(category.key, value)}
            index={index}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-3 border-t border-gold-600/20 pt-5">
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Feather className="h-4 w-4" />
          )}
          Save Preferences
        </button>
        <button type="button" onClick={handleReset} className="btn-secondary">
          Reset to defaults
        </button>
      </div>
    </form>
  );
}
