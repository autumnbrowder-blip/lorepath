"use client";

import { createClient } from "@/lib/supabase";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { EmailOtpType } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";

const missingConfigMessage =
  "Supabase is not configured. Add real NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local, then restart the dev server.";

const SUCCESS_MESSAGE = "Your password has been updated. Returning you to sign in…";
const FALLBACK_ERROR = "Unable to update password. Please try again.";
const SESSION_MISSING_ERROR =
  "This reset link is missing or expired. Request a new password reset email.";

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

function readErrorMessage(err: unknown, fallback = FALLBACK_ERROR): string {
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string") {
      const trimmed = message.trim();
      if (trimmed && trimmed !== "{}") return trimmed;
    }
  }
  return fallback;
}

function readAuthParams(): {
  accessToken: string | null;
  refreshToken: string | null;
  code: string | null;
  tokenHash: string | null;
  type: string | null;
} {
  if (typeof window === "undefined") {
    return {
      accessToken: null,
      refreshToken: null,
      code: null,
      tokenHash: null,
      type: null,
    };
  }

  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));

  return {
    accessToken:
      query.get("access_token") ?? hash.get("access_token") ?? null,
    refreshToken:
      query.get("refresh_token") ?? hash.get("refresh_token") ?? null,
    code: query.get("code") ?? hash.get("code") ?? null,
    tokenHash: query.get("token_hash") ?? hash.get("token_hash") ?? null,
    type: query.get("type") ?? hash.get("type") ?? null,
  };
}

function clearAuthParamsFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  for (const key of [
    "access_token",
    "refresh_token",
    "code",
    "token_hash",
    "type",
    "expires_in",
    "expires_at",
    "token_type",
    "error",
    "error_code",
    "error_description",
  ]) {
    url.searchParams.delete(key);
  }
  url.hash = "";
  window.history.replaceState({}, "", `${url.pathname}${url.search}`);
}

