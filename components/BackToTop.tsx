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
      title="Back to top"
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      className={`fixed right-4 z-[9999] flex h-11 w-11 items-center justify-center overflow-hidden rounded-sm transition-[opacity,transform,filter,border-color] duration-300 sm:right-6 sm:h-12 sm:w-12 ${
        visible
          ? "pointer-events-auto translate-y-0 opacity-100"
          : "pointer-events-none translate-y-2 opacity-0"
      } hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(201,162,74,0.8)]`}
      style={{
        bottom:
          "max(1.25rem, calc(0.75rem + env(safe-area-inset-bottom, 0px)))",
        border: "1px solid rgba(179, 139, 77, 0.72)",
        backgroundImage: `
          linear-gradient(160deg, rgba(240, 215, 138, 0.16) 0%, transparent 48%),
          linear-gradient(155deg, #1f513d 0%, #184033 38%, #123229 72%, #0a1c16 100%)
        `,
        boxShadow: `
          0 0 0 1px rgba(90, 60, 18, 0.55),
          0 10px 24px rgba(4, 12, 8, 0.5),
          0 0 14px rgba(166, 124, 45, 0.18),
          inset 0 1px 0 rgba(255, 236, 180, 0.22),
          inset 0 -2px 5px rgba(0, 0, 0, 0.4)
        `,
      }}
    >
      {/* Clear gold up-arrow */}
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        aria-hidden="true"
        className="relative shrink-0 sm:h-[22px] sm:w-[22px]"
        style={{
          filter:
            "drop-shadow(0 1px 0 rgba(40, 28, 6, 0.7)) drop-shadow(0 0 4px rgba(201, 162, 74, 0.35))",
        }}
      >
        <defs>
          <linearGradient
            id="btt-arrow-gold"
            x1="12"
            y1="4"
            x2="12"
            y2="20"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#fff8e0" />
            <stop offset="45%" stopColor="#f0d78a" />
            <stop offset="100%" stopColor="#b38b4d" />
          </linearGradient>
        </defs>
        <path
          d="M12 5 L5.5 12.2 H9.2 V19 H14.8 V12.2 H18.5 Z"
          fill="url(#btt-arrow-gold)"
          stroke="#8a6424"
          strokeWidth="0.7"
          strokeLinejoin="round"
        />
      </svg>
    </button>,
    document.body,
  );
}
