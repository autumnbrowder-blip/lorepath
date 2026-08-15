import { createServerClient } from "@supabase/ssr";
import {
  createClient as createSupabaseClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { cache } from "react";
import { requestHasSupabaseAuthCookie } from "@/lib/supabase/auth-cookies";
import { getSupabaseEnv, isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Preserve Authorization / apikey headers. Spreading a Headers instance into a
 * plain object drops entries; Next's fetch cache can also mishandle auth when
 * headers are not re-applied explicitly.
 */
export function noStoreFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(init?.headers ?? undefined);

  if (input instanceof Request) {
    input.headers.forEach((value, key) => {
      if (!headers.has(key)) {
        headers.set(key, value);
      }
    });
  }

  return fetch(input, {
    ...init,
    headers,
    cache: "no-store",
  });
}

/**
 * Fetch wrapper that ALWAYS sends the user JWT on PostgREST calls.
 *
 * supabase-js `fetchWithAuth` does:
 *   accessToken = (await getAccessToken()) ?? supabaseKey  // anon key fallback!
 *   if (!headers.has('Authorization')) headers.set('Authorization', Bearer accessToken)
 *
 * If no auth session is attached, that becomes `Authorization: Bearer <anon key>`.
 * PostgREST then runs as role `anon`, `auth.uid()` is null, and RLS INSERT/UPDATE
 * fails with "new row violates row-level security policy".
 *
 * Setting only `global.headers.Authorization` is unreliable: it can be missing from
 * the per-request init, so fetchWithAuth fills in the anon key instead. Forcing the
 * user JWT here (after fetchWithAuth) guarantees auth.uid() matches the verified user.
 */
function createUserJwtFetch(accessToken: string, anonKey: string) {
  return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers ?? undefined);

    // Own Authorization — overwrite anon-key fallback from fetchWithAuth.
    headers.set("Authorization", `Bearer ${accessToken}`);
    if (!headers.has("apikey")) {
      headers.set("apikey", anonKey);
    }

    if (input instanceof Request) {
      input.headers.forEach((value, key) => {
        if (key.toLowerCase() === "authorization") return;
        if (!headers.has(key)) {
          headers.set(key, value);
        }
      });
    }

    return fetch(input, {
      ...init,
      headers,
      cache: "no-store",
    });
  };
}

export async function createClient() {
  const env = getSupabaseEnv();
  if (!env) {
    throw new Error(
      "Supabase is not configured. Add real NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local."
    );
  }

  const cookieStore = await cookies();

  return createServerClient(env.url, env.anonKey, {
    global: {
      fetch: noStoreFetch,
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component — middleware handles session refresh.
        }
      },
    },
  });
}

export type AuthenticatedClientResult =
  | { supabase: SupabaseClient; user: User; accessToken: string }
  | { error: string; code?: string };

export type VerifiedUserResult =
  | { user: User; accessToken: string }
  | { error: string; code?: string };

/**
 * True when this request carries a Supabase auth-token cookie.
 * Anonymous page loads should skip getUser() entirely.
 */
export async function hasRequestAuthCookie(): Promise<boolean> {
  const store = await cookies();
  return requestHasSupabaseAuthCookie(store.getAll());
}

/**
 * Per-request cached auth user. Skips GoTrue when there is no auth cookie.
 * Use in Server Components that only need "who is signed in".
 */
export const getCachedUser = cache(async (): Promise<User | null> => {
  if (!isSupabaseConfigured()) return null;
  try {
    if (!(await hasRequestAuthCookie())) return null;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user ?? null;
  } catch {
    return null;
  }
});

/**
 * Verify the JWT (Bearer preferred, else cookie session) and return user + token.
 * Does not call setSession — that extra GoTrue round-trip is unused because
 * trusted writes go through the service role client.
 */
