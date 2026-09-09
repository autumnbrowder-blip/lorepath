import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "@/lib/supabase/config";

/**
 * The only browser Supabase client. AuthNav, RatingForm, Preferences, and
 * other client components must use this factory so they share one cookie jar.
 *
 * Cookie options follow @supabase/ssr defaults (path `/`, SameSite=Lax).
 * Do not set Domain=.localhost — host-only cookies work on lorepath.net and
 * localhost. Production is HTTPS, so the browser may mark cookies Secure.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const env = getSupabaseEnv();

  if (!env || !url?.trim() || !anonKey?.trim()) {
    throw new Error(
      "Supabase is not configured. Add real NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  return createBrowserClient(env.url, env.anonKey, {
    isSingleton: true,
    cookieOptions: {
      path: "/",
      sameSite: "lax",
    },
    auth: {
      // Avoid rare LockManager deadlocks that leave auth calls pending forever
      // with no network request.
      lock: async (
        _name: string,
        _acquireTimeout: number,
        fn: () => Promise<unknown>
      ) => fn(),
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  });
}

/**
 * Browser access token for authenticated API writes.
 * Returns null when there is no session — callers must not hit PostgREST.
 */
export async function getBrowserAccessToken(): Promise<string | null> {
  try {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return null;
    const token = session.access_token?.trim();
    return token || null;
  } catch {
    return null;
  }
}

/**
 * Fetch with the current access token. On 401, refreshSession() once and
 * retry. Does not sign the user out — a single 401 must not flip the navbar.
 */
export async function fetchWithAuthRetry(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const send = async (accessToken: string | null) => {
    const headers = new Headers(init.headers);
    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }
    return fetch(input, {
      ...init,
      headers,
      credentials: init.credentials ?? "include",
    });
  };

  let token = await getBrowserAccessToken();
  const response = await send(token);
  if (response.status !== 401) return response;

  try {
    const supabase = createClient();
    const { data } = await supabase.auth.refreshSession();
    const retryToken = data.session?.access_token?.trim() || null;
    if (!retryToken) return response;
    return await send(retryToken);
  } catch {
    return response;
  }
}
