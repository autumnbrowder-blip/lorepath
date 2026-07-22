"use client";

import { ArrowUp } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const SCROLL_THRESHOLD = 300;
const SHELL_SCROLL_SELECTOR = ".fantasy-page-shell-scroll";

function getShellScrollEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>(SHELL_SCROLL_SELECTOR);
}

function currentScrollY(): number {
  const shell = getShellScrollEl();
  if (shell) return shell.scrollTop;
  return window.scrollY;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Site-wide floating control: appears after scrolling past a threshold,
 * then smoothly returns to the top of the active scroll container
 * (window, or FantasyPageShell’s inner scroller).
 */
export function BackToTop() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let shell: HTMLElement | null = getShellScrollEl();
    let frame = 0;

    const updateVisibility = () => {
      setVisible(currentScrollY() > SCROLL_THRESHOLD);
    };

    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateVisibility);
    };

    const bindShell = (next: HTMLElement | null) => {
      if (shell === next) return;
      shell?.removeEventListener("scroll", onScroll);
      shell = next;
      shell?.addEventListener("scroll", onScroll, { passive: true });
      updateVisibility();
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    bindShell(getShellScrollEl());
    updateVisibility();

    // Shell mounts after client navigation; keep the listener attached.
    const observer = new MutationObserver(() => {
      bindShell(getShellScrollEl());
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      shell?.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, [pathname]);

  const handleClick = () => {
    const behavior: ScrollBehavior = prefersReducedMotion()
      ? "auto"
      : "smooth";
    const shell = getShellScrollEl();
    if (shell) {
      shell.scrollTo({ top: 0, behavior });
      return;
    }
    window.scrollTo({ top: 0, behavior });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Back to top"
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      className={`fixed bottom-[max(1.25rem,calc(0.75rem+env(safe-area-inset-bottom,0px)))] right-4 z-40 flex h-11 w-11 items-center justify-center rounded-xl border border-gold-600/55 bg-[#ebe0c4] text-[#1a2e22] shadow-[0_8px_24px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,250,235,0.55)] transition-[opacity,transform] duration-300 sm:bottom-[max(1.75rem,calc(1rem+env(safe-area-inset-bottom,0px)))] sm:right-6 ${
        visible
          ? "pointer-events-auto translate-y-0 opacity-100"
          : "pointer-events-none translate-y-2 opacity-0"
      } hover:-translate-y-0.5 hover:border-gold-500/70 hover:shadow-[0_10px_28px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,250,235,0.65)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500/70`}
      style={{
        backgroundImage:
          "linear-gradient(160deg, #f3ead4 0%, #ebe0c4 45%, #e4d6b0 100%)",
      }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-xl bg-gradient-to-br from-forest-950/5 via-transparent to-forest-950/10"
      />
      <ArrowUp
        className="relative h-5 w-5 stroke-[2.25] text-forest-950/85"
        aria-hidden="true"
      />
    </button>
  );
}
