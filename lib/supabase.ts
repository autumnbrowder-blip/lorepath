import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "@/lib/supabase/config";
import { SUPABASE_CLIENT_TIMEOUT_MS, timedFetch } from "@/lib/supabase/fetch";

export function createClient() {
  const env = getSupabaseEnv();
  if (!env) {
    throw new Error(
      "Supabase is not configured. Add real NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local."
    );
  }

  return createBrowserClient(env.url, env.anonKey, {
    global: {
      // Without a bound here, an unresponsive Supabase leaves sign-in spinning
      // forever: the request never settles, so the form's error handling never
      // runs and the visitor gets no feedback at all.
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        timedFetch(input, { ...init }, SUPABASE_CLIENT_TIMEOUT_MS),
    },
  });
}
