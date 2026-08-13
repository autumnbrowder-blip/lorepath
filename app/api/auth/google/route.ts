import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

const OAUTH_TIMEOUT_MS = 8000;

type CookieToSet = { name: string; value: string; options?: object };

function siteOriginFrom(request: Request): string {
  const { origin } = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  if (process.env.NODE_ENV !== "development" && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  return origin;
}

async function withDeadline<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${ms}ms`)),
          ms
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Start Google OAuth on the server so the PKCE code_verifier is written onto
 * the redirect response cookies (browser createBrowserClient was hanging /
 * dropping verifiers in production).
 */
export async function GET(request: Request) {
  const env = getSupabaseEnv();
  const siteOrigin = siteOriginFrom(request);
  const fail = NextResponse.redirect(`${siteOrigin}/login?error=auth`);

  if (!env) {
    return fail;
  }

  try {
    const cookieStore = await cookies();
    const pendingCookies: CookieToSet[] = [];

    const supabase = createServerClient(env.url, env.anonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach((cookie) => {
            pendingCookies.push(cookie);
            try {
              cookieStore.set(cookie.name, cookie.value, cookie.options);
            } catch {
              // Response cookies below are authoritative for the browser.
            }
          });
        },
      },
    });

    const { data, error } = await withDeadline(
      supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${siteOrigin}/auth/callback`,
          skipBrowserRedirect: true,
        },
      }),
      OAUTH_TIMEOUT_MS,
      "signInWithOAuth"
    );

    if (error || !data?.url) {
      console.error("[api/auth/google] oauth start failed:", {
        message: error?.message,
        hasUrl: Boolean(data?.url),
      });
      return fail;
    }

    const oauthRedirect = NextResponse.redirect(data.url);
    pendingCookies.forEach(({ name, value, options }) => {
      oauthRedirect.cookies.set(name, value, options);
    });
    return oauthRedirect;
  } catch (error) {
    console.error("[api/auth/google] failed:", error);
    return fail;
  }
}
