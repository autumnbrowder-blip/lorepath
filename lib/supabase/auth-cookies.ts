/**
 * Cookie / JWT helpers shared by Edge middleware and the Node server.
 * Keep this file Edge-safe (no Node Buffer, no next/headers).
 */

const AUTH_TOKEN_NAME = /-auth-token(?:\.\d+)?$/;
const CODE_VERIFIER_NAME = /code-verifier/i;

export function isSupabaseAuthTokenCookieName(name: string): boolean {
  if (!name || CODE_VERIFIER_NAME.test(name)) return false;
  return AUTH_TOKEN_NAME.test(name) || name.includes("-auth-token");
}

export function requestHasSupabaseAuthCookie(
  cookies: { name: string; value: string }[]
): boolean {
  return cookies.some(
    (cookie) =>
      isSupabaseAuthTokenCookieName(cookie.name) && cookie.value.trim().length > 0
  );
}

/**
 * Seconds until the access-token `exp` claim. Null when the cookie cannot be
 * parsed — callers should then fall through to a real getUser() refresh.
 */
export function accessTokenSecondsRemaining(
  cookies: { name: string; value: string }[]
): number | null {
  const token = readAccessTokenFromCookies(cookies);
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  if (typeof payload?.exp !== "number") return null;
  return payload.exp - Math.floor(Date.now() / 1000);
}

/** Best-effort email from the access-token payload (unverified). */
export function emailFromAuthCookies(
  cookies: { name: string; value: string }[]
): string | null {
  const token = readAccessTokenFromCookies(cookies);
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  const email =
    typeof payload?.email === "string"
      ? payload.email
      : typeof payload?.user_metadata === "object" &&
          payload.user_metadata &&
          typeof (payload.user_metadata as { email?: unknown }).email ===
            "string"
        ? (payload.user_metadata as { email: string }).email
        : null;
  const trimmed = email?.trim().toLowerCase();
  return trimmed || null;
}

function readAccessTokenFromCookies(
  cookies: { name: string; value: string }[]
): string | null {
  const parts = cookies
    .filter((cookie) => isSupabaseAuthTokenCookieName(cookie.name))
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true })
    );
  if (parts.length === 0) return null;

  const unchunked = parts.find((cookie) => !/\.\d+$/.test(cookie.name));
  const raw = unchunked
    ? unchunked.value
    : parts.map((cookie) => cookie.value).join("");

  return accessTokenFromCookieValue(raw);
}

function accessTokenFromCookieValue(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const candidates = [trimmed];
  try {
    candidates.push(decodeURIComponent(trimmed));
  } catch {
    // value was not URI-encoded
  }

  for (const candidate of candidates) {
    const parsed = tryParseSessionJson(candidate);
    if (parsed) return parsed;
  }

  return null;
}

function tryParseSessionJson(value: string): string | null {
  let text = value;
  if (text.startsWith("base64-")) {
    try {
      text = atob(text.slice("base64-".length));
    } catch {
      return null;
    }
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    return accessTokenFromUnknown(parsed);
  } catch {
    return null;
  }
}

function accessTokenFromUnknown(value: unknown): string | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const token = accessTokenFromUnknown(entry);
      if (token) return token;
    }
    return null;
  }
  if (typeof value !== "object") return null;
  const record = value as { access_token?: unknown };
  return typeof record.access_token === "string" && record.access_token
    ? record.access_token
    : null;
}

function decodeJwtPayload(
  jwt: string
): { exp?: number; email?: string; user_metadata?: unknown } | null {
  const parts = jwt.split(".");
  if (parts.length < 2) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded)) as {
      exp?: number;
      email?: string;
      user_metadata?: unknown;
    };
  } catch {
    return null;
  }
}
