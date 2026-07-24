import { getSessionUser } from "@/lib/preferences";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  createServiceRoleClient,
  getBearerToken,
} from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_MESSAGE = 2000;
const MAX_PATH = 500;
const MAX_EMAIL = 254;

type FeedbackBody = {
  page_path?: unknown;
  message?: unknown;
  email?: unknown;
};

function trimString(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function isValidOptionalEmail(email: string): boolean {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= MAX_EMAIL;
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "The archives are quiet — feedback is unavailable right now." },
      { status: 503 }
    );
  }

  // Authenticated users only — never trust user_id from the body.
  const session = await getSessionUser({
    accessToken: getBearerToken(request),
  });
  if ("error" in session) {
    return NextResponse.json(
      {
        error: "Sign in to send feedback to the keepers.",
        code: session.code ?? "unauthorized",
      },
      { status: 401 }
    );
  }

  let body: FeedbackBody;
  try {
    body = (await request.json()) as FeedbackBody;
  } catch {
    return NextResponse.json(
      { error: "Could not read your missive. Please try again." },
      { status: 400 }
    );
  }

  const message = trimString(body.message, MAX_MESSAGE);
  if (!message) {
    return NextResponse.json(
      { error: "A message is required before the raven can fly." },
      { status: 400 }
    );
  }

  let pagePath = trimString(body.page_path, MAX_PATH) || "/";
  if (!pagePath.startsWith("/")) {
    pagePath = `/${pagePath}`;
  }

  const emailRaw = trimString(body.email, MAX_EMAIL);
  if (!isValidOptionalEmail(emailRaw)) {
    return NextResponse.json(
      { error: "That email address looks incomplete." },
      { status: 400 }
    );
  }
  const email = emailRaw || null;

  const row = {
    page_path: pagePath,
    message,
    email,
    user_id: session.user.id,
  };

  const service = createServiceRoleClient();
  if ("error" in service) {
    // Fallback: insert as the authenticated user (RLS requires user_id = auth.uid()).
    const { error } = await session.supabase.from("feedback").insert(row);
    if (error) {
      return NextResponse.json(
        {
          error:
            "The raven returned empty-handed. Please try again in a moment.",
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  const { error } = await service.supabase.from("feedback").insert(row);
  if (error) {
    return NextResponse.json(
      {
        error:
          "The raven returned empty-handed. Please try again in a moment.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
