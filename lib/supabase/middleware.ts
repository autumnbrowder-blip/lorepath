import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const protectedRoutes: string[] = [
  "/profile",
  "/stats",
  "/preferences",
  "/settings",
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // /admin stays unadvertised: everyone who isn't an admin goes home (not /login).
  if (pathname.startsWith("/admin")) {
    const home = new URL("/", request.url);

    if (!user) {
      return NextResponse.redirect(home);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();

    const flagAdmin =
      profile?.is_admin === true ||
      // PostgREST / drivers occasionally surface booleans as strings
      String(profile?.is_admin).toLowerCase() === "true";

    const adminEmails = (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean);
    const bootstrapAdmin =
      Boolean(user.email) &&
      adminEmails.includes(String(user.email).trim().toLowerCase());

    if (!flagAdmin && !bootstrapAdmin) {
      return NextResponse.redirect(home);
    }
  }

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
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const redirectTo = request.nextUrl.searchParams.get("redirect") ?? "/profile";
    return NextResponse.redirect(new URL(redirectTo, request.url));
  }

  return supabaseResponse;
}
