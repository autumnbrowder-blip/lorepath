/**
 * Lightweight client analytics wrapper.
 * Optionally forwards to PostHog when NEXT_PUBLIC_POSTHOG_KEY is set.
 * Soft-fails everywhere — never blocks UI.
 *
 * Import only from Client Components (uses posthog-js / window).
 */

import posthog from "posthog-js";

export type AnalyticsEvent =
  | "view_home"
  | "view_browse"
  | "search_performed"
  | "open_book"
  | "view_login"
  | "view_register"
  | "signup_submitted"
  | "signup_completed";

/** Minimal, privacy-light property bag — no email, IP, or full free-text PII. */
export type AnalyticsProps = Record<
  string,
  string | number | boolean | null | undefined
>;

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

let initialized = false;

function sanitizeProps(
  props?: AnalyticsProps
): Record<string, string | number | boolean> {
  if (!props) return {};
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined) continue;
    // Strip accidental PII-ish keys if ever passed.
    if (/email|password|ip|token|phone/i.test(key)) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Truncated query hint for search analytics (length + short prefix only).
 */
export function queryHint(query: string): {
  query_len: number;
  query_prefix: string;
} {
  const trimmed = query.trim();
  return {
    query_len: trimmed.length,
    query_prefix: trimmed.slice(0, 3).toLowerCase(),
  };
}

/** Init PostHog once on the client. Safe to call repeatedly. */
export function initAnalytics(): void {
  if (typeof window === "undefined" || initialized || !POSTHOG_KEY) return;

  try {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      capture_pageview: false,
      capture_pageleave: false,
      persistence: "localStorage+cookie",
      autocapture: false,
      disable_session_recording: true,
      loaded: (ph) => {
        if (process.env.NODE_ENV === "development") {
          ph.debug();
        }
      },
    });
    initialized = true;
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.debug("[analytics] PostHog init failed", err);
    }
  }
}

/** Fire-and-forget event capture. Never throws. */
export function track(event: AnalyticsEvent, props?: AnalyticsProps): void {
  try {
    const safe = sanitizeProps(props);
    if (typeof window !== "undefined") {
      safe.path = window.location.pathname;
    }

    if (POSTHOG_KEY && typeof window !== "undefined") {
      try {
        if (!initialized) initAnalytics();
        posthog.capture(event, safe);
        return;
      } catch {
        // fall through to debug
      }
    }

    if (process.env.NODE_ENV === "development") {
      console.debug("[analytics]", event, safe);
    }
  } catch {
    // soft-fail
  }
}
