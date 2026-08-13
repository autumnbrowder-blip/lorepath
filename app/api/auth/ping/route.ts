import { NextResponse } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

/** Temporary connectivity probe — remove once auth is stable. */
export async function GET() {
  const env = getSupabaseEnv();
  if (!env) {
    return NextResponse.json({ ok: false, error: "missing env" }, { status: 503 });
  }

  const results: Record<string, unknown> = {
    urlHost: (() => {
      try {
        return new URL(env.url).host;
      } catch {
        return "invalid";
      }
    })(),
  };

  // 1) Auth health (no key required message is still a useful RTT)
  {
    const t0 = Date.now();
    try {
      const res = await fetch(`${env.url}/auth/v1/health`, {
        headers: { apikey: env.anonKey, Authorization: `Bearer ${env.anonKey}` },
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      results.health = {
        status: res.status,
        ms: Date.now() - t0,
        body: (await res.text()).slice(0, 120),
      };
    } catch (error) {
      results.health = {
        ms: Date.now() - t0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // 2) Password grant with nonsense credentials (should be ~401 fast)
  {
    const t0 = Date.now();
    try {
      const res = await fetch(`${env.url}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: {
          apikey: env.anonKey,
          Authorization: `Bearer ${env.anonKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "ping-probe@example.com",
          password: "wrong",
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      results.passwordGrant = {
        status: res.status,
        ms: Date.now() - t0,
        body: (await res.text()).slice(0, 200),
      };
    } catch (error) {
      results.passwordGrant = {
        ms: Date.now() - t0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return NextResponse.json(results);
}
