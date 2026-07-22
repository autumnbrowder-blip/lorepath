"use client";

import { createClient } from "@/lib/supabase";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useState, type CSSProperties } from "react";

const missingConfigMessage =
  "Supabase is not configured. Add real NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local, then restart the dev server.";

const SUCCESS_MESSAGE =
  "If an account exists for that email, a recovery link has been sent.";

const FALLBACK_ERROR =
  "Unable to send recovery email. Please try again.";

/** Production reset page — never localhost. */
const RESET_PASSWORD_REDIRECT = "https://lorepath.net/reset-password";

const storybookFont =
  "var(--font-storybook), var(--font-display), Georgia, serif";
const bodyFont = "var(--font-heading), Georgia, serif";
const antiqueGold = "#a67c2d";
const antiqueGoldSoft = "#b38b4d";

const parchmentFieldStyle: CSSProperties = {
  backgroundColor: "rgba(245, 232, 199, 0.85)",
  color: "#2f1f0f",
  border: `1.5px solid ${antiqueGold}`,
  boxShadow: "inset 0 2px 7px rgba(63, 42, 30, 0.16)",
  WebkitTextFillColor: "#2f1f0f",
  caretColor: "#2f1f0f",
  colorScheme: "light",
  fontFamily: bodyFont,
};

const parchmentButtonStyle: CSSProperties = {
  fontFamily: storybookFont,
  color: "#2f1f0f",
  background: `linear-gradient(180deg, #d0b67a 0%, ${antiqueGoldSoft} 45%, ${antiqueGold} 100%)`,
  border: `2px solid ${antiqueGold}`,
  boxShadow:
    "0 4px 12px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,248,230,0.5), inset 0 -2px 4px rgba(90,60,20,0.18)",
};

function readErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string") {
      const trimmed = message.trim();
      // Supabase sometimes surfaces empty JSON bodies as the literal "{}"
      if (trimmed && trimmed !== "{}") return trimmed;
    }
  }
  return FALLBACK_ERROR;
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const configured = isSupabaseConfigured();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!configured) {
      setError(missingConfigMessage);
      return;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Please enter your email address.");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        trimmedEmail,
        {
          redirectTo: RESET_PASSWORD_REDIRECT,
        }
      );

      if (resetError) {
        console.error("[forgot-password] resetPasswordForEmail failed:", resetError);
        setError(readErrorMessage(resetError));
        return;
      }

      setSuccess(true);
    } catch (err) {
      console.error("[forgot-password] unexpected error:", err);
      setError(readErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="text-center" style={{ fontFamily: bodyFont }}>
        <h1
          className="metallic-emerald mb-2 text-3xl font-normal tracking-[0.06em]"
          style={{ fontFamily: storybookFont }}
        >
          Check your email
        </h1>
        <p className="mb-6 text-lg leading-relaxed text-[#0f2a22]">
          {SUCCESS_MESSAGE}
        </p>
        <Link
          href="/login"
          className="inline-flex items-center justify-center rounded-[4px] px-5 py-3 text-sm font-normal tracking-[0.06em] transition hover:-translate-y-0.5"
          style={parchmentButtonStyle}
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: bodyFont }}>
      <p
        className="metallic-emerald-deep mb-1 text-[11px] font-bold uppercase tracking-[0.28em]"
        style={{ fontFamily: storybookFont }}
      >
        Recover the Key
      </p>
      <h1
        className="metallic-emerald-deep mb-2 text-3xl font-normal tracking-[0.06em]"
        style={{ fontFamily: storybookFont }}
      >
        Forgot Password
      </h1>
      <p className="mb-7 text-lg leading-relaxed text-[#0f2a22]">
        Enter the email for your archive account and we will send a link to set
        a new password.
      </p>

      {!configured && (
        <div className="alert-error mb-4">{missingConfigMessage}</div>
      )}
      {typeof error === "string" && error.length > 0 ? (
        <div className="alert-error mb-4">{error}</div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="mb-1.5 block text-sm font-normal tracking-[0.04em] text-[#5c3f0f]"
            style={{ fontFamily: storybookFont }}
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="w-full rounded-[4px] px-3 py-2.5 text-base placeholder:text-[#5c3f0f]/60 focus:outline-none focus:ring-1 focus:ring-[#a67c2d]/50"
            style={parchmentFieldStyle}
          />
        </div>

        <button
          type="submit"
          disabled={!configured || loading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-[4px] px-5 py-3 text-sm font-normal tracking-[0.08em] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          style={parchmentButtonStyle}
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Send reset link
        </button>
      </form>

      <p
        className="mt-7 text-center text-base leading-relaxed text-[#0f2a22]"
        style={{ fontFamily: bodyFont }}
      >
        Remembered your password?{" "}
        <Link
          href="/login"
          className="font-semibold text-[#0f2a22] underline underline-offset-4 decoration-[#a67c2d]/70 hover:decoration-[#a67c2d]"
          style={{ fontFamily: bodyFont }}
        >
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
