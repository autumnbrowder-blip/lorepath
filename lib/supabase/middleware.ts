import { createServerClient } from "@supabase/ssr";
import { type User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  SUPABASE_AUTH_TIMEOUT_MS,
  isAuthServiceUnavailable,
  timedFetch,
} from "@/lib/supabase/fetch";

const protectedRoutes: string[] = [
  "/profile",
  "/stats",
  "/preferences",
  "/settings",
  "/import",
];
// Public auth screens. Do not include /reset-password — recovery links
// establish a session and the user must stay on that page to set a password.
const authRoutes = ["/login", "/register", "/forgot-password"];

const protectedRouteMessages: Record<string, string> = {
  "/preferences": "preferences",
};

export async function updateSession(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.next({ request });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    global: {
      // Middleware runs on nearly every route, so an unbounded auth call here
      // stalls the entire site when Supabase Auth stops responding.
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        timedFetch(input, { ...init }, SUPABASE_AUTH_TIMEOUT_MS),
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Distinguish "signed out" from "auth service did not answer". A transport
  // failure must not be treated as a definitive answer about who the visitor is,
  // and must never take down pages that do not need auth at all.
  let user: User | null = null;
  let authUnavailable = false;

  try {
    const { data, error } = await supabase.auth.getUser();
    user = data?.user ?? null;
    if (error && isAuthServiceUnavailable(error)) {
      authUnavailable = true;
    }
  } catch {
    authUnavailable = true;
  }

  if (authUnavailable) {
    console.error(
      "[middleware] Supabase Auth unreachable; serving public routes signed out."
    );
  }

  const { pathname } = request.nextUrl;

  const isProtected = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  );
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route));

  // Auth is unreachable: fail closed on protected routes (never expose private
  // pages on an unverified session) but keep public pages serving normally.
  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    const messageKey = protectedRoutes.find((route) =>
      pathname.startsWith(route)
    );
    const message = messageKey
      ? protectedRouteMessages[messageKey]
      : undefined;
    if (message) {
      url.searchParams.set("message", message);
    }
    const redirectResponse = NextResponse.redirect(url);
    if (authUnavailable) {
      redirectResponse.headers.set("x-auth-degraded", "1");
    }
    return redirectResponse;
  }

  if (user && isAuthRoute) {
    const redirectTo = request.nextUrl.searchParams.get("redirect") ?? "/profile";
    return NextResponse.redirect(new URL(redirectTo, request.url));
  }

  if (authUnavailable) {
    supabaseResponse.headers.set("x-auth-degraded", "1");
  }

  return supabaseResponse;
}
