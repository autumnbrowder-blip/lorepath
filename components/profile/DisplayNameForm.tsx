"use client";

import { updateDisplayNameAction } from "@/app/profile/actions";
import { PROFILE_UPDATED_EVENT } from "@/lib/avatars";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";

const MAX_DISPLAY_NAME_LENGTH = 60;

type DisplayNameFormProps = {
  userId: string;
  initialDisplayName: string | null;
};

function normalizeDisplayName(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function DisplayNameForm({
  userId: _userId,
  initialDisplayName,
}: DisplayNameFormProps) {
  const router = useRouter();
  const skipPropSync = useRef(false);
  const [value, setValue] = useState(initialDisplayName?.trim() ?? "");
  const [savedValue, setSavedValue] = useState(
    initialDisplayName?.trim() ?? ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (skipPropSync.current) {
      skipPropSync.current = false;
      return;
    }
    if (saving) return;
    const next = initialDisplayName?.trim() ?? "";
    setValue(next);
    setSavedValue(next);
  }, [initialDisplayName, saving]);

  useEffect(() => {
    if (!justSaved) return;
    const timer = window.setTimeout(() => setJustSaved(false), 3500);
    return () => window.clearTimeout(timer);
  }, [justSaved]);

  const dirty =
    normalizeDisplayName(value) !== normalizeDisplayName(savedValue);

  function notifyProfileUpdated(displayName: string | null) {
    window.dispatchEvent(
      new CustomEvent(PROFILE_UPDATED_EVENT, {
        detail: { display_name: displayName },
      })
    );
  }

  async function saveDisplayName() {
    if (saving) return;

    if (value.trim().length > MAX_DISPLAY_NAME_LENGTH) {
      setError(
        `Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.`
      );
      return;
    }

    if (!dirty) {
      setError("Change your display name before saving.");
      return;
    }

    const previous = savedValue;
    setSaving(true);
    setError(null);
    setJustSaved(false);

    try {
      const result = await updateDisplayNameAction(value);

      if (!result.ok) {
        setValue(previous);
        setError(result.error);
        return;
      }

      const confirmed = result.displayName?.trim() ?? "";
      skipPropSync.current = true;
      setValue(confirmed);
      setSavedValue(confirmed);
      setJustSaved(true);
      notifyProfileUpdated(confirmed.length > 0 ? confirmed : null);
      router.refresh();
    } catch (err) {
      setValue(previous);
      setError(
        err instanceof Error ? err.message : "Failed to save display name."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveDisplayName();
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
      <div>
        <label
          htmlFor="display-name"
          className="font-display text-[10px] uppercase tracking-[0.2em] nav-dragon-gold"
        >
          Display name
        </label>
        <p className="mt-1 font-heading text-sm nav-dragon-gold">
          The name etched beside your crest in the archives.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {/*
          Do NOT put nav-dragon-gold on this input — that class uses
          background-clip:text + transparent text fill, which breaks typing
          in form controls (invisible caret / uneditable text).
        */}
        <input
          id="display-name"
          name="display_name"
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
            if (justSaved) setJustSaved(false);
          }}
          maxLength={MAX_DISPLAY_NAME_LENGTH}
          disabled={saving}
          autoComplete="nickname"
          spellCheck={false}
          placeholder="e.g. Elowen of the Vale"
          className="w-full rounded-sm border border-gold-600/40 bg-[#f7f0dc] px-3 py-2.5 font-heading text-lg text-[#3f2a1e] caret-[#3f2a1e] placeholder:text-[#5c3f0f]/55 focus:border-gold-500/70 focus:outline-none focus:ring-1 focus:ring-gold-500/40 disabled:cursor-wait dark:border-gold-600/35 dark:bg-forest-950/55 dark:text-[#f0d78a] dark:caret-[#f0d78a] dark:placeholder:text-gold-700/50"
        />
        <button
          type="submit"
          disabled={saving || !dirty}
          className="btn-primary shrink-0 disabled:cursor-not-allowed"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {justSaved && !saving && !error ? (
        <p
          className="font-heading text-sm text-forest-800 dark:text-cream-200"
          aria-live="polite"
        >
          Display name updated successfully
          {savedValue ? (
            <>
              {" "}
              —{" "}
              <span className="font-storybook font-semibold tracking-wide">
                {savedValue}
              </span>
            </>
          ) : null}
        </p>
      ) : null}
      {error ? (
        <p
          className="font-heading text-sm text-red-800 dark:text-red-300"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </form>
  );
}
