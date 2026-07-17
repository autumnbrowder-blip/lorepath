"use client";

import { getAuthCallbackUrl } from "@/lib/auth-url";
import { createClient } from "@/lib/supabase";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";

const missingConfigMessage =
  "Supabase is not configured. Add real NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local, then restart the dev server.";

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

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

type LoginFormProps = {
  /** Server-computed flag; falls back to client env check when omitted. */
  configured?: boolean;
};

export function LoginForm({ configured: configuredProp }: LoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "/profile";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const configured = configuredProp ?? isSupabaseConfigured();

  useEffect(() => {
    const authError = searchParams.get("error");
    const message = searchParams.get("message");
    if (authError === "auth_callback_failed") {
      setError(
        "That confirmation link could not finish signing you in. Make sure LorePath is running at http://localhost:3000, then request a new confirmation email or try signing in."
      );
    } else if (authError === "supabase_not_configured") {
      // Stale query param from an earlier misconfigured session — ignore when env is valid.
      if (!configured) {
        setError(missingConfigMessage);
      } else {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("error");
        const qs = params.toString();
        router.replace(qs ? `/login?${qs}` : "/login");
      }
    } else if (message === "password_updated") {
      setSuccessMessage(
        "Your password has been updated. Sign in with your new credentials."
      );
    } else if (message === "preferences") {
      setSuccessMessage("Please sign in to access your preferences.");
    }
  }, [searchParams, configured, router]);

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!configured) {
      setError(missingConfigMessage);
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }

      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setError(null);

    if (!configured) {
      setError(missingConfigMessage);
      return;
    }

    setGoogleLoading(true);

    try {
      const supabase = createClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: getAuthCallbackUrl(redirectTo),
        },
      });

      if (oauthError) {
        setError(oauthError.message);
        setGoogleLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign in failed.");
      setGoogleLoading(false);
    }
  }

  return (
    <div style={{ fontFamily: bodyFont }}>
      <p
        className="metallic-emerald-deep mb-1 text-[11px] font-bold uppercase tracking-[0.28em]"
        style={{ fontFamily: storybookFont }}
      >
        Cross the Threshold
      </p>
      <h1
        className="metallic-emerald-deep mb-2 text-3xl font-normal tracking-[0.06em]"
        style={{ fontFamily: storybookFont }}
      >
        Return to the Library
      </h1>
      <p className="mb-7 text-lg leading-relaxed text-[#0f2a22]">
        Sign in to step through the portal and continue your journey through the
        archives.
      </p>

      {!configured && (
        <div className="alert-error mb-4">{missingConfigMessage}</div>
      )}
      {successMessage && (
        <div className="alert-success mb-4">{successMessage}</div>
      )}
      {error && <div className="alert-error mb-4">{error}</div>}

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={!configured || googleLoading || loading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-[4px] px-5 py-2.5 text-sm font-normal tracking-[0.06em] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          style={parchmentButtonStyle}
        >
        {googleLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <GoogleIcon />
        )}
        Continue with Google
      </button>

      <div className="my-6 flex items-center gap-3">
        <div
          className="h-px flex-1"
          style={{ backgroundColor: `${antiqueGold}66` }}
        />
        <span className="text-xs text-[#5c3f0f]/80">or</span>
        <div
          className="h-px flex-1"
          style={{ backgroundColor: `${antiqueGold}66` }}
        />
      </div>

      <form onSubmit={handleEmailLogin} className="space-y-4">
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

        <div>
          <label
            htmlFor="password"
            className="mb-1.5 block text-sm font-normal tracking-[0.04em] text-[#5c3f0f]"
            style={{ fontFamily: storybookFont }}
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            placeholder="••••••••"
            className="w-full rounded-[4px] px-3 py-2.5 text-base placeholder:text-[#5c3f0f]/60 focus:outline-none focus:ring-1 focus:ring-[#a67c2d]/50"
            style={parchmentFieldStyle}
          />
        </div>

        <button
          type="submit"
          disabled={!configured || loading || googleLoading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-[4px] px-5 py-3 text-sm font-normal tracking-[0.08em] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          style={parchmentButtonStyle}
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Sign in to the Archives
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-[#0f2a22]">
        <Link
          href="/forgot-password"
          className="font-semibold text-[#0f2a22] underline underline-offset-4 decoration-[#a67c2d]/70 hover:decoration-[#a67c2d]"
          style={{ fontFamily: bodyFont }}
        >
          Forgot Password?
        </Link>
      </p>

      <p
        className="mt-7 text-center text-base leading-relaxed text-[#0f2a22]"
        style={{ fontFamily: bodyFont }}
      >
        Don&apos;t have an account?{" "}
        <Link
          href={`/register${redirectTo !== "/profile" ? `?redirect=${encodeURIComponent(redirectTo)}` : ""}`}
          className="font-semibold text-[#0f2a22] underline underline-offset-4 decoration-[#a67c2d]/70 hover:decoration-[#a67c2d]"
          style={{ fontFamily: bodyFont }}
        >
          Create one
        </Link>
      </p>
    </div>
  );
}