export async function getVerifiedUser(options?: {
  accessToken?: string | null;
}): Promise<VerifiedUserResult> {
  const env = getSupabaseEnv();
  if (!env) {
    return { error: "Supabase is not configured." };
  }

  const cookieClient = await createClient();
  const bearer = options?.accessToken?.trim() || null;

  if (bearer) {
    const { data, error } = await cookieClient.auth.getUser(bearer);
    if (error || !data.user) {
      return { error: "Unauthorized.", code: error?.code ?? "invalid_token" };
    }
    return { user: data.user, accessToken: bearer };
  }

  if (!(await hasRequestAuthCookie())) {
    return { error: "Unauthorized.", code: "no_user" };
  }

  const {
    data: { user },
    error: userError,
  } = await cookieClient.auth.getUser();

  if (userError || !user) {
    return { error: "Unauthorized.", code: userError?.code ?? "no_user" };
  }

  const {
    data: { session },
  } = await cookieClient.auth.getSession();

  if (!session?.access_token) {
    return {
      error:
        "Signed in but no access token was available for the database request. Sign out and back in.",
      code: "missing_access_token",
    };
  }

  return { user, accessToken: session.access_token };
}

/**
 * Service-role PostgREST client when configured; otherwise the cookie SSR client.
 * Prefer this for trusted reads so we never pay for getUser/getSession/setSession.
 */
export async function getServiceRoleOrCookieClient(): Promise<SupabaseClient | null> {
  if (!isSupabaseConfigured()) return null;
  const admin = createServiceRoleClient();
  if (!("error" in admin)) return admin.supabase;
  try {
    return await createClient();
  } catch {
    return null;
  }
}

/**
 * Build a PostgREST client that ALWAYS sends the user JWT.
 *
 * Cookie-bridged createServerClient can validate via auth.getUser() while still
 * omitting Authorization on .from() writes (auth.uid() → null → RLS 42501).
 * Prefer an explicit Bearer token (from the browser Authorization header or
 * cookie session) on every DB call.
 *
 * Wiring (no setSession — that was an extra Auth round-trip on every call):
 * 1. Custom fetch that forcibly sets Authorization to the user JWT
 * 2. `accessToken` callback so fetchWithAuth never falls back to the anon key
 */
export async function createAuthenticatedClient(options?: {
  accessToken?: string | null;
}): Promise<AuthenticatedClientResult> {
  const env = getSupabaseEnv();
  if (!env) {
    return { error: "Supabase is not configured." };
  }

  const verified = await getVerifiedUser(options);
  if ("error" in verified) {
    return verified;
  }

  const { user, accessToken } = verified;
  const jwtFetch = createUserJwtFetch(accessToken, env.anonKey);
  const supabase = createSupabaseClient(env.url, env.anonKey, {
    accessToken: async () => accessToken,
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
      fetch: jwtFetch,
    },
  });

  return { supabase, user, accessToken };
}

/** Extract Bearer token from an incoming Request (Route Handlers). */
export function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

const MISSING_SERVICE_ROLE_HINT =
  "Server is missing SUPABASE_SERVICE_ROLE_KEY. Add it in Netlify → Site configuration → Environment variables and in .env.local (Supabase Dashboard → Project Settings → API → service_role secret). Redeploy, sign in again, then retry.";

/**
 * Resolve the service role key (server-only). Prefer SUPABASE_SERVICE_ROLE_KEY;
 * accept a few common aliases used in older projects. Never log the value.
 */
function getServiceRoleKey(): string | null {
  const candidates = [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SERVICE_ROLE_KEY,
    process.env.SUPABASE_SERVICE_KEY,
  ];

  for (const raw of candidates) {
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value) continue;
    if (/your-service|your-supabase|changeme|placeholder/i.test(value)) {
      continue;
    }
    return value;
  }

  return null;
}

export type ServiceRoleClientResult =
  | { supabase: SupabaseClient }
  | { error: string };

/**
 * Server-only Supabase client that bypasses RLS (service_role).
 * Use ONLY after verifying the user JWT, and ALWAYS stamp user_id / rated_by
 * from the verified user.id — never from the request body.
 *
 * RLS policies remain defense-in-depth for direct browser/anon access;
 * trusted server writes use this client after auth.
 */
export function createServiceRoleClient(): ServiceRoleClientResult {
  const env = getSupabaseEnv();
  if (!env) {
    return { error: "Supabase is not configured." };
  }

  const serviceRoleKey = getServiceRoleKey();
  if (!serviceRoleKey) {
    return { error: MISSING_SERVICE_ROLE_HINT };
  }

  const supabase = createSupabaseClient(env.url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: noStoreFetch,
    },
  });

  return { supabase };
}
