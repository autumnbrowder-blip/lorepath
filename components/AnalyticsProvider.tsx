"use client";

import { initAnalytics } from "@/lib/analytics";
import { useEffect, type ReactNode } from "react";

/**
 * Optional PostHog bootstrap. No-ops when NEXT_PUBLIC_POSTHOG_KEY is unset.
 */
export function AnalyticsProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    try {
      initAnalytics();
    } catch {
      // soft-fail — never block the tree
    }
  }, []);

  return <>{children}</>;
}
