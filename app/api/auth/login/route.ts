import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

const LOGIN_TIMEOUT_MS = 8000;

type CookieToSet = { name: string; value: string; options?: object };

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
 * Email/password sign-in that sets session cookies on the HTTP response.
 *
 * Uses a cookie-less supabase-js client for the password grant so a stale /
 * corrupt browser session cannot deadlock GoTrue initialize/refresh. Cookies
 * are written only onto the JSON response after a successful grant.
 */
export async function POST(request: Request) {
  const env = getSupabaseEnv();
  if (!env) {
    return NextResponse.json(
      {
        error:
          "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      },
      { status: 503 }
    );
  }

  let email = "";
  let password = "";
  try {
    const body = (await request.json()) as {
      email?: unknown;
      password?: unknown;
    };
    email = typeof body.email === "string" ? body.email.trim() : "";
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 }
    );
  }

  try {
    // Stateless client — no cookies, no refresh of whatever the browser sent.
    const authClient = createSupabaseClient(env.url, env.anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { data, error } = await withDeadline(
      authClient.auth.signInWithPassword({ email, password }),
      LOGIN_TIMEOUT_MS,
      "signInWithPassword"
    );

    if (error) {
      return NextResponse.json(
        { error: error.message || "Invalid login credentials" },
        { status: 401 }
      );
    }

    if (!data.session?.access_token || !data.session.refresh_token) {
      return NextResponse.json(
        {
          error:
            "Signed in but no session was returned. Confirm your email, then try again.",
        },
        { status: 401 }
      );
    }

    const pendingCookies: CookieToSet[] = [];
    const response = NextResponse.json({ ok: true });

    const cookieClient = createServerClient(env.url, env.anonKey, {
      cookies: {
        getAll() {
          return [];
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach((cookie) => {
            pendingCookies.push(cookie);
            response.cookies.set(cookie.name, cookie.value, cookie.options);
          });
        },
      },
    });

    const { error: sessionError } = await withDeadline(
      cookieClient.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      }),
      LOGIN_TIMEOUT_MS,
      "setSession"
    );

    if (sessionError) {
      console.error("[api/auth/login] setSession failed:", sessionError);
      return NextResponse.json(
        { error: sessionError.message || "Could not establish session cookies." },
        { status: 500 }
      );
    }

    if (pendingCookies.length === 0) {
      console.error("[api/auth/login] setSession returned no cookies");
      return NextResponse.json(
        { error: "Session created but cookies were not set." },
        { status: 500 }
      );
    }

    return response;
  } catch (error) {
    console.error("[api/auth/login] failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Sign in failed. Please try again.",
      },
      { status: 500 }
    );
  }
}
