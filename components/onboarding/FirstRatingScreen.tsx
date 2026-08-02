"use client";

import { BookCover } from "@/components/books/BookCover";
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
import { FormEvent, useState } from "react";

type FirstRatingScreenProps = {
  suggestions: BookSummary[];
  ratingCount: number;
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
  hasRated,
  hasSeenMatch,
}: {
  hasRated: boolean;
  hasSeenMatch: boolean;
}) {
  const steps: { label: string; done: boolean }[] = [
    { label: "Create account", done: true },
    { label: "Set Preference Codex", done: true },
    { label: "Rate your first book", done: hasRated },
    { label: "See your first Match Score", done: hasSeenMatch },
  ];

  return (
    <ol
      className="relative mt-6 space-y-2"
      style={{
        backgroundImage: "url('/images/parchment.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        border: "3px solid #8c6b2e",
        borderRadius: "6px",
        boxShadow:
          "0 6px 16px rgba(0,0,0,0.35), inset 0 0 40px rgba(139, 105, 20, 0.15)",
        padding: "14px 16px",
      }}
    >
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
  const hasSeenMatch = hasRated && matchScore != null;

  function clearCelebrate() {
    setCelebrate(false);
    router.replace("/onboarding/first-rating", { scroll: false });
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
          <div
            className="relative overflow-hidden rounded-sm px-5 py-8 text-center shadow-[0_18px_48px_rgba(0,0,0,0.4)] animate-fade-in-up sm:px-8 sm:py-10"
            style={{
              backgroundImage: "url('/images/parchment.jpg')",
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
              border: "3px solid #8c6b2e",
              boxShadow:
                "0 6px 16px rgba(0,0,0,0.35), inset 0 0 40px rgba(139, 105, 20, 0.22), 0 0 28px rgba(212, 175, 55, 0.18)",
            }}
          >
            <div
              className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#d4af37]/70 to-transparent"
              aria-hidden="true"
            />
            <Sparkles
              className="mx-auto mb-4 h-8 w-8 text-[#a67c2d]"
              aria-hidden="true"
            />
            <h1 className="font-storybook text-2xl font-semibold tracking-[0.05em] text-[#2f1f0f] sm:text-3xl">
              Your first mark has been recorded in the tome.
            </h1>
            {ratedBookTitle && (
              <p className="mt-3 font-heading text-base leading-relaxed text-[#3f2a1e]/90">
                &ldquo;{ratedBookTitle}&rdquo; now carries your inscription.
              </p>
            )}

            {matchScore != null ? (
              <div className="mx-auto mt-6 max-w-xs rounded-sm border border-[#8c6b2e]/55 bg-[#2f1f0f]/08 px-4 py-3">
                <p className="font-storybook text-xs font-semibold tracking-[0.14em] text-[#5c3f0f]">
                  Match Score
                </p>
                <p className="mt-1 font-storybook text-3xl font-bold tabular-nums text-[#2f1f0f]">
                  {matchScore}%
                </p>
                <p className="mt-1 font-heading text-sm text-[#3f2a1e]/85">
                  How this tome aligns with your Preferences Codex.
                </p>
              </div>
            ) : (
              <p className="mt-5 font-heading text-sm leading-relaxed text-[#3f2a1e]/88">
                Match Scores grow sharper as more marks are left on each tome.
              </p>
            )}

            <div className="mt-8 flex flex-col items-stretch gap-3 sm:items-center">
              <button
                type="button"
                onClick={clearCelebrate}
                className="btn-primary w-full justify-center px-6 py-3.5 text-sm tracking-[0.14em] sm:w-auto sm:min-w-[12rem]"
              >
                <Feather className="h-4 w-4" aria-hidden="true" />
                Rate one more
              </button>
              <Link
                href="/browse"
                className="btn-secondary w-full justify-center px-6 py-3 text-sm tracking-[0.12em] sm:w-auto"
              >
                See Match Scores on Browse
              </Link>
            </div>
          </div>

          <ProgressChecklist hasRated={hasRated} hasSeenMatch={hasSeenMatch} />

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

  return (
    <FantasyPageShell variant="browse" priority>
      <div className="mx-auto flex w-full max-w-xl flex-col px-5 pb-20 pt-8 sm:pt-12">
        <header className="text-center">
          <h1 className="font-storybook text-3xl font-normal tracking-[0.05em] nav-dragon-gold sm:text-4xl">
            Your Preferences Codex is set
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
          className="mt-6 w-full"
          style={{
            backgroundImage: "url('/images/parchment.jpg')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            border: "3px solid #8c6b2e",
            borderRadius: "6px",
            boxShadow:
              "0 6px 16px rgba(0,0,0,0.35), inset 0 0 40px rgba(139, 105, 20, 0.15)",
            padding: "14px 16px",
          }}
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

        <ProgressChecklist hasRated={hasRated} hasSeenMatch={hasSeenMatch} />

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
