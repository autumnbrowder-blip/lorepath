"use client";

import { BookCover } from "@/components/books/BookCover";
import { MatchScorePercent } from "@/components/books/MatchScorePercent";
import { FantasyPageShell } from "@/components/theme/FantasyPageShell";
import { finalizeSearchBooks } from "@/lib/search-finalize";
import { rankSearchResults } from "@/lib/book-utils";
import type { BookSummary } from "@/types/book";
import {
  AlertCircle,
  Check,
  Circle,
  Feather,
  Loader2,
  Search,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

type FirstRatingScreenProps = {
  suggestions: BookSummary[];
  ratingCount: number;
  hasPreferences: boolean;
  hasSeenMatchScore: boolean;
  onboardingComplete: boolean;
  /** True when arriving after a successful rating from a book page. */
  justRated: boolean;
  ratedBookId: string | null;
  ratedBookTitle: string | null;
  /** Match score % for the just-rated book when community data exists. */
  matchScore: number | null;
};

function bookHref(bookId: string, searchQuery?: string) {
  const params = new URLSearchParams();
  params.set("from", "first-rating");
  if (searchQuery?.trim()) {
    params.set("q", searchQuery.trim());
  }
  return `/books/${encodeURIComponent(bookId)}?${params.toString()}`;
}

function ProgressChecklist({
  hasPreferences,
  hasRated,
  hasSeenMatch,
}: {
  hasPreferences: boolean;
  hasRated: boolean;
  hasSeenMatch: boolean;
}) {
  const steps: { label: string; done: boolean }[] = [
    { label: "Create account", done: true },
    { label: "Set Preference Codex", done: hasPreferences },
    { label: "Rate your first book", done: hasRated },
    { label: "See your first Match Score", done: hasSeenMatch },
  ];

  return (
    <ol className="parchment-plaque relative mt-6 space-y-2 px-4 py-3.5">
      <p className="mb-2.5 font-storybook text-xs font-bold tracking-[0.14em] text-[#2f1f0f]">
        Your path so far
      </p>
      {steps.map((step) => (
        <li
          key={step.label}
          className="flex items-center gap-2.5 font-heading text-[15px] font-semibold text-[#1f1409]"
        >
          {step.done ? (
            <Check
              className="h-4 w-4 shrink-0 text-[#a67c2d]"
              aria-hidden="true"
            />
          ) : (
            <Circle
              className="h-3.5 w-3.5 shrink-0 text-[#8c6b2e]/70"
              aria-hidden="true"
            />
          )}
          <span className={step.done ? "" : "text-[#3f2a1e]"}>
            {step.label}
          </span>
          <span className="sr-only">{step.done ? "complete" : "not yet"}</span>
        </li>
      ))}
    </ol>
  );
}

function SuggestionCard({ book }: { book: BookSummary }) {
  return (
    <article className="preference-codex-box relative flex gap-3 !p-3 sm:!p-3.5">
      <div className="relative z-[3] h-24 w-[4.25rem] shrink-0 overflow-hidden rounded-sm border border-gold-600/40 bg-forest-950/50">
        <BookCover
          book={book}
          variant="card"
          className="object-cover"
          sizes="68px"
        />
      </div>
      <div className="relative z-[3] flex min-w-0 flex-1 flex-col">
        <h3 className="line-clamp-2 font-storybook text-sm font-bold leading-snug tracking-[0.04em] nav-dragon-gold sm:text-[15px]">
          {book.title}
        </h3>
        {book.authors.length > 0 && (
          <p className="mt-1 line-clamp-1 font-heading text-xs nav-dragon-gold/90 sm:text-sm">
            {book.authors.join(", ")}
          </p>
        )}
        <Link
          href={bookHref(book.id)}
          className="btn-primary mt-auto w-full justify-center px-3 py-2.5 text-[11px] tracking-[0.12em] sm:w-auto sm:self-start"
        >
          <Feather className="h-3.5 w-3.5" aria-hidden="true" />
          Rate this book
        </Link>
      </div>
    </article>
  );
}

export function FirstRatingScreen({
  suggestions,
  ratingCount,
  hasPreferences,
  hasSeenMatchScore,
  onboardingComplete,
  justRated,
  ratedBookId,
  ratedBookTitle,
  matchScore,
}: FirstRatingScreenProps) {
  const router = useRouter();
  const [celebrate, setCelebrate] = useState(justRated);
  const [query, setQuery] = useState("");
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const hasRated = ratingCount >= 1 || Boolean(ratedBookId && justRated);
  const hasSeenMatch = hasSeenMatchScore || (hasRated && matchScore != null);
  const showChecklist = !onboardingComplete;

  // Belt-and-suspenders: if ratings already exist and we're not celebrating,
  // leave this page (server also redirects).
  useEffect(() => {
    if (!celebrate && hasRated) {
      router.replace("/browse");
    }
  }, [celebrate, hasRated, router]);

  function goToBrowse() {
    setCelebrate(false);
    router.push("/browse");
  }

  async function handleSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setHasSearched(true);
    setBooks([]);

    try {
      const params = new URLSearchParams({ q: trimmed, page: "1" });
      const response = await fetch(`/api/books/search?${params.toString()}`);
      const data = (await response.json()) as {
        books?: BookSummary[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Search failed.");
      }
      const raw = Array.isArray(data.books) ? data.books : [];
      if (
        raw.length === 0 &&
        typeof data.error === "string" &&
        data.error.trim()
      ) {
        throw new Error(data.error);
      }
      const finalized = finalizeSearchBooks(raw, {
        ratedIds: new Set(),
        debug: false,
      });
      setBooks(rankSearchResults(finalized, trimmed).slice(0, 8));
    } catch (err) {
      setBooks([]);
      setError(
        err instanceof Error ? err.message : "Something went wrong. Try again."
      );
    } finally {
      setLoading(false);
    }
  }

  if (celebrate) {
    return (
      <FantasyPageShell variant="browse" priority>
        <div className="mx-auto flex w-full max-w-lg flex-col px-5 pb-16 pt-10 sm:pt-14">
          <div className="parchment-plaque relative overflow-hidden px-5 py-8 text-center animate-fade-in-up sm:px-8 sm:py-10">
            <div
              className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#d4af37]/70 to-transparent"
              aria-hidden="true"
            />
            <Sparkles
              className="mx-auto mb-4 h-8 w-8 text-[#a67c2d]"
              aria-hidden="true"
            />
            <h1 className="font-storybook text-2xl font-semibold tracking-[0.05em] text-[#2f1f0f] sm:text-3xl">
              Your first mark has been recorded in the archives.
            </h1>
            {ratedBookTitle && (
              <p className="mt-3 font-heading text-[17px] font-medium leading-relaxed text-[#2a1a0c] sm:text-lg">
                &ldquo;{ratedBookTitle}&rdquo; now carries your mark.
              </p>
            )}

            <div className="mx-auto mt-6 flex min-h-[8.5rem] w-full max-w-xs items-center justify-center">
              {matchScore != null ? (
                <MatchScorePercent
                  score={matchScore}
                  caption="How this tome aligns with your Preference Codex."
                />
              ) : (
                <p className="font-heading text-[15px] font-medium leading-relaxed text-[#2a1a0c]">
                  Match Scores grow sharper as more marks are left on each tome.
                </p>
              )}
            </div>

            <div className="mt-8 flex flex-col items-stretch gap-3 sm:items-center">
              <button
                type="button"
                onClick={goToBrowse}
                className="btn-primary w-full justify-center px-6 py-3.5 text-sm tracking-[0.14em] sm:w-auto sm:min-w-[12rem]"
              >
                <Feather className="h-4 w-4" aria-hidden="true" />
                Rate one more
              </button>
              <Link
                href="/browse"
                className="btn-primary w-full justify-center px-6 py-3.5 text-sm tracking-[0.14em] sm:w-auto sm:min-w-[12rem]"
              >
                See Match Scores on Browse
              </Link>
            </div>
          </div>

          {showChecklist ? (
            <ProgressChecklist
              hasPreferences={hasPreferences}
              hasRated={hasRated}
              hasSeenMatch={hasSeenMatch}
            />
          ) : null}

          <Link
            href="/browse"
            className="mt-8 text-center font-heading text-sm tracking-[0.06em] text-[#e2c06a] underline decoration-[#8c6b2e]/55 underline-offset-4 transition hover:text-[#f0d070] hover:decoration-[#d4af37]"
          >
            Explore the shelves instead
          </Link>
        </div>
      </FantasyPageShell>
    );
  }

  // Already rated — server redirects; avoid flashing the first-mark prompt.
  if (hasRated) {
    return (
      <FantasyPageShell variant="browse" priority>
        <div className="mx-auto flex w-full max-w-lg flex-col items-center px-5 pb-16 pt-14">
          <Loader2 className="mb-3 h-8 w-8 animate-spin text-gold-500" />
          <p className="font-heading text-sm nav-dragon-gold">
            Taking you to the shelves...
          </p>
        </div>
      </FantasyPageShell>
    );
  }

  return (
    <FantasyPageShell variant="browse" priority>
      <div className="mx-auto flex w-full max-w-xl flex-col px-5 pb-20 pt-8 sm:pt-12">
        <header className="text-center">
          <h1 className="font-storybook text-3xl font-normal tracking-[0.05em] nav-dragon-gold sm:text-4xl">
            Your Preference Codex is set
          </h1>
          <div
            className="mx-auto mt-3 h-px w-36 bg-gradient-to-r from-transparent via-gold-600/70 to-transparent"
            aria-hidden="true"
          />
          <p className="mt-4 font-heading text-base leading-relaxed nav-dragon-gold sm:text-lg">
            Rate a book you&apos;ve read so Match Scores can begin.
          </p>
        </header>

        <form
          onSubmit={handleSearch}
          className="parchment-plaque mt-6 w-full px-4 py-3.5"
        >
          <div className="relative flex flex-col gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-[#a67c2d]" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for a book you've read..."
                autoComplete="off"
                className="w-full bg-transparent py-3.5 pl-11 pr-3 text-[17px] placeholder:text-[#4a2f0f] placeholder:opacity-75 focus:outline-none"
                style={{
                  color: "#2f1f0f",
                  fontFamily: "var(--font-heading), Georgia, serif",
                  WebkitTextFillColor: "#2f1f0f",
                  caretColor: "#2f1f0f",
                  background: "transparent",
                  border: "none",
                  boxShadow: "none",
                  colorScheme: "light",
                }}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="btn-primary w-full justify-center px-8 py-3.5 text-sm tracking-[0.14em]"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Searching...
                </>
              ) : (
                "Search"
              )}
            </button>
          </div>
        </form>

        <p className="mt-4 text-center font-heading text-sm leading-relaxed nav-dragon-gold">
          Have finished books elsewhere?{" "}
          <Link
            href="/import"
            className="font-semibold underline decoration-gold-500/60 underline-offset-4 transition hover:brightness-125"
          >
            Import books you&apos;ve read
          </Link>
        </p>

        {error && (
          <div className="alert-error mt-4" role="alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {loading ? (
          <div className="mt-6 flex flex-col items-center py-8 text-center">
            <Loader2 className="mb-3 h-8 w-8 animate-spin text-gold-500" />
            <p className="font-heading text-sm nav-dragon-gold">
              Searching the archives...
            </p>
          </div>
        ) : hasSearched && books.length === 0 && !error ? (
          <p className="mt-6 text-center font-heading text-sm leading-relaxed nav-dragon-gold">
            Nothing matched that title. Try another spelling — or search any
            title you&apos;ve read to leave your first mark.
          </p>
        ) : books.length > 0 ? (
          <ul className="mt-6 space-y-3">
            {books.map((book) => (
              <li key={book.id}>
                <Link
                  href={bookHref(book.id, query)}
                  className="preference-codex-box relative flex items-center gap-3 !p-3 transition hover:brightness-110"
                >
                  <div className="relative z-[3] h-16 w-12 shrink-0 overflow-hidden rounded-sm border border-gold-600/40">
                    <BookCover
                      book={book}
                      variant="card"
                      className="object-cover"
                      sizes="48px"
                    />
                  </div>
                  <div className="relative z-[3] min-w-0 flex-1">
                    <p className="line-clamp-2 font-storybook text-sm font-bold tracking-[0.04em] nav-dragon-gold">
                      {book.title}
                    </p>
                    {book.authors.length > 0 && (
                      <p className="mt-0.5 line-clamp-1 font-heading text-xs nav-dragon-gold/85">
                        {book.authors.join(", ")}
                      </p>
                    )}
                  </div>
                  <span className="relative z-[3] shrink-0 font-heading text-[11px] tracking-wide text-accent">
                    Rate →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        {!hasSearched && suggestions.length > 0 && (
          <section className="mt-8" aria-labelledby="suggested-tomes-heading">
            <h2
              id="suggested-tomes-heading"
              className="mb-3 font-storybook text-sm font-semibold tracking-[0.12em] nav-dragon-gold"
            >
              Familiar tomes to mark
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {suggestions.map((book) => (
                <li key={book.id}>
                  <SuggestionCard book={book} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {!hasSearched && suggestions.length === 0 && (
          <p className="mt-6 text-center font-heading text-sm leading-relaxed nav-dragon-gold">
            Search any title you&apos;ve read to leave your first mark.
          </p>
        )}

        {showChecklist ? (
          <ProgressChecklist
            hasPreferences={hasPreferences}
            hasRated={hasRated}
            hasSeenMatch={hasSeenMatch}
          />
        ) : null}

        <div className="mt-10 text-center">
          <Link
            href="/browse"
            className="font-heading text-sm tracking-[0.06em] text-[#e2c06a] underline decoration-[#8c6b2e]/55 underline-offset-4 transition hover:text-[#f0d070] hover:decoration-[#d4af37]"
          >
            Explore the shelves instead
          </Link>
        </div>
      </div>
    </FantasyPageShell>
  );
}
