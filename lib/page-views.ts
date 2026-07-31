import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  createClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_PATH = 500;

/** Hostnames that may contribute to production pageview totals. */
const PRODUCTION_HOSTS = new Set(["lorepath.net", "www.lorepath.net"]);

/**
 * User-facing App Router paths we intentionally count.
 * Everything else (admin, APIs, assets, previews, unknown) is ignored.
 */
const COUNTABLE_PATH_PATTERNS: readonly RegExp[] = [
  /^\/$/,
  /^\/browse\/?$/,
  /^\/books\/[^/]+\/?$/,
  /^\/authors\/[^/]+\/?$/,
  /^\/login\/?$/,
  /^\/register\/?$/,
  /^\/forgot-password\/?$/,
  /^\/reset-password\/?$/,
  /^\/faq\/?$/,
  /^\/profile\/?$/,
  /^\/preferences\/?$/,
  /^\/settings\/?$/,
  /^\/rated\/?$/,
  /^\/paid\/?$/,
  /^\/stats\/?$/,
];

const BLOCKED_PATH_PREFIXES = [
  "/_next",
  "/api/",
  "/admin",
  "/favicon",
  "/images/",
  "/fonts/",
  "/robots.txt",
  "/sitemap",
  "/manifest",
  "/sw.js",
  "/theme-preview",
] as const;

/** Obvious crawlers / automated clients — case-insensitive substring match. */
const BOT_UA_PATTERN =
  /bot|crawler|spider|crawling|slurp|bingpreview|facebookexternalhit|embedly|quora link preview|whatsapp|telegram|discordbot|preview|headless|phantomjs|selenium|puppeteer|playwright|curl\/|wget\/|python-requests|go-http-client|libwww|scrapy|httpclient|java\/|okhttp/i;

export type PageViewTopPath = {
  path: string;
  /** Row count for this path (pageviews, not unique sessions). */
  pageviews: number;
};

export type PageViewStats = {
  totalPageviews: number;
  pageviewsToday: number;
  topPaths: PageViewTopPath[];
};

function emptyStats(): PageViewStats {
  return { totalPageviews: 0, pageviewsToday: 0, topPaths: [] };
}

function hasBlockedPrefix(path: string): boolean {
  return BLOCKED_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(prefix)
  );
}

function looksLikeStaticAsset(path: string): boolean {
  // e.g. /foo.png, /bar.woff2 — real app routes do not use file extensions.
  return /\.[a-z0-9]{1,8}$/i.test(path);
}

function isCountableUserPath(path: string): boolean {
  return COUNTABLE_PATH_PATTERNS.some((re) => re.test(path));
}

/**
 * Normalize a browser pathname into a safe stored path, or null if it
 * should not be recorded.
 */
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

  // Collapse duplicate slashes; trim trailing slash except for root.
  path = path.replace(/\/{2,}/g, "/");
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  path = path.slice(0, MAX_PATH);

  if (path.length < 1 || !path.startsWith("/")) return null;
  if (hasBlockedPrefix(path) || looksLikeStaticAsset(path)) return null;
  if (!isCountableUserPath(path)) return null;

  return path;
}

/** True when User-Agent looks like a bot or non-browser client. */
export function isBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua || !ua.trim()) return true;
  return BOT_UA_PATTERN.test(ua);
}

/**
 * True when the request Host is a production LorePath host.
 * Preview / localhost traffic shares Supabase in many setups — skip it.
 */
export function isProductionPageViewHost(
  hostHeader: string | null | undefined
): boolean {
  if (!hostHeader) return false;
  const host = hostHeader.split(":")[0]?.trim().toLowerCase() ?? "";
  if (!host) return false;
  if (PRODUCTION_HOSTS.has(host)) return true;
  // Explicit non-production patterns (even if somehow misconfigured).
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "[::1]" ||
    host.endsWith(".localhost") ||
    host.endsWith(".netlify.app") ||
    host.endsWith(".vercel.app")
  ) {
    return false;
  }
  return false;
}

/**
 * Server-side gate for recording. Soft callers should still soft-fail.
 * Does not check admin session — route handler does that separately.
 */
export function shouldRecordIncomingPageView(request: Request): boolean {
  if (process.env.NODE_ENV === "development") return false;

  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!isProductionPageViewHost(host)) return false;

  const ua = request.headers.get("user-agent");
  if (isBotUserAgent(ua)) return false;

  return true;
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
 * Callers should skip admins / bots / non-prod before invoking this.
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
 * Counts are pageviews (one row per accepted ping), not unique sessions.
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
            // RPC still returns column name `visits`; treat as pageview count.
            pageviews: Number(row.visits) || 0,
          }))
          .filter((row) => row.path)
      : [];

    if (topResult.error) {
      console.error("[page_views] top paths failed:", topResult.error.message);
    }

    return {
      totalPageviews: totalResult.count ?? 0,
      pageviewsToday: todayResult.error ? 0 : (todayResult.count ?? 0),
      topPaths,
    };
  } catch (error) {
    console.error("[page_views] stats failed:", error);
    return emptyStats();
  }
}
