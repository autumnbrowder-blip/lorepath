import { emailFromAuthCookies } from "@/lib/supabase/auth-cookies";
import {
  recordPageView,
  shouldRecordIncomingPageView,
} from "@/lib/page-views";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Fire-and-forget pageview ping.
 * Always returns 204 so tracking never surfaces as a client error.
 *
 * Skips: admins (ADMIN_EMAILS), bots, non-production hosts, development, blocked paths.
 */
export async function POST(request: Request) {
  try {
    if (!shouldRecordIncomingPageView(request)) {
      return new NextResponse(null, { status: 204 });
    }

    // Skip staff listed in ADMIN_EMAILS without a GoTrue/DB round-trip.
    const adminEmails = process.env.ADMIN_EMAILS?.trim() ?? "";
    if (adminEmails) {
      const cookieEmail = emailFromAuthCookies(cookiesFromHeader(request));
      if (cookieEmail && emailIsPageViewAdmin(cookieEmail, adminEmails)) {
        return new NextResponse(null, { status: 204 });
      }
    }

    let body: { path?: unknown } = {};
    try {
      body = (await request.json()) as { path?: unknown };
    } catch {
      body = {};
    }
    await recordPageView(body.path);
  } catch (error) {
    console.error("[api/page-views] unexpected:", error);
  }

  return new NextResponse(null, { status: 204 });
}

function cookiesFromHeader(
  request: Request
): { name: string; value: string }[] {
  const header = request.headers.get("cookie");
  if (!header) return [];

  return header.split(";").map((part) => {
    const trimmed = part.trim();
    const idx = trimmed.indexOf("=");
    if (idx < 0) return { name: trimmed, value: "" };
    let value = trimmed.slice(idx + 1);
    try {
      value = decodeURIComponent(value);
    } catch {
      // keep raw value
    }
    return { name: trimmed.slice(0, idx), value };
  });
}

function emailIsPageViewAdmin(email: string, adminEmails: string): boolean {
  const needle = email.trim().toLowerCase();
  return adminEmails
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .includes(needle);
}
