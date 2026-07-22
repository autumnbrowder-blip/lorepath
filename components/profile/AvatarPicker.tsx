"use client";

import { AvatarCrest } from "@/components/profile/AvatarCrest";
import {
  getAvatarOption,
  getAvatarsGroupedByClan,
  PROFILE_UPDATED_EVENT,
  resolveAvatarKey,
  type AvatarKey,
} from "@/lib/avatars";
import { createClient } from "@/lib/supabase";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type AvatarPickerProps = {
  userId: string;
  initialAvatarKey: string | null;
  /** True when the server could not read avatar_key (column likely missing). */
  avatarColumnUnavailable?: boolean;
};

/** Grid portrait: photo only; emoji only after load failure (never stacked). */
function PickerPortrait({
  src,
  emoji,
  label,
}: {
  src: string;
  emoji: string;
  label: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (failed) {
    return (
      <span
        className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_30%_20%,rgba(201,162,74,0.12),transparent_55%),linear-gradient(160deg,rgba(15,40,30,0.55),rgba(8,20,16,0.85))] text-3xl leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]"
        aria-hidden="true"
        title={label}
      >
        {emoji}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- local /avatars + onError emoji fallback
    <img
      src={src}
      alt=""
      width={112}
      height={112}
      loading="lazy"
      decoding="async"
      className="h-full w-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}

export function AvatarPicker({
  userId,
  initialAvatarKey,
  avatarColumnUnavailable: _avatarColumnUnavailable = false,
}: AvatarPickerProps) {
  const router = useRouter();
  const resolvedInitial = resolveAvatarKey(initialAvatarKey);
  const [selected, setSelected] = useState<AvatarKey>(resolvedInitial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<AvatarKey>(resolvedInitial);
  const [justSaved, setJustSaved] = useState(false);

  const clans = getAvatarsGroupedByClan();

  useEffect(() => {
    const next = resolveAvatarKey(initialAvatarKey);
    setSelected(next);
    setSavedKey(next);
  }, [initialAvatarKey]);

  useEffect(() => {
    if (!justSaved) return;
    const timer = window.setTimeout(() => setJustSaved(false), 2000);
    return () => window.clearTimeout(timer);
  }, [justSaved]);

  async function handleSelect(key: AvatarKey) {
    if (saving || key === savedKey) return;

    if (!isSupabaseConfigured()) {
      setError("Supabase is not configured.");
      return;
    }

    const previous = savedKey;
    setSelected(key);
    setSaving(true);
    setError(null);
    setJustSaved(false);

    try {
      const supabase = createClient();
      // Persist the filename (e.g. "dragon.jpg") into profiles.avatar_key
      const { data: updated, error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_key: key })
        .eq("id", userId)
        .select("avatar_key")
        .maybeSingle();

      if (updateError) {
        throw new Error(updateError.message || "Failed to save avatar.");
      }

      let confirmedKey: string | null | undefined = updated?.avatar_key;

      // Update matched 0 rows → no profiles row yet (or RLS hid it). Upsert one.
      if (!updated) {
        const { data: upserted, error: upsertError } = await supabase
          .from("profiles")
          .upsert({ id: userId, avatar_key: key }, { onConflict: "id" })
          .select("avatar_key")
          .maybeSingle();

        if (upsertError) {
          throw new Error(upsertError.message || "Failed to save avatar.");
        }

        if (!upserted) {
          setSelected(previous);
          setError("No profile row could be created for your account.");
          return;
        }

        confirmedKey = upserted.avatar_key;
      }

      const confirmed = resolveAvatarKey(confirmedKey);
      setSelected(confirmed);
      setSavedKey(confirmed);
      setJustSaved(true);
      window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
      router.refresh();
    } catch (err) {
      setSelected(previous);
      setError(err instanceof Error ? err.message : "Failed to save avatar.");
    } finally {
      setSaving(false);
    }
  }

  const current = getAvatarOption(selected);
  const clanLabel = current.clan;

  return (
    <div className="space-y-4">
      <div>
        <p className="font-display text-[10px] uppercase tracking-[0.2em] nav-dragon-gold">
          Clan crests
        </p>
        <p className="mt-1 font-heading text-sm nav-dragon-gold">
          Choose a crest from the Mystic, Stoneborn, Wild, Feywild, or Human
          clans. It appears beside your name in the navbar.
        </p>
        <div
          className="mt-2 flex items-center gap-2.5 font-heading text-sm nav-dragon-gold"
          aria-live="polite"
        >
          <AvatarCrest
            avatarKey={selected}
            className="h-9 w-9 rounded-sm"
            size={36}
            title={current.label}
          />
          <p>
            Currently selected:{" "}
            <span className="font-storybook font-semibold tracking-wide">
              {current.label}
            </span>
            <span className="ml-1.5 font-display text-[9px] uppercase tracking-[0.16em] text-gold-600/90">
              · {clanLabel}
            </span>
          </p>
        </div>
      </div>

      <div className="space-y-5" role="radiogroup" aria-label="Clan crest">
        {clans.map(({ clan, options }) => (
          <section key={clan} aria-labelledby={`clan-heading-${clan}`}>
            <div className="mb-2.5 flex items-end gap-3 border-b border-gold-600/35 pb-1.5">
              <h3
                id={`clan-heading-${clan}`}
                className="font-display text-[11px] uppercase tracking-[0.22em] antique-gold-text"
              >
                {clan}
              </h3>
              <span
                className="mb-0.5 h-px flex-1 bg-[linear-gradient(90deg,rgba(201,162,74,0.45),transparent)]"
                aria-hidden="true"
              />
            </div>

            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-3 md:gap-3.5">
              {options.map((option) => {
                const isSelected = selected === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    aria-label={`${option.label}, ${option.clan}`}
                    disabled={saving}
                    onClick={() => void handleSelect(option.key)}
                    className={`avatar-picker-option group flex flex-col items-center gap-1.5 rounded-sm border border-gold-600/40 bg-[linear-gradient(165deg,rgba(245,236,214,0.08),rgba(15,40,30,0.35))] p-2 transition-colors duration-150 disabled:cursor-wait sm:p-2.5 ${
                      isSelected
                        ? "border-gold-500/80 shadow-[inset_0_0_16px_rgba(201,162,74,0.22)] ring-1 ring-inset ring-gold-500/55"
                        : "hover:border-gold-500/55"
                    }`}
                  >
                    <span
                      className={`relative block aspect-square w-full overflow-hidden rounded-sm border-2 bg-forest-950 shadow-[0_0_0_1px_rgba(120,90,30,0.4),inset_0_0_12px_rgba(0,0,0,0.45)] ${
                        isSelected
                          ? "border-gold-500/90"
                          : "border-gold-600/55 group-hover:border-gold-500/75"
                      }`}
                    >
                      <PickerPortrait
                        src={option.src}
                        emoji={option.emoji}
                        label={option.label}
                      />
                    </span>
                    <span className="min-h-[2.25em] text-center font-storybook text-[9px] font-semibold uppercase leading-tight tracking-[0.1em] antique-gold-text sm:text-[10px]">
                      {option.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-2 min-h-6 font-heading text-sm" aria-live="polite">
        {saving ? <p className="nav-dragon-gold">Saving…</p> : null}
        {justSaved && !saving && !error ? (
          <p className="text-forest-800 dark:text-cream-200">
            Crest saved — {current.label} ({current.clan})
          </p>
        ) : null}
        {error ? (
          <p className="text-red-800 dark:text-red-300" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
