"use client";

import { useBookRatingsOptional } from "@/components/books/BookRatingsContext";
import { RatingSlider } from "@/components/books/RatingSlider";
import { CodexBoxOrnament } from "@/components/preferences/CodexBoxOrnament";
import {
  DEFAULT_RATINGS,
  PREFERENCE_CATEGORIES,
  RATING_CATEGORIES,
} from "@/lib/rating-categories";
import type { CommunityRatingsSummary } from "@/lib/ratings";
import { createClient } from "@/lib/supabase";
import type { ContentRating } from "@/types";
import {
  AlertCircle,
  CheckCircle2,
  Feather,
  Loader2,
  PenLine,
  Send,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type RatingFormProps = {
  bookId: string;
  isLoggedIn: boolean;
  /** Previously saved marks for this book+user; null when none exist yet. */
  initialRatings?: ContentRating | null;
  /** Optional when used outside BookRatingsProvider. */
  onRatingsUpdated?: (next: CommunityRatingsSummary) => void;
};

/** Match Preferences guidance text, without wrapping quotation marks. */
function withoutQuotes(text: string): string {
  return text.replace(/["“”]/g, "");
}

function preferenceGuidance(key: keyof ContentRating): {
  levelDescriptions?: Partial<Record<0 | 1 | 2 | 3 | 4 | 5, string>>;
} {
  const preference = PREFERENCE_CATEGORIES.find((item) => item.key === key);
  if (!preference?.levelDescriptions) {
    return {};
  }

  const levelDescriptions = Object.fromEntries(
    Object.entries(preference.levelDescriptions).map(([level, text]) => [
      Number(level),
      withoutQuotes(text),
    ])
  ) as Partial<Record<0 | 1 | 2 | 3 | 4 | 5, string>>;

  return { levelDescriptions };
}

function ratingsEqual(a: ContentRating, b: ContentRating): boolean {
  return RATING_CATEGORIES.every(
    (category) => a[category.key] === b[category.key]
  );
}

export function RatingForm({
  bookId,
  isLoggedIn,
  initialRatings = null,
  onRatingsUpdated,
}: RatingFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const ratingsCtx = useBookRatingsOptional();
  const registerHref = `/register?redirect=${encodeURIComponent(pathname || `/books/${bookId}`)}`;
  const loginHref = `/login?redirect=${encodeURIComponent(pathname || `/books/${bookId}`)}`;
  const [ratings, setRatings] = useState<ContentRating>(
    initialRatings ?? DEFAULT_RATINGS
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  /** True once a saved rating exists for this book (SSR, GET, or after first save). */
  const [hasExistingRating, setHasExistingRating] = useState(
    initialRatings != null
  );
  /** Keeps confirmed marks across a refresh that temporarily returns null. */
  const confirmedRef = useRef<ContentRating | null>(initialRatings);
  /** True after the user moves a slider; blocks late GET hydrates from clobbering edits. */
  const dirtyRef = useRef(false);
  /** Distinguishes first inscription vs rewriting marks in success copy. */
  const wasUpdatingRef = useRef(initialRatings != null);
  /** Status container; scrolled into view when a save succeeds. */
  const statusRef = useRef<HTMLDivElement | null>(null);

  // Scroll only on success (never on error), after the message has rendered.
  // scroll-margin-top on the container keeps it clear of the sticky navbar.
  useEffect(() => {
    if (!success || !statusRef.current) return;
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    statusRef.current.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "nearest",
    });
  }, [success]);

  async function authHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    try {
      const supabase = createClient();
      let {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        const refreshed = await supabase.auth.refreshSession();
        session = refreshed.data.session;
      }
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
    } catch {
      // Fall back to cookie session on the API.
    }
    return headers;
  }

  function applyConfirmedRating(next: ContentRating) {
    confirmedRef.current = next;
    dirtyRef.current = false;
    setHasExistingRating(true);
    setRatings((prev) => (ratingsEqual(prev, next) ? prev : next));
  }

  function applyCommunityRatings(next: CommunityRatingsSummary) {
    ratingsCtx?.setCommunityRatings(next);
    onRatingsUpdated?.(next);
  }

  // Hydrate from server when a saved rating exists. Do not wipe just-saved
  // values if SSR briefly returns null after router.refresh().
  useEffect(() => {
    if (initialRatings != null) {
      applyConfirmedRating(initialRatings);
      return;
    }
    if (confirmedRef.current != null) {
      setHasExistingRating(true);
      setRatings(confirmedRef.current);
    }
  }, [initialRatings]);

  // Only hydrate from the API when SSR did not provide a rating — avoids a
  // duplicate GET on every book detail visit for logged-in users.
  useEffect(() => {
    if (!isLoggedIn || !bookId || initialRatings != null) return;

    let cancelled = false;

    async function hydrateFromApi() {
      try {
        const headers = await authHeaders();
        const response = await fetch(`/api/books/${bookId}/ratings`, {
          method: "GET",
          headers,
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!response.ok || cancelled) return;

        const data = (await response.json()) as {
          userRating?: ContentRating | null;
          averages?: ContentRating | null;
          count?: number;
        };

        if (cancelled) return;

        if (data.userRating && !dirtyRef.current) {
          applyConfirmedRating(data.userRating);
        }

        if (typeof data.count === "number") {
          applyCommunityRatings({
            averages: data.averages ?? null,
            count: data.count,
          });
        }
      } catch {
        // SSR props remain the fallback.
      }
    }

    void hydrateFromApi();
    return () => {
      cancelled = true;
    };
  }, [bookId, isLoggedIn, initialRatings]);

  function updateRating(key: keyof ContentRating, value: number) {
    dirtyRef.current = true;
    setRatings((prev) => ({ ...prev, [key]: value }));
    setSuccess(false);
    setError(null);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    wasUpdatingRef.current = hasExistingRating;
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const headers = await authHeaders();

      const response = await fetch(`/api/books/${bookId}/ratings`, {
        method: "POST",
        headers,
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify(ratings),
      });

      const data = (await response.json()) as {
        error?: string;
        communityRatings?: CommunityRatingsSummary;
        userRating?: ContentRating;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to submit rating.");
      }

      // Prefer confirmed values from the API so remount/refresh cannot blank to zeros.
      if (data.userRating) {
        applyConfirmedRating(data.userRating);
      } else {
        confirmedRef.current = ratings;
        setHasExistingRating(true);
      }

      if (data.communityRatings) {
        applyCommunityRatings(data.communityRatings);
      }

      // POST already returned confirmed user + community marks — skip a
      // redundant GET. Refresh RSC islands (match score / rated lists).
      setSuccess(true);
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      aria-labelledby="rate-book-heading"
      className={`preference-codex-box-shell rating-form-panel animate-fade-in-up${
        isLoggedIn ? " rating-form-panel--inscribed" : ""
      }`}
      style={{ animationDelay: "150ms" }}
    >
      <div className="preference-codex-box-backdrop" aria-hidden="true">
        <div className="preference-codex-box-texture" />
        <CodexBoxOrnament />
      </div>
      <div className="preference-codex-box-content">
        <div className="mb-3 flex shrink-0 items-center gap-2.5 px-0.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-sm border border-gold-600/50 bg-gradient-to-br from-gold-500/30 to-transparent text-accent">
            <PenLine className="h-4 w-4" />
          </div>
          <div>
            <h2
              id="rate-book-heading"
              className="font-storybook text-base font-bold tracking-[0.1em] nav-dragon-gold sm:text-lg"
            >
              {hasExistingRating
                ? "Update Your Rating"
                : "Inscribe Your Rating"}
            </h2>
            <p className="font-heading text-sm nav-dragon-gold">
              {hasExistingRating
                ? "Revise your marks — changes will rewrite the prior inscription"
                : "Mark this tome across each content category"}
            </p>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-0.5">
          {!isLoggedIn ? (
            <div className="relative overflow-hidden rounded-sm border border-gold-600/50 bg-gradient-to-b from-[#1a2e24] to-forest-950/90 px-4 py-6 text-center shadow-[inset_0_1px_0_rgba(212,175,55,0.18)]">
              <div
                className="pointer-events-none absolute inset-0 opacity-20 mix-blend-overlay"
                aria-hidden="true"
                style={{
                  backgroundImage:
                    "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
                }}
              />
              <div className="relative z-[1] mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-sm border border-gold-500/55 bg-forest-950/70 text-[#d4af37]">
                <Feather className="h-5 w-5" aria-hidden="true" />
              </div>
              <p className="relative z-[1] font-storybook text-base font-bold tracking-[0.06em] nav-dragon-gold sm:text-lg">
                Create a free account to leave your marks
              </p>
              <p className="relative z-[1] mt-2 max-w-sm mx-auto font-heading text-sm leading-relaxed nav-dragon-gold">
                Join the archives to inscribe content ratings on this tome and
                unlock your Match Score.
              </p>
              <Link href={registerHref} className="btn-primary relative z-[1] mt-5">
                <Feather className="h-4 w-4" aria-hidden="true" />
                Create free account
              </Link>
              <p className="relative z-[1] mt-3 font-heading text-sm nav-dragon-gold">
                Already a traveler?{" "}
                <Link
                  href={loginHref}
                  className="underline decoration-gold-600/60 underline-offset-4 hover:decoration-gold-500"
                >
                  Sign in
                </Link>
              </p>
            </div>
          ) : (
            <>
              <p className="mb-3 shrink-0 font-heading text-base leading-snug nav-dragon-gold sm:text-lg">
                0 = none · 5 = very high
              </p>

              <div
                ref={statusRef}
                className="rating-form-status mb-3 shrink-0 scroll-mb-4 scroll-mt-20 overflow-hidden"
                role="status"
                aria-live="polite"
              >
                {error ? (
                  <div className="alert-error">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p className="line-clamp-2">{error}</p>
                  </div>
                ) : success ? (
                  <div className="alert-success">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#f0d78a]" />
                    <p className="font-heading text-sm nav-dragon-gold">
                      {wasUpdatingRef.current
                        ? "Your marks have been rewritten in the tome."
                        : "Your marks have been recorded in the tome."}
                    </p>
                  </div>
                ) : null}
              </div>

              <form
                onSubmit={handleSubmit}
                className="flex flex-1 flex-col gap-2.5"
              >
                {RATING_CATEGORIES.map((category, index) => {
                  const guidance = preferenceGuidance(category.key);
                  return (
                    <RatingSlider
                      key={category.key}
                      id={category.key}
                      label={category.label}
                      levelDescriptions={guidance.levelDescriptions}
                      value={ratings[category.key]}
                      onChange={(value) => updateRating(category.key, value)}
                      index={index}
                    />
                  );
                })}

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary mt-auto w-full shrink-0"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {hasExistingRating ? "Update Rating" : "Submit Rating"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
