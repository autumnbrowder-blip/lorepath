"use client";

import { useBookRatingsOptional } from "@/components/books/BookRatingsContext";
import { RatingSlider } from "@/components/books/RatingSlider";
import { SignupPrompt } from "@/components/auth/SignupPrompt";
import { CodexBoxOrnament } from "@/components/preferences/CodexBoxOrnament";
import {
  DEFAULT_RATINGS,
  PREFERENCE_CATEGORIES,
  RATING_CATEGORIES,
} from "@/lib/rating-categories";
import type { CommunityRatingsSummary } from "@/lib/ratings";
import { createClient, fetchWithAuthRetry } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { ContentRating } from "@/types";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  PenLine,
  ScrollText,
  Send,
} from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const SIGN_IN_TO_INSCRIBE = "Sign in to inscribe";

type RatingSavePayload = {
  ok?: boolean;
  status?: number;
  code?: string | null;
  message?: string;
  error?: string;
  communityRatings?: CommunityRatingsSummary;
  userRating?: ContentRating;
  averages?: CommunityRatingsSummary["averages"];
  count?: number;
};

function bannerFromRatingResponse(
  response: Response,
  data: RatingSavePayload
): string {
  const message =
    (typeof data.message === "string" && data.message.trim()) ||
    (typeof data.error === "string" && data.error.trim()) ||
    "";
  const status = data.status ?? response.status;
  const code =
    typeof data.code === "string" && data.code.trim() ? data.code.trim() : "";
  if (message) {
    const extras = [code, status ? `HTTP ${status}` : ""].filter(
      (part) => part && !message.includes(part)
    );
    return extras.length ? `${message} (${extras.join(", ")})` : message;
  }
  if (status === 401) return SIGN_IN_TO_INSCRIBE;
  return "Those marks could not be recorded. Stay on this page and try again.";
}

