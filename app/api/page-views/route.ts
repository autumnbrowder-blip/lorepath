import { recordPageView } from "@/lib/page-views";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Fire-and-forget visit ping.
 * Always returns 204 so tracking never surfaces as a client error.
 */
export async function POST(request: Request) {
  try {
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
