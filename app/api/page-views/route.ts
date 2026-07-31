import { sessionUserIsAdmin } from "@/lib/admin";
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
 * Skips: admins, bots, non-production hosts, development, blocked paths.
 */
export async function POST(request: Request) {
  try {
    if (!shouldRecordIncomingPageView(request)) {
      return new NextResponse(null, { status: 204 });
    }

    // Same gate as /admin access — skip staff so they do not inflate totals.
    try {
      if (await sessionUserIsAdmin()) {
        return new NextResponse(null, { status: 204 });
      }
    } catch (error) {
      console.error("[api/page-views] admin check failed:", error);
      // Fall through and record — do not break tracking for everyone.
      // Path allowlist still rejects /admin even if this check fails.
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
