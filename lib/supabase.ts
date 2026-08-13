import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "@/lib/supabase/config";

/**
 * Browser Supabase client. Requires:
 * - NEXT_PUBLIC_SUPABASE_URL
 * - NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * Prefer `/api/auth/login` and `/api/auth/google` for sign-in — those set
 * session cookies on the HTTP response. This client is for client-side
 * session reads and non-login auth helpers.
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
