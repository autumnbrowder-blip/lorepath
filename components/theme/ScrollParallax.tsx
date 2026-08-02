"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const SHELL_SCROLL_SELECTOR = ".fantasy-page-shell-scroll";
const LAYER_SELECTOR = "[data-scroll-parallax]";

/** Soft storybook drift — keep well under typical viewport height. */
const MAX_SHIFT_PX = 48;
const SCROLL_FACTOR = 0.09;
const SWAY_AMPLITUDE = 5;
const SWAY_PERIOD = 900;

function getShellScrollEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>(SHELL_SCROLL_SELECTOR);
}

function currentScrollY(): number {
  const shell = getShellScrollEl();
  return Math.max(
    window.scrollY,
    document.documentElement.scrollTop,
    document.body.scrollTop,
    shell?.scrollTop ?? 0
  );
}

/**
 * Subtle transform-based background drift on scroll.
 * Tracks both window scroll (Home/FAQ/Preferences) and FantasyPageShell’s
 * inner scroller. Disabled when prefers-reduced-motion is set.
 */
export function ScrollParallax() {
  const pathname = usePathname();

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let attachedShell: HTMLElement | null = null;
    let frame = 0;

    const clearLayers = () => {
      document.querySelectorAll<HTMLElement>(LAYER_SELECTOR).forEach((el) => {
        el.style.transform = "";
      });
    };

    const apply = () => {
      if (reduceMotion.matches) {
        clearLayers();
        return;
      }

      const y = currentScrollY();
      const shift = Math.min(MAX_SHIFT_PX, y * SCROLL_FACTOR);
      const sway = Math.sin(y / SWAY_PERIOD) * SWAY_AMPLITUDE;

      document.querySelectorAll<HTMLElement>(LAYER_SELECTOR).forEach((el) => {
        el.style.transform = `translate3d(${sway.toFixed(2)}px, ${shift.toFixed(2)}px, 0) scale(1.08)`;
      });
    };

    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    };

    const syncShellListener = () => {
      const next = getShellScrollEl();
      if (next === attachedShell) return;
      attachedShell?.removeEventListener("scroll", onScroll);
      attachedShell = next;
      attachedShell?.addEventListener("scroll", onScroll, { passive: true });
      apply();
    };

    const onReduceChange = () => {
      apply();
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("scroll", onScroll, {
      passive: true,
      capture: true,
    });
    reduceMotion.addEventListener("change", onReduceChange);
    syncShellListener();
    apply();

    const observer = new MutationObserver(() => {
      syncShellListener();
      apply();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("scroll", onScroll, { capture: true });
      attachedShell?.removeEventListener("scroll", onScroll);
      reduceMotion.removeEventListener("change", onReduceChange);
      observer.disconnect();
      clearLayers();
    };
  }, [pathname]);

  return null;
}
