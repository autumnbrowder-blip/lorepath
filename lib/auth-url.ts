/** Canonical live site — password-reset emails always redirect here. */
export const PRODUCTION_SITE_ORIGIN = "https://lorepath.net";

function isLocalhostOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]" ||
      hostname.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

/**
 * Stable origin for auth email / OAuth redirects.
 * Prefer a non-localhost NEXT_PUBLIC_SITE_URL, then the browser origin when
 * not on localhost (so a mis-set env cannot send production users to :3000).
 */
export function getSiteOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");

  if (fromEnv && !isLocalhostOrigin(fromEnv)) {
    return fromEnv;
  }

  if (typeof window !== "undefined") {
    const browserOrigin = window.location.origin;
    if (!isLocalhostOrigin(browserOrigin)) {
      return browserOrigin;
    }
  }

  // Local development only — never used for password-reset emails.
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined") return window.location.origin;

  return "http://localhost:3000";
}

/** Allowlisted callback path — keep this exact string in Supabase Redirect URLs.
 * Used for OAuth and email confirmation. Password reset uses /reset-password directly.
 */
export function getAuthCallbackUrl(nextPath = "/profile"): string {
  const origin = getSiteOrigin();
  const next = nextPath.startsWith("/") ? nextPath : `/${nextPath}`;
  // Default post-auth destination is /profile; omit query so callback uses its default.
  if (next === "/profile") {
    return `${origin}/auth/callback`;
  }
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
}

/**
 * Password-reset redirect for the live site.
 * ForgotPasswordForm prefers `${window.location.origin}/reset-password`
 * (and never emits localhost).
 */
export function getPasswordResetRedirectUrl(): string {
  return `${PRODUCTION_SITE_ORIGIN}/reset-password`;
}
