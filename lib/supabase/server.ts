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

  if (bearer) {
    const { data, error } = await cookieClient.auth.getUser(bearer);
    if (error || !data.user) {
      return { error: "Unauthorized.", code: error?.code ?? "invalid_token" };
    }
    user = data.user;
    accessToken = bearer;
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
  }

  // Fresh client: Authorization is set globally so every PostgREST call is
  // authenticated. Do not rely on cookie storage bridging for RLS writes.
  const supabase = createSupabaseClient(env.url, env.anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      fetch: noStoreFetch,
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
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
