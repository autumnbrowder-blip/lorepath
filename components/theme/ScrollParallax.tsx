"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const SHELL_SCROLL_SELECTOR = ".fantasy-page-shell-scroll";
const LAYER_SELECTOR = "[data-scroll-parallax]";

/** Desktop-only: tiny vertical drift. Mobile stays static (CSS + JS). */
const DESKTOP_MIN_WIDTH = 1024;
const MAX_SHIFT_PX = 14;
const SCROLL_FACTOR = 0.022;
const LERP = 0.12;

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

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isDesktopMotionAllowed(): boolean {
  return (
    window.matchMedia(`(min-width: ${DESKTOP_MIN_WIDTH}px)`).matches &&
    !prefersReducedMotion()
  );
}

/**
 * Near-static backgrounds by default. On desktop only, a tiny smoothed
 * vertical translate (capped) — no horizontal sway. Mobile + reduced-motion
 * stay fully static for coverage and comfort.
 */
export function ScrollParallax() {
  const pathname = usePathname();

  useEffect(() => {
    let attachedShell: HTMLElement | null = null;
    let frame = 0;
    let currentShift = 0;
    let targetShift = 0;
    let ticking = false;

    const clearLayers = () => {
      currentShift = 0;
      targetShift = 0;
      document.querySelectorAll<HTMLElement>(LAYER_SELECTOR).forEach((el) => {
        el.style.transform = "";
        el.style.willChange = "";
      });
    };

    const paint = () => {
      ticking = false;
      if (!isDesktopMotionAllowed()) {
        clearLayers();
        return;
      }

      currentShift += (targetShift - currentShift) * LERP;
      if (Math.abs(targetShift - currentShift) < 0.05) {
        currentShift = targetShift;
      }

      const y = currentShift.toFixed(2);
      document.querySelectorAll<HTMLElement>(LAYER_SELECTOR).forEach((el) => {
        el.style.willChange = "transform";
        /* Modest scale bleed so a few px of translate never shows edges */
        el.style.transform = `translate3d(0, ${y}px, 0) scale(1.04)`;
      });

      if (Math.abs(targetShift - currentShift) >= 0.05) {
        ticking = true;
        frame = requestAnimationFrame(paint);
      } else {
        document.querySelectorAll<HTMLElement>(LAYER_SELECTOR).forEach((el) => {
          el.style.willChange = "auto";
        });
      }
    };

    const updateTarget = () => {
      if (!isDesktopMotionAllowed()) {
        clearLayers();
        return;
      }
      targetShift = Math.min(MAX_SHIFT_PX, currentScrollY() * SCROLL_FACTOR);
      if (!ticking) {
        ticking = true;
        frame = requestAnimationFrame(paint);
      }
    };

    const onScroll = () => {
      updateTarget();
    };

    const syncShellListener = () => {
      const next = getShellScrollEl();
      if (next === attachedShell) return;
      attachedShell?.removeEventListener("scroll", onScroll);
      attachedShell = next;
      attachedShell?.addEventListener("scroll", onScroll, { passive: true });
      updateTarget();
    };

    const onViewportChange = () => {
      updateTarget();
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("scroll", onScroll, {
      passive: true,
      capture: true,
    });
    window.addEventListener("resize", onViewportChange, { passive: true });
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const desktopMq = window.matchMedia(`(min-width: ${DESKTOP_MIN_WIDTH}px)`);
    reduceMotion.addEventListener("change", onViewportChange);
    desktopMq.addEventListener("change", onViewportChange);

    syncShellListener();
    updateTarget();

    const observer = new MutationObserver(() => {
      syncShellListener();
      updateTarget();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onViewportChange);
      attachedShell?.removeEventListener("scroll", onScroll);
      reduceMotion.removeEventListener("change", onViewportChange);
      desktopMq.removeEventListener("change", onViewportChange);
      observer.disconnect();
      clearLayers();
    };
  }, [pathname]);

  return null;
}
