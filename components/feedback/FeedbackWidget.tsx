"use client";

import { createClient } from "@/lib/supabase";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";

type FormStatus = "idle" | "submitting" | "success" | "error";

/** Forced UI copy — keep in sync with product wording. */
const SUBJECT_LABEL = "Subject";
const SUBJECT_PLACEHOLDER = "A note from the shelves\u2026";
const MESSAGE_LABEL = "Message";
const MESSAGE_PLACEHOLDER =
  "Tell us what stirred, broke, or could be better\u2026";
const SUBMIT_LABEL = "Send Feedback";
const SUBMITTING_LABEL = "Sending\u2026";

type FeedbackModalProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * Authenticated-only feedback modal. Callers must only open this for signed-in users;
 * if a session is missing, we send the traveler to /login.
 */
export function FeedbackModal({ open, onClose }: FeedbackModalProps) {
  const pathname = usePathname();
  const router = useRouter();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const [mounted, setMounted] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<FormStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const close = useCallback(() => {
    if (status === "submitting") return;
    onClose();
    setStatus("idle");
    setError(null);
  }, [onClose, status]);

  // Auth gate: logged-out users cannot use feedback.
  useEffect(() => {
    if (!open) return;
    if (!isSupabaseConfigured()) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname || "/")}`);
      onClose();
      return;
    }

    let cancelled = false;
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled) return;
      if (!user) {
        router.replace(
          `/login?redirect=${encodeURIComponent(pathname || "/")}`
        );
        onClose();
        return;
      }
      if (user.email) {
        setEmail((prev) => prev || user.email || "");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [open, onClose, pathname, router]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const t = window.setTimeout(() => firstFieldRef.current?.focus(), 30);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(t);
    };
  }, [open, close]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      setStatus("error");
      setError("A message is required before the raven can fly.");
      return;
    }

    if (!isSupabaseConfigured()) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname || "/")}`);
      return;
    }

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token || !session.user) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname || "/")}`);
      onClose();
      return;
    }

    const trimmedSubject = subject.trim();
    const composedMessage = trimmedSubject
      ? `${trimmedSubject}\n\n${trimmedMessage}`
      : trimmedMessage;

    setStatus("submitting");

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          page_path: pathname || "/",
          message: composedMessage,
          email: email.trim() || undefined,
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        code?: string;
      } | null;

      if (response.status === 401) {
        router.replace(
          `/login?redirect=${encodeURIComponent(pathname || "/")}`
        );
        onClose();
        return;
      }

      if (!response.ok) {
        setStatus("error");
        setError(
          payload?.error ??
            "The raven returned empty-handed. Please try again in a moment."
        );
        return;
      }

      setStatus("success");
      setSubject("");
      setMessage("");
    } catch {
      setStatus("error");
      setError(
        "The raven could not find the path. Check your connection and try again."
      );
    }
  }

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-[#050a08]/72 backdrop-blur-[2px]"
        aria-label="Close feedback"
        onClick={close}
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[min(92vh,36rem)] w-full max-w-md flex-col overflow-hidden rounded-t-sm border border-gold-600/45 bg-[#0a1812] shadow-[0_24px_60px_rgba(0,0,0,0.65),0_0_0_1px_rgba(166,124,45,0.28)] sm:rounded-sm"
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage: "url('/images/parchment.jpg')",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0a1812]/55 via-[#0a1812]/82 to-[#07120c]/95"
          aria-hidden="true"
        />

        <div className="relative z-10 flex items-start justify-between gap-3 border-b border-gold-600/30 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="font-display text-[10px] uppercase tracking-[0.22em] text-[#e2c06a]/75">
              A note for the keepers
            </p>
            <h2
              id={titleId}
              className="font-storybook text-lg tracking-wide nav-dragon-gold sm:text-xl"
            >
              Send Feedback
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-sm border border-gold-600/35 p-1.5 text-[#e2c06a] transition-colors hover:border-gold-500/55 hover:bg-[#123229] hover:text-[#f0d78a]"
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="relative z-10 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
          {status === "success" ? (
            <div className="space-y-4 py-2 text-center">
              <p className="font-heading text-lg leading-snug nav-dragon-gold">
                Your note has been inscribed in the ledger. Thank you,
                traveler.
              </p>
              <button type="button" className="btn-primary" onClick={close}>
                Close
              </button>
            </div>
          ) : (
            <form
              key="feedback-form-auth"
              onSubmit={onSubmit}
              className="space-y-3.5"
            >
              <label className="block space-y-1.5">
                <span className="font-display text-[10px] uppercase tracking-[0.18em] text-[#e2c06a]/80">
                  {SUBJECT_LABEL}
                </span>
                <input
                  ref={firstFieldRef}
                  type="text"
                  name="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={120}
                  className="w-full rounded-sm border border-gold-600/40 bg-forest-950/70 px-3 py-2 font-heading text-sm text-[#f0ead8] outline-none placeholder:text-[#e2c06a]/40 focus:border-gold-500/70"
                  placeholder={SUBJECT_PLACEHOLDER}
                  autoComplete="off"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="font-display text-[10px] uppercase tracking-[0.18em] text-[#e2c06a]/80">
                  {MESSAGE_LABEL}{" "}
                  <span className="text-[#e2c06a]/55">*</span>
                </span>
                <textarea
                  name="message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                  maxLength={2000}
                  rows={4}
                  className="w-full resize-y rounded-sm border border-gold-600/40 bg-forest-950/70 px-3 py-2 font-heading text-sm leading-relaxed text-[#f0ead8] outline-none placeholder:text-[#e2c06a]/40 focus:border-gold-500/70"
                  placeholder={MESSAGE_PLACEHOLDER}
                />
              </label>

              <label className="block space-y-1.5">
                <span className="font-display text-[10px] uppercase tracking-[0.18em] text-[#e2c06a]/80">
                  Email{" "}
                  <span className="normal-case tracking-normal text-[#e2c06a]/55">
                    (optional)
                  </span>
                </span>
                <input
                  type="email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={254}
                  className="w-full rounded-sm border border-gold-600/40 bg-forest-950/70 px-3 py-2 font-heading text-sm text-[#f0ead8] outline-none placeholder:text-[#e2c06a]/40 focus:border-gold-500/70"
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </label>

              {error ? (
                <p
                  className="rounded-sm border border-red-800/40 bg-red-950/40 px-3 py-2 font-heading text-sm text-[#f0c0b0]"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={close}
                  disabled={status === "submitting"}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={status === "submitting"}
                >
                  {status === "submitting" ? SUBMITTING_LABEL : SUBMIT_LABEL}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
