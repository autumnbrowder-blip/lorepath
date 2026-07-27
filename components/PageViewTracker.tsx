"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Lightweight client ping on each App Router navigation.
 * Failures are swallowed so tracking never blocks the UI.
 */
export function PageViewTracker() {
  const pathname = usePathname();
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || pathname === lastSent.current) return;
    lastSent.current = pathname;

    const payload = JSON.stringify({ path: pathname });
    try {
      if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon("/api/page-views", blob);
        return;
      }
    } catch {
      // fall through to fetch
    }

    void fetch("/api/page-views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => undefined);
  }, [pathname]);

  return null;
}