type RatingFormProps = {
  bookId: string;
  isLoggedIn: boolean;
  /** Previously saved marks for this book+user; null when none exist yet. */
  initialRatings?: ContentRating | null;
  /** Optional when used outside BookRatingsProvider. */
  onRatingsUpdated?: (next: CommunityRatingsSummary) => void;
  /**
   * When true (book opened from first-rating onboarding), redirect back
   * to the onboarding success screen after a successful submit.
   */
  returnToFirstRating?: boolean;
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
  returnToFirstRating = false,
}: RatingFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const ratingsCtx = useBookRatingsOptional();
  const redirectTo = pathname || `/books/${bookId}`;
  const [ratings, setRatings] = useState<ContentRating>(
    initialRatings ?? DEFAULT_RATINGS
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  /**
   * Client session. SSR `isLoggedIn` can lag if cookies were stale; if
   * getUser() returns a user we never show "create a free account".
   */
  const [clientSignedIn, setClientSignedIn] = useState<boolean | null>(
    isLoggedIn ? true : null
  );
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
  /** Save-error alert — scrolled and focused so it cannot be missed. */
  const errorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setClientSignedIn(isLoggedIn);
      return;
    }

    let cancelled = false;
    const supabase = createClient();
    const timeoutId = window.setTimeout(() => {
      if (!cancelled && !isLoggedIn) {
        setClientSignedIn((prev) => (prev === true ? prev : false));
      }
    }, 5000);

    supabase.auth
      .getUser()
      .then(({ data: { user } }) => {
        if (cancelled) return;
        window.clearTimeout(timeoutId);
        if (user) {
          setClientSignedIn(true);
          return;
        }
        if (!isLoggedIn) setClientSignedIn(false);
      })
      .catch(() => {
        if (cancelled) return;
        window.clearTimeout(timeoutId);
        if (!isLoggedIn) setClientSignedIn(false);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [isLoggedIn]);

  const canRate = isLoggedIn || clientSignedIn === true;

  // Scroll only on success, after the message has rendered.
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

  useEffect(() => {
    if (!error) return;
    const node = errorRef.current;
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    node.focus();
  }, [error]);

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

  function updateRating(key: keyof ContentRating, value: number) {
    dirtyRef.current = true;
    setRatings((prev) => ({ ...prev, [key]: value }));
    setSuccess(false);
    setError(null);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canRate) {
      setError(SIGN_IN_TO_INSCRIBE);
      return;
    }
    wasUpdatingRef.current = hasExistingRating;
    setLoading(true);
    setError(null);
    setSuccess(false);

    const submitted = ratings;

    try {
      const response = await fetchWithAuthRetry(`/api/books/${bookId}/ratings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify(submitted),
      });

      let data: RatingSavePayload = {};
      try {
        data = (await response.json()) as RatingSavePayload;
      } catch {
        setError(bannerFromRatingResponse(response, {}));
        return;
      }

      if (!response.ok || data.ok === false) {
        setError(bannerFromRatingResponse(response, data));
        return;
      }

      // Keep the sliders on the values just submitted — never reset to 0.
      applyConfirmedRating(submitted);

      if (data.communityRatings) {
        applyCommunityRatings(data.communityRatings);
      } else if (typeof data.count === "number") {
        applyCommunityRatings({
          averages: data.averages ?? null,
          count: data.count,
        });
      }

      // Let browse cards show Inscribed immediately after return (same tab).
      try {
        const prev = sessionStorage.getItem("lorepath-just-rated-slugs");
        const list = prev ? (JSON.parse(prev) as unknown) : [];
        const slugs = Array.isArray(list)
          ? list.filter((value): value is string => typeof value === "string")
          : [];
        if (!slugs.includes(bookId)) slugs.push(bookId);
        sessionStorage.setItem(
          "lorepath-just-rated-slugs",
          JSON.stringify(slugs)
        );
      } catch {
        // sessionStorage may be unavailable.
      }

      setSuccess(true);
      if (returnToFirstRating) {
        const params = new URLSearchParams({
          rated: "1",
          bookId,
        });
        router.push(`/onboarding/first-rating?${params.toString()}`);
        return;
      }
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Those marks could not be recorded. Stay on this page and try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      aria-labelledby="rate-book-heading"
      className={`ornate-plaque preference-codex-box-shell rating-form-panel animate-fade-in-up${
        canRate ? " rating-form-panel--inscribed" : ""
      }`}
      style={{ animationDelay: "150ms" }}
    >
      <div className="preference-codex-box-backdrop" aria-hidden="true">
        <div className="preference-codex-box-texture" />
        <CodexBoxOrnament />
      </div>
      <div className="preference-codex-box-content">
        <div className="mb-2 flex shrink-0 items-center gap-2.5 px-0.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-sm border border-gold-600/50 bg-gradient-to-br from-gold-500/30 to-transparent text-accent">
            <PenLine className="h-4 w-4" />
          </div>
          <div>
            <h2
              id="rate-book-heading"
              className="font-heading text-base font-medium tracking-normal nav-dragon-gold sm:text-lg"
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
          {canRate ? (
            <>
              <p className="mb-2 shrink-0 font-heading text-sm leading-snug nav-dragon-gold sm:text-base">
                0 = none · 5 = very high
              </p>

              <div
                ref={statusRef}
                className="rating-form-status mb-2 shrink-0 scroll-mb-4 scroll-mt-20 overflow-hidden"
                role="status"
                aria-live="polite"
              >
                {success ? (
                  <div className="alert-success">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#f0d78a]" />
                    <p className="font-heading text-sm nav-dragon-gold">
                      {wasUpdatingRef.current
                        ? "Your marks have been rewritten in the tome."
                        : "Your marks have been recorded in the tome."}
                    </p>
                  </div>
                ) : hasExistingRating ? (
                  <div className="flex h-full items-start gap-2 rounded-sm border border-gold-600/45 bg-[#0c1f19]/75 px-3 py-2">
                    <ScrollText
                      className="mt-0.5 h-4 w-4 shrink-0 text-[#e2c06a]"
                      aria-hidden="true"
                    />
                    <p className="font-heading text-sm leading-snug nav-dragon-gold">
                      Your marks are in this tome
                    </p>
                  </div>
                ) : null}
              </div>

              <form
                onSubmit={handleSubmit}
                className="flex flex-1 flex-col gap-2"
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

                {error ? (
                  <div
                    ref={errorRef}
                    tabIndex={-1}
                    role="alert"
                    className="mt-1 flex items-start gap-2 rounded-sm border border-gold-600/45 bg-[#0c1f19]/75 px-3 py-2 font-heading text-sm leading-snug nav-dragon-gold outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-600/70"
                  >
                    <AlertCircle
                      className="mt-0.5 h-4 w-4 shrink-0 text-[#e2c06a]"
                      aria-hidden="true"
                    />
                    <p>{error}</p>
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary mt-1 w-full shrink-0"
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
          ) : clientSignedIn === false ? (
            <SignupPrompt redirectTo={redirectTo} variant="panel" />
          ) : (
            <div className="flex flex-1 items-center justify-center py-8">
              <Loader2
                className="h-5 w-5 animate-spin text-[#e2c06a]"
                aria-label="Checking your session"
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
