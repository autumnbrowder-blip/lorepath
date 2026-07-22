"use client";

import { ArrowUp } from "lucide-react";
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
      className={`fixed bottom-5 right-4 z-[9999] flex h-11 w-11 items-center justify-center rounded-xl border-2 border-gold-600/70 bg-[#ebe0c4] shadow-[0_8px_24px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,250,235,0.55)] transition-[opacity,transform] duration-300 sm:bottom-7 sm:right-6 ${
        visible
          ? "pointer-events-auto translate-y-0 opacity-100"
          : "pointer-events-none translate-y-2 opacity-0"
      } hover:-translate-y-0.5 hover:border-gold-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500`}
      style={{
        backgroundImage:
          "linear-gradient(160deg, #f3ead4 0%, #ebe0c4 45%, #e4d6b0 100%)",
        bottom: "max(1.25rem, calc(0.75rem + env(safe-area-inset-bottom, 0px)))",
      }}
    >
      <ArrowUp
        className="h-5 w-5 stroke-[2.5] text-[#0f1f17]"
        aria-hidden="true"
      />
    </button>,
    document.body,
  );
}
