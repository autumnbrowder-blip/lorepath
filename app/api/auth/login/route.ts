import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

const LOGIN_TIMEOUT_MS = 8000;

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
 * Avoids the browser Supabase client (which can hang before any network call).
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
    const cookieStore = await cookies();
    const response = NextResponse.json({ ok: true });

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
              // Response cookies below are authoritative for the browser.
            }
            response.cookies.set(name, value, options);
          });
        },
      },
    });

    const { data, error } = await withDeadline(
      supabase.auth.signInWithPassword({ email, password }),
      LOGIN_TIMEOUT_MS,
      "signInWithPassword"
    );

    if (error) {
      return NextResponse.json(
        { error: error.message || "Invalid login credentials" },
        { status: 401 }
      );
    }

    if (!data.session) {
      return NextResponse.json(
        {
          error:
            "Signed in but no session was returned. Confirm your email, then try again.",
        },
        { status: 401 }
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
