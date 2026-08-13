import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

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
  // Never run session refresh logic on the OAuth/email callback — that route
  // owns cookie writes for the new session.
  if (request.nextUrl.pathname.startsWith("/auth/callback")) {
    return NextResponse.next({ request });
  }

  if (!isSupabaseConfigured()) {
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

  const { pathname } = request.nextUrl;

  const isProtected = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  );
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route));

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
    return redirectPreservingCookies(url, supabaseResponse);
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
