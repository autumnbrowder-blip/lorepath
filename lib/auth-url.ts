/**
 * Stable origin for auth email / OAuth redirects.
 * Prefer NEXT_PUBLIC_SITE_URL so links always hit the running server
 * (avoids broken links when a second Next process landed on :3001).
 */
export function getSiteOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "http://localhost:3000";
}

/** Allowlisted callback path — keep this exact string in Supabase Redirect URLs.
 * Used for OAuth, email confirmation, and password-reset recovery (`next=/reset-password`).
 */
export function getAuthCallbackUrl(nextPath = "/"): string {
  const origin = getSiteOrigin();
  const next = nextPath.startsWith("/") ? nextPath : `/${nextPath}`;
  if (next === "/") {
    return `${origin}/auth/callback`;
  }
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
}
