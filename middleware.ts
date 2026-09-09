import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  authRoutes,
  cookieOptionsForResponse,
  loginRedirectUrl,
  protectedRoutes,
  redirectPreservingCookies,
} from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Auth callback and auth APIs write cookies themselves — do not refresh here.
  if (
    pathname.startsWith("/auth/callback") ||
    pathname.startsWith("/api/auth")
  ) {
    return NextResponse.next({ request });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        path: "/",
        sameSite: "lax",
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: {
              domain?: string;
              path?: string;
              maxAge?: number;
              expires?: Date;
              httpOnly?: boolean;
              secure?: boolean;
              sameSite?: "lax" | "strict" | "none" | boolean;
            };
          }[]
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(
              name,
              value,
              cookieOptionsForResponse(request, options)
            )
          );
        },
      },
    }
  );

  // Always call getUser() so expired access tokens refresh into Set-Cookie.
  // Do not use a browser client in middleware.
  let user = null;
  try {
    const {
      data: { user: nextUser },
    } = await supabase.auth.getUser();
    user = nextUser;
  } catch {
    // Network/timeout: keep existing cookies. Do not treat as signed out.
    return supabaseResponse;
  }

  const isProtected = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  );
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route));

  if (!user && isProtected) {
    return redirectPreservingCookies(
      loginRedirectUrl(request, pathname),
      supabaseResponse
    );
  }

  if (user && isAuthRoute) {
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

export const config = {
  matcher: [
    "/books/:path*",
    "/preferences",
    "/profile",
    "/api/books/:path*",
    "/api/preferences",
    "/login",
    "/register",
    "/forgot-password",
    "/((?!_next/static|_next/image|favicon.ico|auth/callback|api/auth|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
