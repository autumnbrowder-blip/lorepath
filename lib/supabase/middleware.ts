import { NextResponse, type NextRequest } from "next/server";

export const protectedRoutes: string[] = [
  "/profile",
  "/stats",
  "/preferences",
  "/settings",
  "/import",
];

// Public auth screens. Do not include /reset-password — recovery links
// establish a session and the user must stay on that page to set a password.
// Do not include /auth/callback — that route sets the session cookies.
export const authRoutes = ["/login", "/register", "/forgot-password"];

const protectedRouteMessages: Record<string, string> = {
  "/preferences": "preferences",
};

type IncomingCookieOptions = {
  domain?: string;
  path?: string;
  maxAge?: number;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "lax" | "strict" | "none" | boolean;
};

type ResponseCookieOptions = {
  path: string;
  maxAge?: number;
  expires?: Date;
  httpOnly?: boolean;
  secure: boolean;
  sameSite: "lax" | "strict" | "none";
  domain?: string;
};

/**
 * @supabase/ssr cookie defaults: path `/`, SameSite=Lax. Never set
 * Domain=.localhost (breaks lorepath.net). Secure is set on HTTPS so
 * production cookies stick; HTTP localhost stays non-Secure.
 */
export function cookieOptionsForResponse(
  request: NextRequest,
  options?: IncomingCookieOptions
): ResponseCookieOptions {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const https =
    request.nextUrl.protocol === "https:" || forwardedProto === "https";

  const domainRaw = typeof options?.domain === "string" ? options.domain : "";
  const domain =
    !domainRaw ||
    domainRaw === "localhost" ||
    domainRaw === ".localhost" ||
    domainRaw.endsWith(".localhost")
      ? undefined
      : domainRaw;

  let sameSite: "lax" | "strict" | "none" = "lax";
  if (options?.sameSite === "strict" || options?.sameSite === true) {
    sameSite = "strict";
  } else if (options?.sameSite === "none") {
    sameSite = "none";
  }

  return {
    path:
      typeof options?.path === "string" && options.path ? options.path : "/",
    maxAge: options?.maxAge,
    expires: options?.expires,
    httpOnly: options?.httpOnly,
    secure: https,
    sameSite,
    ...(domain ? { domain } : {}),
  };
}

/** Copy refreshed auth cookies onto a redirect so middleware never drops the session. */
export function redirectPreservingCookies(
  url: URL,
  supabaseResponse: NextResponse
): NextResponse {
  const redirectResponse = NextResponse.redirect(url);
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie.name, cookie.value);
  });
  return redirectResponse;
}

export function loginRedirectUrl(request: NextRequest, pathname: string): URL {
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
