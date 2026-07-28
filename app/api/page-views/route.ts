import { sessionUserIsAdmin } from "@/lib/admin";
import { recordPageView } from "@/lib/page-views";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Fire-and-forget visit ping.
 * Always returns 204 so tracking never surfaces as a client error.
 * Admins (ADMIN_EMAILS / profiles.is_admin) are not recorded.
 */
export async function POST(request: Request) {
  try {
    // Same gate as /admin access — skip staff so they do not inflate totals.
    try {
      if (await sessionUserIsAdmin()) {
        return new NextResponse(null, { status: 204 });
      }
    } catch (error) {
      console.error("[api/page-views] admin check failed:", error);
      // Fall through and record — do not break tracking for everyone.
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
