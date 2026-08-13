import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

const CALLBACK_TIMEOUT_MS = 8000;

function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

function siteOriginFrom(request: Request, fallbackOrigin: string): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  if (process.env.NODE_ENV !== "development" && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  return fallbackOrigin;
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
 * OAuth / email confirmation callback.
 *
 * Critical: session cookies must be written onto the *redirect response*.
 * Next.js does not reliably propagate `cookies().set(...)` onto a later
 * `NextResponse.redirect(...)`, so without this the browser lands unauthenticated.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(
    searchParams.get("next") ?? searchParams.get("redirect")
  );
  const siteOrigin = siteOriginFrom(request, origin);
  const failRedirect = NextResponse.redirect(
    `${siteOrigin}/login?error=auth`
  );

  const env = getSupabaseEnv();
  if (!env) {
    console.error(
      "[auth/callback] missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
    return failRedirect;
  }

  if (!code && !(tokenHash && type)) {
    return failRedirect;
  }

  try {
    const cookieStore = await cookies();
    // Create the success redirect first so setAll can attach Set-Cookie to it.
    const successRedirect = NextResponse.redirect(`${siteOrigin}${next}`);

    const supabase = createServerClient(env.url, env.anonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            try {
              cookieStore.set(name, value, options);
            } catch {
              // Route Handler cookie store can throw in edge cases — response
              // cookies below are what the browser actually needs.
            }
            successRedirect.cookies.set(name, value, options);
          });
        },
      },
    });

    if (code) {
      const { error } = await withDeadline(
        supabase.auth.exchangeCodeForSession(code),
        CALLBACK_TIMEOUT_MS,
        "exchangeCodeForSession"
      );
      if (error) {
        console.error("[auth/callback] exchangeCodeForSession failed:", {
          message: error.message,
          status: error.status,
          code: error.code,
        });
        return failRedirect;
      }
      return successRedirect;
    }

    if (tokenHash && type) {
      const { error } = await withDeadline(
        supabase.auth.verifyOtp({ type, token_hash: tokenHash }),
        CALLBACK_TIMEOUT_MS,
        "verifyOtp"
      );
      if (error) {
        console.error("[auth/callback] verifyOtp failed:", {
          message: error.message,
          status: error.status,
          code: error.code,
        });
        return failRedirect;
      }
      return successRedirect;
    }

    return failRedirect;
  } catch (error) {
    console.error("[auth/callback] failed:", {
      message: error instanceof Error ? error.message : String(error),
    });
    return failRedirect;
  }
}
