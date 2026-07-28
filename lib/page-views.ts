import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  createClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_PATH = 500;

export type PageViewTopPath = {
  path: string;
  visits: number;
};

export type PageViewStats = {
  totalVisits: number;
  visitsToday: number;
  topPaths: PageViewTopPath[];
};

function emptyStats(): PageViewStats {
  return { totalVisits: 0, visitsToday: 0, topPaths: [] };
}

/** Normalize a browser pathname into a safe stored path. */
export function normalizePageViewPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let path = raw.trim().slice(0, MAX_PATH);
  if (!path) return null;
  if (!path.startsWith("/")) path = `/${path}`;
  // Drop query/hash — path only for privacy-light aggregates.
  const q = path.indexOf("?");
  if (q >= 0) path = path.slice(0, q);
  const h = path.indexOf("#");
  if (h >= 0) path = path.slice(0, h);
  path = path.slice(0, MAX_PATH);
  if (path.length < 1 || !path.startsWith("/")) return null;
  // Skip Next internals / static assets.
  if (
    path.startsWith("/_next") ||
    path.startsWith("/api/") ||
    path.startsWith("/favicon") ||
    path.startsWith("/images/")
  ) {
    return null;
  }
  return path;
}

function startOfUtcDayIso(now = new Date()): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  ).toISOString();
}

async function pageViewsClient(): Promise<SupabaseClient | null> {
  if (!isSupabaseConfigured()) return null;
  const admin = createServiceRoleClient();
  if (!("error" in admin)) return admin.supabase;
  try {
    return await createClient();
  } catch {
    return null;
  }
}

/**
 * Insert one page view. Never throws — tracking must not break the site.
 * Callers should skip admins before invoking this (see /api/page-views).
 */
export async function recordPageView(rawPath: unknown): Promise<boolean> {
  try {
    const path = normalizePageViewPath(rawPath);
    if (!path) return false;

    const supabase = await pageViewsClient();
    if (!supabase) return false;

    const { error } = await supabase.from("page_views").insert({ path });
    if (error) {
      console.error("[page_views] insert failed:", error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[page_views] record failed:", error);
    return false;
  }
}

/**
 * Admin-facing aggregates. Soft-fails to zeros if the table is missing.
 */
export async function getPageViewStats(
  supabase: SupabaseClient
): Promise<PageViewStats> {
  try {
    const since = startOfUtcDayIso();

    const [totalResult, todayResult, topResult] = await Promise.all([
      supabase.from("page_views").select("id", { count: "exact", head: true }),
      supabase
        .from("page_views")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since),
      supabase.rpc("page_view_top_paths", { limit_count: 5 }),
    ]);

    if (totalResult.error) {
      console.error("[page_views] total count failed:", totalResult.error.message);
      return emptyStats();
    }

    const topPaths: PageViewTopPath[] = Array.isArray(topResult.data)
      ? topResult.data
          .map((row: { path?: unknown; visits?: unknown }) => ({
            path: typeof row.path === "string" ? row.path : "",
            visits: Number(row.visits) || 0,
          }))
          .filter((row) => row.path)
      : [];

    if (topResult.error) {
      console.error("[page_views] top paths failed:", topResult.error.message);
    }

    return {
      totalVisits: totalResult.count ?? 0,
      visitsToday: todayResult.error ? 0 : (todayResult.count ?? 0),
      topPaths,
    };
  } catch (error) {
    console.error("[page_views] stats failed:", error);
    return emptyStats();
  }
}
