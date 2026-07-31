"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const DEDUPE_STORAGE_KEY = "lp_pv_last";
/** Ignore identical path pings within this window (Strict Mode / remounts). */
const DEDUPE_MS = 2500;

type LastPing = { path: string; at: number };

function readLastPing(): LastPing | null {
  try {
    const raw = sessionStorage.getItem(DEDUPE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastPing;
    if (
      typeof parsed?.path === "string" &&
      typeof parsed?.at === "number"
    ) {
      return parsed;
    }
  } catch {
    // sessionStorage unavailable or corrupt — fall back to in-memory only.
  }
  return null;
}

function writeLastPing(path: string, at: number): void {
  try {
    sessionStorage.setItem(
      DEDUPE_STORAGE_KEY,
      JSON.stringify({ path, at } satisfies LastPing)
    );
  } catch {
    // ignore
  }
}

function shouldSkipClientPath(pathname: string): boolean {
  if (!pathname) return true;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return true;
  if (pathname.startsWith("/_next") || pathname.startsWith("/api/")) return true;
  if (process.env.NODE_ENV === "development") return true;
  return false;
}

/**
 * Lightweight client ping on each App Router navigation.
 * Dedupes Strict Mode double-mounts and rapid remounts via ref + sessionStorage.
 * Failures are swallowed so tracking never blocks the UI.
 */
export function PageViewTracker() {
  const pathname = usePathname();
  const lastSent = useRef<string | null>(null);
  const lastSentAt = useRef(0);

  useEffect(() => {
    if (!pathname || shouldSkipClientPath(pathname)) return;

    const now = Date.now();
    if (
      lastSent.current === pathname &&
      now - lastSentAt.current < DEDUPE_MS
    ) {
      return;
    }

    const stored = readLastPing();
    if (
      stored &&
      stored.path === pathname &&
      now - stored.at < DEDUPE_MS
    ) {
      lastSent.current = pathname;
      lastSentAt.current = stored.at;
      return;
    }

    lastSent.current = pathname;
    lastSentAt.current = now;
    writeLastPing(pathname, now);

    const payload = JSON.stringify({ path: pathname });
    try {
      if (
        typeof navigator !== "undefined" &&
        typeof navigator.sendBeacon === "function"
      ) {
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
