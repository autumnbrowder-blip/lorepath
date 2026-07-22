"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const SCROLL_THRESHOLD = 300;
const SHELL_SCROLL_SELECTOR = ".fantasy-page-shell-scroll";

function getShellScrollEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>(SHELL_SCROLL_SELECTOR);
}

function currentScrollY(): number {
  const shell = getShellScrollEl();
  return Math.max(
    window.scrollY,
    document.documentElement.scrollTop,
    document.body.scrollTop,
    shell?.scrollTop ?? 0,
  );
}

function scrollToTop(): void {
  const behavior: ScrollBehavior = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches
    ? "auto"
    : "smooth";

  const shell = getShellScrollEl();
  if (shell) {
    shell.scrollTo({ top: 0, behavior });
  }
  window.scrollTo({ top: 0, behavior });
  document.documentElement.scrollTo({ top: 0, behavior });
}

/**
 * Site-wide floating control. Portaled to document.body so fixed positioning
 * is never clipped by page shells. Tracks both window scroll and
 * FantasyPageShell’s inner scroller.
 */
export function BackToTop() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let attachedShell: HTMLElement | null = null;
    let frame = 0;

    const updateVisibility = () => {
      setVisible(currentScrollY() > SCROLL_THRESHOLD);
    };

    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateVisibility);
    };

    // Start null so the first sync always attaches the shell listener.
    const syncShellListener = () => {
      const next = getShellScrollEl();
      if (next === attachedShell) return;
      attachedShell?.removeEventListener("scroll", onScroll);
      attachedShell = next;
      attachedShell?.addEventListener("scroll", onScroll, { passive: true });
      updateVisibility();
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("scroll", onScroll, { passive: true, capture: true });
    syncShellListener();
    updateVisibility();

    const observer = new MutationObserver(() => {
      syncShellListener();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("scroll", onScroll, { capture: true });
      attachedShell?.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, [pathname]);

  if (!mounted) return null;

  return createPortal(
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Back to top"
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      className={`fixed right-4 z-[9999] flex h-11 w-11 items-center justify-center overflow-hidden rounded-[3px] transition-[opacity,transform,filter] duration-300 sm:right-6 ${
        visible
          ? "pointer-events-auto translate-y-0 opacity-100"
          : "pointer-events-none translate-y-2 opacity-0"
      } hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(201,162,74,0.8)]`}
      style={{
        bottom:
          "max(1.25rem, calc(0.75rem + env(safe-area-inset-bottom, 0px)))",
        border: "1px solid rgba(90, 60, 18, 0.95)",
        backgroundImage: `
          radial-gradient(ellipse at 50% 28%, rgba(240, 215, 138, 0.22) 0%, transparent 55%),
          linear-gradient(160deg, rgba(232, 208, 120, 0.1) 0%, transparent 45%),
          linear-gradient(155deg, #1f513d 0%, #184033 36%, #123229 70%, #0a1c16 100%)
        `,
        boxShadow: `
          0 0 0 1px rgba(201, 162, 74, 0.55),
          0 0 0 2px rgba(90, 60, 18, 0.85),
          0 10px 24px rgba(4, 12, 8, 0.55),
          0 0 16px rgba(166, 124, 45, 0.22),
          inset 0 1px 0 rgba(255, 236, 180, 0.28),
          inset 0 -3px 6px rgba(0, 0, 0, 0.45),
          inset 0 0 10px rgba(8, 24, 16, 0.35)
        `,
      }}
    >
      {/* Engraved inner plate */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-[3px] rounded-[2px]"
        style={{
          border: "1px solid rgba(179, 139, 77, 0.35)",
          boxShadow:
            "inset 0 0 0 1px rgba(40, 28, 6, 0.35), inset 0 1px 0 rgba(255, 230, 150, 0.12)",
          background:
            "linear-gradient(180deg, rgba(240, 215, 138, 0.08) 0%, transparent 40%, rgba(0, 0, 0, 0.18) 100%)",
        }}
      />

      {/* Shield-framed ornate up-arrow */}
      <svg
        viewBox="0 0 24 24"
        width="21"
        height="21"
        fill="none"
        aria-hidden="true"
        className="relative"
        style={{
          filter:
            "drop-shadow(0 1px 0 rgba(40, 28, 6, 0.75)) drop-shadow(0 0 5px rgba(201, 162, 74, 0.4))",
        }}
      >
        <defs>
          <linearGradient id="btt-gold" x1="12" y1="2" x2="12" y2="22" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#fff1c9" />
            <stop offset="35%" stopColor="#f0d78a" />
            <stop offset="70%" stopColor="#c9a24a" />
            <stop offset="100%" stopColor="#8a6424" />
          </linearGradient>
          <linearGradient id="btt-gold-bright" x1="12" y1="3" x2="12" y2="14" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#fff8e0" />
            <stop offset="55%" stopColor="#e2c06a" />
            <stop offset="100%" stopColor="#a67c2d" />
          </linearGradient>
        </defs>

        {/* Soft shield frame */}
        <path
          d="M12 2.6 C12 2.6 18.2 4.2 18.2 4.2 C18.2 10.8 15.8 15.6 12 21 C8.2 15.6 5.8 10.8 5.8 4.2 C5.8 4.2 12 2.6 12 2.6 Z"
          stroke="url(#btt-gold)"
          strokeWidth="1.15"
          strokeLinejoin="round"
          opacity="0.72"
        />

        {/* Ornate arrow head */}
        <path
          d="M12 5.4 L7.1 11.1 L9.35 11.1 L9.35 12.35 L14.65 12.35 L14.65 11.1 L16.9 11.1 Z"
          fill="url(#btt-gold-bright)"
          stroke="url(#btt-gold)"
          strokeWidth="0.55"
          strokeLinejoin="round"
        />

        {/* Shaft */}
        <path
          d="M11.05 12.2 H12.95 V17.15 H11.05 Z"
          fill="url(#btt-gold-bright)"
          stroke="url(#btt-gold)"
          strokeWidth="0.45"
        />

        {/* Engraved base flourish */}
        <path
          d="M8.1 18.15 H15.9"
          stroke="url(#btt-gold)"
          strokeWidth="1.35"
          strokeLinecap="round"
        />
        <path
          d="M9.4 19.45 H14.6"
          stroke="#a67c2d"
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.85"
        />
      </svg>
    </button>,
    document.body,
  );
}
