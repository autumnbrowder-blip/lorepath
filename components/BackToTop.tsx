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
      className={`fixed right-4 z-[9999] flex h-11 w-11 items-center justify-center rounded-sm border-2 transition-[opacity,transform,box-shadow,filter,border-color] duration-300 sm:right-6 ${
        visible
          ? "pointer-events-auto translate-y-0 opacity-100"
          : "pointer-events-none translate-y-2 opacity-0"
      } hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(201,162,74,0.75)]`}
      style={{
        bottom:
          "max(1.25rem, calc(0.75rem + env(safe-area-inset-bottom, 0px)))",
        borderColor: "rgba(179, 139, 77, 0.78)",
        backgroundImage: `
          linear-gradient(160deg, rgba(240, 215, 138, 0.14) 0%, transparent 42%),
          linear-gradient(155deg, #1f513d 0%, #184033 38%, #123229 72%, #0c241c 100%)
        `,
        boxShadow: `
          0 10px 26px rgba(4, 12, 8, 0.5),
          0 0 18px rgba(166, 124, 45, 0.2),
          inset 0 1px 0 rgba(255, 230, 150, 0.22),
          inset 0 -2px 5px rgba(0, 0, 0, 0.4)
        `,
      }}
    >
      {/* Ornamental up-arrow: gold tip + shaft + soft base flourish */}
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        aria-hidden="true"
        className="relative"
        style={{
          filter:
            "drop-shadow(0 0 4px rgba(201, 162, 74, 0.45)) drop-shadow(0 1px 0 rgba(40, 28, 6, 0.55))",
        }}
      >
        <path
          d="M12 5.2 L6.4 11.2"
          stroke="#e2c06a"
          strokeWidth="1.85"
          strokeLinecap="round"
        />
        <path
          d="M12 5.2 L17.6 11.2"
          stroke="#f0d78a"
          strokeWidth="1.85"
          strokeLinecap="round"
        />
        <path
          d="M12 6.1 V17.4"
          stroke="#e8c96e"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
        <path
          d="M8.2 18.2 H15.8"
          stroke="#c9a266"
          strokeWidth="1.55"
          strokeLinecap="round"
          opacity="0.9"
        />
        <path
          d="M9.6 19.55 H14.4"
          stroke="#a67c2d"
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity="0.75"
        />
      </svg>
    </button>,
    document.body,
  );
}