export function ResetPasswordForm() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const configured = isSupabaseConfigured();

  useEffect(() => {
    if (!configured) {
      setCheckingSession(false);
      return;
    }

    let cancelled = false;
    const supabase = createClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setSessionReady(true);
        setCheckingSession(false);
        setError(null);
        clearAuthParamsFromUrl();
      }
    });

    async function ensureRecoverySession() {
      try {
        const { accessToken, refreshToken, code, tokenHash, type } =
          readAuthParams();

        // Implicit / hash (or query) recovery tokens
        if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (cancelled) return;

          if (sessionError) {
            console.error("[reset-password] setSession failed:", sessionError);
            setSessionReady(false);
            setError(readErrorMessage(sessionError, SESSION_MISSING_ERROR));
          } else {
            clearAuthParamsFromUrl();
            setSessionReady(true);
          }
          setCheckingSession(false);
          return;
        }

        // Email link token_hash flow (type=recovery)
        if (tokenHash && type) {
          const { error: otpError } = await supabase.auth.verifyOtp({
            type: type as EmailOtpType,
            token_hash: tokenHash,
          });

          if (cancelled) return;

          if (otpError) {
            console.error("[reset-password] verifyOtp failed:", otpError);
            setSessionReady(false);
            setError(readErrorMessage(otpError, SESSION_MISSING_ERROR));
          } else {
            clearAuthParamsFromUrl();
            setSessionReady(true);
          }
          setCheckingSession(false);
          return;
        }

        // PKCE code landed on this page
        if (code) {
          const { error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code);

          if (cancelled) return;

          if (exchangeError) {
            console.error(
              "[reset-password] exchangeCodeForSession failed:",
              exchangeError
            );
            setSessionReady(false);
            setError(readErrorMessage(exchangeError, SESSION_MISSING_ERROR));
          } else {
            clearAuthParamsFromUrl();
            setSessionReady(true);
          }
          setCheckingSession(false);
          return;
        }

        // Session may already exist (callback exchanged earlier, or client auto-detected hash)
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (cancelled) return;

        setSessionReady(Boolean(session));
        if (!session) {
          setError(SESSION_MISSING_ERROR);
        }
        setCheckingSession(false);
      } catch (err) {
        console.error("[reset-password] unexpected session error:", err);
        if (!cancelled) {
          setSessionReady(false);
          setError(readErrorMessage(err, SESSION_MISSING_ERROR));
          setCheckingSession(false);
        }
      }
    }

    void ensureRecoverySession();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [configured]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!configured) {
      setError(missingConfigMessage);
      return;
    }

    if (!sessionReady) {
      setError(SESSION_MISSING_ERROR);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        console.error("[reset-password] updateUser failed:", updateError);
        setError(readErrorMessage(updateError));
        setLoading(false);
        return;
      }

      setSuccess(true);
      setLoading(false);
      window.setTimeout(() => {
        router.push("/login?message=password_updated");
        router.refresh();
      }, 1200);
    } catch (err) {
      console.error("[reset-password] unexpected update error:", err);
      setError(readErrorMessage(err));
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 py-8 text-[#0f2a22]"
        style={{ fontFamily: bodyFont }}
      >
        <Loader2 className="h-6 w-6 animate-spin text-[#a67c2d]" />
        <p className="text-base">Preparing your reset…</p>
      </div>
    );
  }

  if (!configured) {
    return (
      <div style={{ fontFamily: bodyFont }}>
        <div className="alert-error mb-4">{missingConfigMessage}</div>
        <p className="text-center">
          <Link
            href="/login"
            className="font-semibold text-[#0f2a22] underline underline-offset-4 decoration-[#a67c2d]/70"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="text-center" style={{ fontFamily: bodyFont }}>
        <h1
          className="metallic-emerald mb-2 text-3xl font-normal tracking-[0.06em]"
          style={{ fontFamily: storybookFont }}
        >
          Password updated
        </h1>
        <p className="mb-6 text-lg leading-relaxed text-[#0f2a22]">
          {SUCCESS_MESSAGE}
        </p>
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-[#a67c2d]" />
      </div>
    );
  }

  if (!sessionReady) {
    return (
      <div className="text-center" style={{ fontFamily: bodyFont }}>
        <h1
          className="metallic-emerald-deep mb-2 text-3xl font-normal tracking-[0.06em]"
          style={{ fontFamily: storybookFont }}
        >
          Link expired
        </h1>
        <p className="mb-6 text-lg leading-relaxed text-[#0f2a22]">
          This password reset link is missing or no longer valid. Request a new
          one from the forgot password page.
        </p>
        {typeof error === "string" && error.length > 0 ? (
          <div className="alert-error mb-4 text-left">{error}</div>
        ) : null}
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/forgot-password"
            className="inline-flex items-center justify-center rounded-[4px] px-5 py-3 text-sm font-normal tracking-[0.06em] transition hover:-translate-y-0.5"
            style={parchmentButtonStyle}
          >
            Request a new link
          </Link>
          <Link
            href="/login"
            className="font-semibold text-[#0f2a22] underline underline-offset-4 decoration-[#a67c2d]/70 hover:decoration-[#a67c2d]"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: bodyFont }}>
      <p
        className="metallic-emerald-deep mb-1 text-[11px] font-bold uppercase tracking-[0.28em]"
        style={{ fontFamily: storybookFont }}
      >
        New Ward
      </p>
      <h1
        className="metallic-emerald-deep mb-2 text-3xl font-normal tracking-[0.06em]"
        style={{ fontFamily: storybookFont }}
      >
        Set New Password
      </h1>
      <p className="mb-7 text-lg leading-relaxed text-[#0f2a22]">
        Choose a new password for your LorePath account, then return to the
        archives.
      </p>

      {typeof error === "string" && error.length > 0 ? (
        <div className="alert-error mb-4">{error}</div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="password"
            className="mb-1.5 block text-sm font-normal tracking-[0.04em] text-[#5c3f0f]"
            style={{ fontFamily: storybookFont }}
          >
            New password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            placeholder="••••••••"
            className="w-full rounded-[4px] px-3 py-2.5 text-base placeholder:text-[#5c3f0f]/60 focus:outline-none focus:ring-1 focus:ring-[#a67c2d]/50"
            style={parchmentFieldStyle}
          />
        </div>

        <div>
          <label
            htmlFor="confirmPassword"
            className="mb-1.5 block text-sm font-normal tracking-[0.04em] text-[#5c3f0f]"
            style={{ fontFamily: storybookFont }}
          >
            Confirm password
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            placeholder="••••••••"
            className="w-full rounded-[4px] px-3 py-2.5 text-base placeholder:text-[#5c3f0f]/60 focus:outline-none focus:ring-1 focus:ring-[#a67c2d]/50"
            style={parchmentFieldStyle}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-[4px] px-5 py-3 text-sm font-normal tracking-[0.08em] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          style={parchmentButtonStyle}
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Update password
        </button>
      </form>
    </div>
  );
}
