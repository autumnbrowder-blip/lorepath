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
  Loader2,
  LogIn,
  PenLine,
  Send,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

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
  const ratingsCtx = useBookRatingsOptional();
  const [ratings, setRatings] = useState<ContentRating>(
    initialRatings ?? DEFAULT_RATINGS
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  /** Keeps confirmed marks across a refresh that temporarily returns null. */
  const confirmedRef = useRef<ContentRating | null>(initialRatings);

  // Hydrate from server when a saved rating exists. Do not wipe just-saved
  // values if SSR briefly returns null after router.refresh().
  useEffect(() => {
    if (initialRatings != null) {
      confirmedRef.current = initialRatings;
      setRatings((prev) =>
        ratingsEqual(prev, initialRatings) ? prev : initialRatings
      );
      return;
    }
    if (confirmedRef.current != null) {
      setRatings(confirmedRef.current);
    }
  }, [initialRatings]);

  function updateRating(key: keyof ContentRating, value: number) {
    setRatings((prev) => ({ ...prev, [key]: value }));
    setSuccess(false);
    setError(null);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
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
        confirmedRef.current = data.userRating;
        setRatings(data.userRating);
      } else {
        confirmedRef.current = ratings;
      }

      if (data.communityRatings) {
        ratingsCtx?.setCommunityRatings(data.communityRatings);
        onRatingsUpdated?.(data.communityRatings);
      }

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
              Inscribe Your Rating
            </h2>
            <p className="font-heading text-sm nav-dragon-gold">
              Mark this tome across each content category
            </p>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-0.5">
          {!isLoggedIn ? (
            <div className="flex flex-col items-center justify-center rounded-sm border border-dashed border-gold-600/35 bg-forest-950/50 px-4 py-5 text-center">
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-sm border border-gold-600/40 bg-forest-950/60 text-accent">
                <LogIn className="h-5 w-5" />
              </div>
              <p className="font-storybook text-base font-bold nav-dragon-gold">
                Sign in to rate this book
              </p>
              <p className="mt-1.5 max-w-xs font-heading text-sm nav-dragon-gold">
                Create an account or log in to submit your content ratings.
              </p>
              <Link href="/login" className="btn-primary mt-4">
                <LogIn className="h-4 w-4" />
                Go to login
              </Link>
            </div>
          ) : (
            <>
              <p className="mb-3 shrink-0 font-heading text-base leading-snug nav-dragon-gold sm:text-lg">
                0 = none · 5 = very high
              </p>

              <div
                className="rating-form-status mb-3 shrink-0 overflow-hidden"
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
                      Your marks have been recorded in the tome.
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
                  Submit Rating
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
