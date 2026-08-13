import { createServerClient } from "@supabase/ssr";
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

async function passwordGrant(
  env: { url: string; anonKey: string },
  email: string,
  password: string
): Promise<
  | { session: { access_token: string; refresh_token: string }; error?: undefined }
  | { session?: undefined; error: string; status: number }
> {
  const res = await fetch(`${env.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: env.anonKey,
      Authorization: `Bearer ${env.anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });

  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return {
      error: text.slice(0, 200) || `Auth error (${res.status})`,
      status: res.status || 500,
    };
  }

  if (!res.ok) {
    const message =
      (typeof json.error_description === "string" && json.error_description) ||
      (typeof json.msg === "string" && json.msg) ||
      (typeof json.message === "string" && json.message) ||
      (typeof json.error === "string" && json.error) ||
      `Invalid login credentials (${res.status})`;
    return { error: message, status: res.status };
  }

  const access =
    typeof json.access_token === "string" ? json.access_token : null;
  const refresh =
    typeof json.refresh_token === "string" ? json.refresh_token : null;
  if (!access || !refresh) {
    return {
      error:
        "Signed in but no session was returned. Confirm your email, then try again.",
      status: 401,
    };
  }

  return { session: { access_token: access, refresh_token: refresh } };
}

/**
 * Email/password sign-in via direct Auth HTTP grant (bypasses supabase-js
 * client hangs on Netlify), then writes SSR session cookies onto the response.
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
    const grant = await withDeadline(
      passwordGrant(env, email, password),
      LOGIN_TIMEOUT_MS,
      "passwordGrant"
    );

    if (grant.error || !grant.session) {
      return NextResponse.json(
        { error: grant.error || "Invalid login credentials" },
        { status: grant.status || 401 }
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
        access_token: grant.session.access_token,
        refresh_token: grant.session.refresh_token,
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
