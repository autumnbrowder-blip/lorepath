import { createServerClient } from "@supabase/ssr";
import {
  createClient as createSupabaseClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "@/lib/supabase/config";

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

/**
 * Build a PostgREST client that ALWAYS sends the user JWT.
 *
 * Cookie-bridged createServerClient can validate via auth.getUser() while still
 * omitting Authorization on .from() writes (auth.uid() → null → RLS 42501).
 * Prefer an explicit Bearer token (from the browser Authorization header or
 * cookie session) on every DB call.
 *
 * Durable JWT wiring (all three layers):
 * 1. Custom fetch that forcibly sets Authorization to the user JWT (overwrites
 *    fetchWithAuth's anon-key fallback)
 * 2. `accessToken` callback when no refresh_token (supabase-js 2.110.x) so
 *    getAccessToken() returns the user JWT
 * 3. `setSession` when a refresh_token is available so auth.getSession() also
 *    returns the JWT for any code that reads the session
 */
export async function createAuthenticatedClient(options?: {
  accessToken?: string | null;
}): Promise<AuthenticatedClientResult> {
  const env = getSupabaseEnv();
  if (!env) {
    return { error: "Supabase is not configured." };
  }

  const cookieClient = await createClient();
  const bearer = options?.accessToken?.trim() || null;

  let user: User;
  let accessToken: string;
  let refreshToken: string | null = null;

  if (bearer) {
    const { data, error } = await cookieClient.auth.getUser(bearer);
    if (error || !data.user) {
      return { error: "Unauthorized.", code: error?.code ?? "invalid_token" };
    }
    user = data.user;
    accessToken = bearer;

    // Same browser session may still have a refresh_token in cookies.
    const {
      data: { session },
    } = await cookieClient.auth.getSession();
    if (session?.user?.id === user.id && session.refresh_token) {
      refreshToken = session.refresh_token;
    }
  } else {
    const {
      data: { user: cookieUser },
      error: userError,
    } = await cookieClient.auth.getUser();

    if (userError || !cookieUser) {
      return { error: "Unauthorized.", code: userError?.code ?? "no_user" };
    }
    user = cookieUser;

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
    accessToken = session.access_token;
    refreshToken = session.refresh_token ?? null;
  }

  const jwtFetch = createUserJwtFetch(accessToken, env.anonKey);
  const authHeader = { Authorization: `Bearer ${accessToken}` };

  // Prefer setSession when we have a refresh_token — keeps supabase.auth usable
  // and makes getAccessToken() return the user JWT from the session.
  if (refreshToken) {
    const sessionClient = createSupabaseClient(env.url, env.anonKey, {
      global: {
        headers: authHeader,
        fetch: jwtFetch,
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { error: sessionError } = await sessionClient.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (!sessionError) {
      return { supabase: sessionClient, user, accessToken };
    }
  }

  // Bearer-only (or setSession failed): use accessToken callback so fetchWithAuth
  // never falls back to the anon key. (Disables supabase.auth on this client.)
  const supabase = createSupabaseClient(env.url, env.anonKey, {
    accessToken: async () => accessToken,
    global: {
      headers: authHeader,
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
