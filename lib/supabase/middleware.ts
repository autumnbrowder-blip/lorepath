import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  accessTokenSecondsRemaining,
  requestHasSupabaseAuthCookie,
} from "@/lib/supabase/auth-cookies";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/** Refresh via getUser when the access token is this close to expiry. */
const JWT_REFRESH_MARGIN_SEC = 120;

const protectedRoutes: string[] = [
  "/profile",
  "/stats",
  "/preferences",
  "/settings",
  "/import",
];
// Public auth screens. Do not include /reset-password — recovery links
// establish a session and the user must stay on that page to set a password.
// Do not include /auth/callback — that route sets the session cookies.
const authRoutes = ["/login", "/register", "/forgot-password"];

const protectedRouteMessages: Record<string, string> = {
  "/preferences": "preferences",
};

/** Copy refreshed auth cookies onto a redirect so middleware never drops the session. */
function redirectPreservingCookies(
  url: URL,
  supabaseResponse: NextResponse
): NextResponse {
  const redirectResponse = NextResponse.redirect(url);
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie.name, cookie.value);
  });
  return redirectResponse;
}

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Never run session refresh on auth routes that set cookies themselves,
  // or on APIs that verify JWTs in the handler (avoids a getUser per ping).
  if (
    pathname.startsWith("/auth/callback") ||
    pathname.startsWith("/api/")
  ) {
    return NextResponse.next({ request });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.next({ request });
  }

  const isProtected = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  );
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route));
  const cookieList = request.cookies.getAll();
  const hasAuthCookie = requestHasSupabaseAuthCookie(cookieList);

  // Anonymous traffic: no Auth API call. Protected routes still bounce to login.
  if (!hasAuthCookie) {
    if (isProtected) {
      return redirectLoggedOut(request, pathname);
    }
    return NextResponse.next({ request });
  }

  // Logged-in public pages with a still-fresh access token: skip getUser.
  // Middleware only needs GoTrue when the JWT is near expiry (refresh) or
  // when we must know the user for a redirect.
  const secondsLeft = accessTokenSecondsRemaining(cookieList);
  const tokenIsFresh =
    secondsLeft !== null && secondsLeft > JWT_REFRESH_MARGIN_SEC;
  if (tokenIsFresh && !isProtected && !isAuthRoute) {
    return NextResponse.next({ request });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
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

  // getUser() refreshes the session when needed. Always return supabaseResponse
  // (or a redirect that copies its cookies) so refreshed tokens are not dropped.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && isProtected) {
    return redirectPreservingCookies(
      loginRedirectUrl(request, pathname),
      supabaseResponse
    );
  }

  if (user && isAuthRoute) {
    // Prefer an explicit redirect param; otherwise send them home — do not
    // bounce through a protected route that could race before cookies settle.
    const redirectParam = request.nextUrl.searchParams.get("redirect");
    const destination =
      redirectParam &&
      redirectParam.startsWith("/") &&
      !redirectParam.startsWith("//")
        ? redirectParam
        : "/";
    return redirectPreservingCookies(
      new URL(destination, request.url),
      supabaseResponse
    );
  }

  return supabaseResponse;
}

function loginRedirectUrl(request: NextRequest, pathname: string): URL {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("redirect", pathname);
  const messageKey = protectedRoutes.find((route) =>
    pathname.startsWith(route)
  );
  const message = messageKey ? protectedRouteMessages[messageKey] : undefined;
  if (message) {
    url.searchParams.set("message", message);
  }
  return url;
}

function redirectLoggedOut(request: NextRequest, pathname: string): NextResponse {
  return NextResponse.redirect(loginRedirectUrl(request, pathname));
}
