"use client";

import { createClient } from "@/lib/supabase";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Loader2,
  Mail,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useId, useRef, useState } from "react";

const FIELD_CLASS =
  "w-full rounded-sm border border-gold-600/40 bg-[#f7f0dc] px-3 py-2.5 font-heading text-lg text-[#3f2a1e] caret-[#3f2a1e] placeholder:text-[#5c3f0f]/55 focus:border-gold-500/70 focus:outline-none focus:ring-1 focus:ring-gold-500/40 disabled:cursor-wait dark:border-gold-600/35 dark:bg-forest-950/55 dark:text-[#f0d78a] dark:caret-[#f0d78a] dark:placeholder:text-gold-700/50";

const DELETE_CONFIRM_WORD = "DELETE";

type AccountSettingsPanelProps = {
  email: string;
};

export function AccountSettingsPanel({ email }: AccountSettingsPanelProps) {
  const router = useRouter();
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const deleteTitleId = useId();

  const [passwordCurrent, setPasswordCurrent] = useState("");
  const [passwordNew, setPasswordNew] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  const [emailNext, setEmailNext] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);

  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!passwordSuccess) return;
    const timer = window.setTimeout(() => setPasswordSuccess(null), 5000);
    return () => window.clearTimeout(timer);
  }, [passwordSuccess]);

  useEffect(() => {
    if (!emailSuccess) return;
    const timer = window.setTimeout(() => setEmailSuccess(null), 8000);
    return () => window.clearTimeout(timer);
  }, [emailSuccess]);

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!isSupabaseConfigured()) {
      setPasswordError("Supabase is not configured.");
      return;
    }

    if (passwordNew.length < 6) {
      setPasswordError("New password must be at least 6 characters.");
      return;
    }

    if (passwordNew !== passwordConfirm) {
      setPasswordError("New passwords do not match.");
      return;
    }

    if (passwordNew === passwordCurrent) {
      setPasswordError("Choose a new password that differs from your current one.");
      return;
    }

    setPasswordLoading(true);

    try {
      const supabase = createClient();

      // Re-authenticate so a stale or stolen session cannot change the password alone.
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email,
        password: passwordCurrent,
      });

      if (reauthError) {
        setPasswordError(
          /invalid login credentials/i.test(reauthError.message)
            ? "Current password is incorrect."
            : reauthError.message
        );
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: passwordNew,
      });

      if (updateError) {
        setPasswordError(updateError.message);
        return;
      }

      setPasswordCurrent("");
      setPasswordNew("");
      setPasswordConfirm("");
      setPasswordSuccess("Your password has been updated.");
    } catch (err) {
      setPasswordError(
        err instanceof Error ? err.message : "Could not update password."
      );
    } finally {
      setPasswordLoading(false);
    }
  }

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailError(null);
    setEmailSuccess(null);

    if (!isSupabaseConfigured()) {
      setEmailError("Supabase is not configured.");
      return;
    }

    const next = emailNext.trim().toLowerCase();
    if (!next || !next.includes("@")) {
      setEmailError("Enter a valid email address.");
      return;
    }

    if (next === email.trim().toLowerCase()) {
      setEmailError("That is already your current email.");
      return;
    }

    setEmailLoading(true);

    try {
      const supabase = createClient();

      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email,
        password: emailPassword,
      });

      if (reauthError) {
        setEmailError(
          /invalid login credentials/i.test(reauthError.message)
            ? "Password is incorrect."
            : reauthError.message
        );
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        email: next,
      });

      if (updateError) {
        setEmailError(updateError.message);
        return;
      }

      setEmailNext("");
      setEmailPassword("");
      setEmailSuccess(
        "Confirmation sent. Check your new inbox and click the link to finish changing your email. Your current address stays active until then."
      );
      router.refresh();
    } catch (err) {
      setEmailError(
        err instanceof Error ? err.message : "Could not update email."
      );
    } finally {
      setEmailLoading(false);
    }
  }

  function openDeleteDialog() {
    setDeleteError(null);
    setDeleteConfirmText("");
    deleteDialogRef.current?.showModal();
  }

  function closeDeleteDialog() {
    if (deleteLoading) return;
    deleteDialogRef.current?.close();
    setDeleteConfirmText("");
    setDeleteError(null);
  }

  async function handleDeleteAccount() {
    setDeleteError(null);

    if (deleteConfirmText.trim() !== DELETE_CONFIRM_WORD) {
      setDeleteError(`Type ${DELETE_CONFIRM_WORD} exactly to confirm.`);
      return;
    }

    if (!isSupabaseConfigured()) {
      setDeleteError("Supabase is not configured.");
      return;
    }

    setDeleteLoading(true);

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }

      const response = await fetch("/api/account/delete", {
        method: "DELETE",
        headers,
      });

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
      } | null;

      if (!response.ok) {
        setDeleteError(
          payload?.error || "Could not delete your account. Please try again."
        );
        return;
      }

      await supabase.auth.signOut();
      deleteDialogRef.current?.close();
      router.push("/?message=account_deleted");
      router.refresh();
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Could not delete your account."
      );
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Password */}
      <section className="space-y-4" aria-labelledby="settings-password-heading">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-gold-600/45 bg-gradient-to-br from-gold-500/25 to-transparent text-accent">
            <KeyRound className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2
              id="settings-password-heading"
              className="font-storybook text-2xl tracking-[0.08em] nav-dragon-gold"
            >
              Change password
            </h2>
            <p className="mt-1 font-heading text-base leading-relaxed nav-dragon-gold">
              Strengthen the ward on your account. You will need your current
              password to set a new one.
            </p>
          </div>
        </div>

        {passwordError ? (
          <div className="alert-error" role="alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{passwordError}</p>
          </div>
        ) : null}
        {passwordSuccess ? (
          <div className="alert-success" role="status">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{passwordSuccess}</p>
          </div>
        ) : null}

        <form onSubmit={(e) => void handlePasswordSubmit(e)} className="space-y-3">
          <div>
            <label
              htmlFor="current-password"
              className="font-display text-[10px] uppercase tracking-[0.2em] nav-dragon-gold"
            >
              Current password
            </label>
            <input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={passwordCurrent}
              onChange={(e) => {
                setPasswordCurrent(e.target.value);
                if (passwordError) setPasswordError(null);
              }}
              required
              disabled={passwordLoading}
              className={`mt-1.5 ${FIELD_CLASS}`}
            />
          </div>
          <div>
            <label
              htmlFor="new-password"
              className="font-display text-[10px] uppercase tracking-[0.2em] nav-dragon-gold"
            >
              New password
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={passwordNew}
              onChange={(e) => {
                setPasswordNew(e.target.value);
                if (passwordError) setPasswordError(null);
              }}
              required
              minLength={6}
              disabled={passwordLoading}
              className={`mt-1.5 ${FIELD_CLASS}`}
            />
          </div>
          <div>
            <label
              htmlFor="confirm-password"
              className="font-display text-[10px] uppercase tracking-[0.2em] nav-dragon-gold"
            >
              Confirm new password
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={passwordConfirm}
              onChange={(e) => {
                setPasswordConfirm(e.target.value);
                if (passwordError) setPasswordError(null);
              }}
              required
              minLength={6}
              disabled={passwordLoading}
              className={`mt-1.5 ${FIELD_CLASS}`}
            />
          </div>
          <button
            type="submit"
            disabled={passwordLoading}
            className="btn-primary disabled:cursor-not-allowed"
          >
            {passwordLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <KeyRound className="h-4 w-4" />
            )}
            Update password
          </button>
        </form>
      </section>

      <div
        className="h-px w-full bg-gradient-to-r from-transparent via-gold-600/50 to-transparent"
        aria-hidden="true"
      />

      {/* Email */}
      <section className="space-y-4" aria-labelledby="settings-email-heading">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-gold-600/45 bg-gradient-to-br from-gold-500/25 to-transparent text-accent">
            <Mail className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2
              id="settings-email-heading"
              className="font-storybook text-2xl tracking-[0.08em] nav-dragon-gold"
            >
              Change email
            </h2>
            <p className="mt-1 font-heading text-base leading-relaxed nav-dragon-gold">
              Current address:{" "}
              <span className="break-all font-semibold">{email}</span>
            </p>
            <p className="mt-1 font-heading text-sm leading-relaxed text-[#e2c06a]/85">
              Supabase will send a confirmation link to the new address. Your
              email does not change until you confirm.
            </p>
          </div>
        </div>

        {emailError ? (
          <div className="alert-error" role="alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{emailError}</p>
          </div>
        ) : null}
        {emailSuccess ? (
          <div className="alert-success" role="status">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{emailSuccess}</p>
          </div>
        ) : null}

        <form onSubmit={(e) => void handleEmailSubmit(e)} className="space-y-3">
          <div>
            <label
              htmlFor="new-email"
              className="font-display text-[10px] uppercase tracking-[0.2em] nav-dragon-gold"
            >
              New email
            </label>
            <input
              id="new-email"
              type="email"
              autoComplete="email"
              value={emailNext}
              onChange={(e) => {
                setEmailNext(e.target.value);
                if (emailError) setEmailError(null);
              }}
              required
              disabled={emailLoading}
              placeholder="new@realm.example"
              className={`mt-1.5 ${FIELD_CLASS}`}
            />
          </div>
          <div>
            <label
              htmlFor="email-password"
              className="font-display text-[10px] uppercase tracking-[0.2em] nav-dragon-gold"
            >
              Confirm with password
            </label>
            <input
              id="email-password"
              type="password"
              autoComplete="current-password"
              value={emailPassword}
              onChange={(e) => {
                setEmailPassword(e.target.value);
                if (emailError) setEmailError(null);
              }}
              required
              disabled={emailLoading}
              className={`mt-1.5 ${FIELD_CLASS}`}
            />
          </div>
          <button
            type="submit"
            disabled={emailLoading}
            className="btn-primary disabled:cursor-not-allowed"
          >
            {emailLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            Request email change
          </button>
        </form>
      </section>

      <div
        className="h-px w-full bg-gradient-to-r from-transparent via-gold-600/50 to-transparent"
        aria-hidden="true"
      />

      {/* Delete */}
      <section className="space-y-4" aria-labelledby="settings-delete-heading">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-red-800/50 bg-gradient-to-br from-red-900/40 to-transparent text-red-200">
            <Trash2 className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2
              id="settings-delete-heading"
              className="font-storybook text-2xl tracking-[0.08em] text-red-200"
            >
              Delete account
            </h2>
            <p className="mt-1 font-heading text-base leading-relaxed nav-dragon-gold">
              This permanently erases your LorePath account — profile, reading
              preferences, and book ratings. This cannot be undone.
            </p>
          </div>
        </div>

        <div
          className="rounded-sm border border-red-800/45 bg-red-950/35 px-4 py-3 font-heading text-sm leading-relaxed text-red-100"
          role="note"
        >
          <strong className="font-storybook tracking-wide">Warning:</strong>{" "}
          Deleting your account is irreversible. Any Match Score history tied to
          your ratings will be lost with them.
        </div>

        <button
          type="button"
          onClick={openDeleteDialog}
          className="inline-flex items-center justify-center gap-2 rounded-[4px] border-2 border-red-700/70 bg-gradient-to-b from-red-800/90 to-red-950 px-5 py-2.5 font-storybook text-xs font-semibold uppercase tracking-[0.16em] text-red-50 shadow-[0_8px_22px_rgba(127,29,29,0.35)] transition hover:-translate-y-0.5 hover:brightness-110"
        >
          <Trash2 className="h-4 w-4" />
          Delete my account
        </button>
      </section>

      <dialog
        ref={deleteDialogRef}
        aria-labelledby={deleteTitleId}
        className="m-auto w-[min(100%,24rem)] rounded-sm border border-red-800/50 bg-[#120a08] p-0 text-[#f5e8c7] shadow-[0_24px_60px_rgba(0,0,0,0.65)] backdrop:bg-black/70 open:flex open:flex-col"
        onCancel={(e) => {
          if (deleteLoading) e.preventDefault();
        }}
        onClick={(e) => {
          if (e.target === deleteDialogRef.current) closeDeleteDialog();
        }}
      >
        <div className="space-y-4 px-5 py-5 sm:px-6">
          <h3
            id={deleteTitleId}
            className="font-storybook text-xl tracking-[0.06em] text-red-200"
          >
            Confirm permanent deletion
          </h3>
          <p className="font-heading text-sm leading-relaxed text-[#e8d4a8]">
            Your profile, preferences, and ratings will be erased forever. Type{" "}
            <span className="font-storybook font-semibold tracking-wide text-red-200">
              {DELETE_CONFIRM_WORD}
            </span>{" "}
            below to proceed.
          </p>

          {deleteError ? (
            <div className="alert-error" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{deleteError}</p>
            </div>
          ) : null}

          <div>
            <label
              htmlFor="delete-confirm"
              className="font-display text-[10px] uppercase tracking-[0.2em] text-red-200/90"
            >
              Type {DELETE_CONFIRM_WORD} to confirm
            </label>
            <input
              id="delete-confirm"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={deleteConfirmText}
              onChange={(e) => {
                setDeleteConfirmText(e.target.value);
                if (deleteError) setDeleteError(null);
              }}
              disabled={deleteLoading}
              className={`mt-1.5 ${FIELD_CLASS}`}
            />
          </div>

          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="button"
              disabled={
                deleteLoading ||
                deleteConfirmText.trim() !== DELETE_CONFIRM_WORD
              }
              onClick={() => void handleDeleteAccount()}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-[4px] border-2 border-red-700/70 bg-gradient-to-b from-red-800/90 to-red-950 px-4 py-2.5 font-storybook text-xs font-semibold uppercase tracking-[0.14em] text-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deleteLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Delete forever
            </button>
            <button
              type="button"
              disabled={deleteLoading}
              onClick={closeDeleteDialog}
              className="btn-secondary flex-1"
            >
              Keep my account
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
