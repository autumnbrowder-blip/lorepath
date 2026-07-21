"use client";

import { BestsellersSection } from "@/components/browse/BestsellersSection";
import { BookCard } from "@/components/browse/BookCard";
import { FantasyPageShell } from "@/components/theme/FantasyPageShell";
import { finalizeSearchBooks } from "@/lib/search-finalize";
import type { BookSource, BookSummary } from "@/types/book";
import { AlertCircle, Loader2, Search } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const sourceLabels: Record<BookSource | "multi", string> = {
  google: "Google Books",
  openlibrary: "Open Library",
  gutendex: "Project Gutenberg",
  nyt: "New York Times",
  isbndb: "ISBNdb",
  bigbook: "Big Book",
  multi: "Multiple sources",
};

function mergeSearchResults(
  existing: BookSummary[],
  incoming: BookSummary[]
): BookSummary[] {
  // Same cleanup path as the server (quality filter, dedupe, year sort)
  return finalizeSearchBooks([...existing, ...incoming]);
}

type BookSearchProps = {
  initialQuery?: string;
  /** "genre" = subject/topic search from a tag click. */
  initialMode?: "text" | "genre";
  /** Prefetched NYT lists — display-only; does not affect search. */
  bestsellers?: BookSummary[];
  bestsellersError?: string | null;
};

export function BookSearch({
  initialQuery = "",
  initialMode = "text",
  bestsellers = [],
  bestsellersError = null,
}: BookSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [searchMode, setSearchMode] = useState<"text" | "genre">(initialMode);
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [sources, setSources] = useState<BookSource[]>([]);
  const [sourceCounts, setSourceCounts] = useState<
    Partial<Record<BookSource, number>>
  >({});
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const initialSearchDone = useRef(false);
  const searchModeRef = useRef<"text" | "genre">(initialMode);

  async function fetchSearchPage(
    searchQuery: string,
    pageNumber: number,
    mode: "text" | "genre"
  ) {
    const params = new URLSearchParams({
      q: searchQuery,
      page: String(pageNumber),
    });
    if (mode === "genre") {
      params.set("mode", "genre");
    }

    const response = await fetch(`/api/books/search?${params.toString()}`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "Search failed.");
    }
    return data as {
      books?: BookSummary[];
      sources?: BookSource[];
      source?: BookSource;
      sourceCounts?: Partial<Record<BookSource, number>>;
      hasMore?: boolean;
      page?: number;
    };
  }

  async function runSearch(
    searchQuery: string,
    syncUrl = true,
    mode: "text" | "genre" = "text"
  ) {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setHasSearched(true);
    setPage(1);
    setHasMore(false);
    setSearchMode(mode);
    searchModeRef.current = mode;

    if (syncUrl) {
      const params = new URLSearchParams({ q: trimmed });
      if (mode === "genre") params.set("mode", "genre");
      router.replace(`/browse?${params.toString()}`, {
        scroll: false,
      });
    }

    try {
      const data = await fetchSearchPage(trimmed, 1, mode);

      setBooks(data.books ?? []);
      const nextSources: BookSource[] =
        Array.isArray(data.sources) && data.sources.length > 0
          ? data.sources
          : data.source
            ? [data.source]
            : [];
      setSources(nextSources);
      setSourceCounts(data.sourceCounts ?? {});
      setPage(data.page ?? 1);
      setHasMore(Boolean(data.hasMore));
    } catch (err) {
      setBooks([]);
      setSources([]);
      setSourceCounts({});
      setHasMore(false);
      setError(
        err instanceof Error ? err.message : "Something went wrong. Try again."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadMore() {
    const trimmed = query.trim();
    if (!trimmed || loadingMore || !hasMore) return;

    const nextPage = page + 1;
    setLoadingMore(true);
    setError(null);

    try {
      const data = await fetchSearchPage(
        trimmed,
        nextPage,
        searchModeRef.current
      );
      const incoming = data.books ?? [];

      setBooks((current) => mergeSearchResults(current, incoming));
      setSourceCounts((current) => ({
        ...current,
        google: (current.google ?? 0) + (data.sourceCounts?.google ?? 0),
        openlibrary:
          (current.openlibrary ?? 0) + (data.sourceCounts?.openlibrary ?? 0),
        gutendex: (current.gutendex ?? 0) + (data.sourceCounts?.gutendex ?? 0),
        isbndb: (current.isbndb ?? 0) + (data.sourceCounts?.isbndb ?? 0),
        // Big Book count is omitted server-side when unconfigured — only sum
        // when the provider actually reported a number.
        ...(typeof data.sourceCounts?.bigbook === "number" ||
        typeof current.bigbook === "number"
          ? {
              bigbook:
                (current.bigbook ?? 0) + (data.sourceCounts?.bigbook ?? 0),
            }
          : {}),
      }));
      setPage(data.page ?? nextPage);
      setHasMore(Boolean(data.hasMore));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load more books. Try again."
      );
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    if (initialQuery && !initialSearchDone.current) {
      initialSearchDone.current = true;
      runSearch(initialQuery, false, initialMode);
    }
  }, [initialQuery, initialMode]);

  async function handleSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Typing in the search box is always a normal title/author search
    await runSearch(query, true, "text");
  }

  return (
    <FantasyPageShell variant="browse" priority>
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden="true"
      >
        {[
          { t: "18%", l: "22%", d: "0s" },
          { t: "35%", l: "72%", d: "1.2s" },
          { t: "55%", l: "40%", d: "2.1s" },
          { t: "68%", l: "80%", d: "0.5s" },
          { t: "42%", l: "12%", d: "1.7s" },
        ].map((p, i) => (
          <span
            key={i}
            className="absolute h-1 w-1 animate-dust rounded-full bg-gold-300/55"
            style={{ top: p.t, left: p.l, animationDelay: p.d }}
          />
        ))}
      </div>

      <div className="relative flex min-h-[calc(100vh-4.5rem)] flex-col">
        <div
          className={`mx-auto flex w-full max-w-2xl flex-col items-center px-6 ${
            hasSearched || loading
              ? "pb-8 pt-14 sm:pt-16"
              : "flex-1 justify-center pb-24 pt-10"
          }`}
        >
          <p className="relative mb-7 max-w-xl text-center text-[1.05rem] leading-relaxed sm:mb-8 sm:text-xl md:text-[1.35rem]">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-[2px] select-none font-[family-name:var(--font-storybook)] tracking-[0.03em] text-[#1a1205]/80 blur-[0.4px]"
            >
              A reader who knows themselves will never be truly lost among the
              shelves.
            </span>
            <span className="carved-gold-text relative">
              A reader who knows themselves will never be truly lost among the
              shelves.
            </span>
          </p>

          <form
            onSubmit={handleSearch}
            className="mx-auto w-full max-w-3xl"
            style={{
              backgroundImage: "url('/images/parchment.jpg')",
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
              border: "3px solid #8c6b2e",
              borderRadius: "6px",
              boxShadow:
                "0 6px 16px rgba(0,0,0,0.35), inset 0 0 40px rgba(139, 105, 20, 0.15)",
              padding: "14px 20px",
            }}
          >
            <div className="relative flex flex-col items-center gap-3 sm:flex-row">
              <Search className="absolute left-6 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-[#a67c2d]" />

              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                // Search runs only on form submit — never on each keystroke
                placeholder="Search by title, author, or ISBN..."
                autoComplete="off"
                className="flex-1 bg-transparent py-3 pl-14 pr-4 text-[17px] placeholder:text-[#4a2f0f] placeholder:opacity-75 focus:outline-none"
                style={{
                  color: "#2f1f0f",
                  fontFamily: "var(--font-heading), Georgia, serif",
                  WebkitTextFillColor: "#2f1f0f",
                  caretColor: "#2f1f0f",
                  background: "transparent",
                  backgroundColor: "transparent",
                  border: "none",
                  boxShadow: "none",
                  colorScheme: "light",
                }}
              />

              <button
                type="submit"
                disabled={loading || loadingMore || !query.trim()}
                className="btn-primary px-8 py-3 text-sm tracking-[0.14em]"
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
        </div>

        <div className="mx-auto w-full max-w-5xl px-6 pb-16">
          {!hasSearched && !loading && (
            <BestsellersSection
              books={bestsellers}
              error={bestsellersError}
            />
          )}

          {error && (
            <div className="alert-error mb-8 backdrop-blur-sm">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {loading && (
            <div
              className="mx-auto flex max-w-lg flex-col items-center justify-center px-6 py-12 text-center shadow-[0_18px_48px_rgba(0,0,0,0.4)]"
              style={{
                backgroundImage: "url('/images/parchment.jpg')",
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
                border: "2px solid #8c6b2e",
                borderRadius: "6px",
              }}
              aria-live="polite"
              aria-busy="true"
            >
              <Loader2 className="mb-4 h-9 w-9 animate-spin text-[#8c6b2e]" />
              <p className="font-storybook text-lg font-semibold tracking-[0.08em] text-[#2f1f0f]">
                Searching the archives...
              </p>
              <p className="mt-2 font-heading text-base text-[#4a2f0f]/85">
                Consulting Google Books, Open Library, Project Gutenberg,
                ISBNdb, and Big Book together.
              </p>
            </div>
          )}

          {!loading && hasSearched && books.length === 0 && !error && (
            <div
              className="mx-auto max-w-xl px-6 py-12 text-center shadow-[0_18px_48px_rgba(0,0,0,0.4)]"
              style={{
                backgroundImage: "url('/images/parchment.jpg')",
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
                border: "2px solid #8c6b2e",
                borderRadius: "6px",
              }}
            >
              <Search className="mx-auto mb-4 h-8 w-8 text-[#a67c2d]" />
              <p className="font-storybook text-xl font-semibold tracking-[0.06em] text-[#2f1f0f]">
                No tomes on this shelf
              </p>
              <p className="mt-3 font-heading text-lg leading-relaxed text-[#3f2a1e]/90">
                Nothing with a clear description matched &ldquo;{query}&rdquo;.
                Try another title, author name, or ISBN — the archives are
                vast.
              </p>
              <p className="mt-4 font-heading text-sm text-[#5c3f0f]/80">
                Tip: shorter keywords often open more doors.
              </p>
            </div>
          )}

          {!loading && books.length > 0 && (
            <>
              <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="font-storybook text-sm font-semibold tracking-[0.12em] nav-dragon-gold sm:text-[15px]">
                    {books.length} result{books.length !== 1 ? "s" : ""} for
                    &ldquo;{query}&rdquo;
                  </p>
                  <p className="mt-1.5 font-heading text-sm font-medium tracking-wide nav-dragon-gold">
                    Drawn from multiple archives at once
                  </p>
                </div>
                {sources.length > 0 && (
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    {sources.map((s) => {
                      const count = sourceCounts[s];
                      const showCount = typeof count === "number";
                      // Skip a bare "Big Book" chip when unconfigured (no count).
                      if (s === "bigbook" && !showCount) {
                        return null;
                      }
                      return (
                        <span
                          key={s}
                          className="inline-flex items-center gap-1.5 rounded-sm border border-[#b38b4d]/55 bg-[#123229]/75 px-2.5 py-1 font-storybook text-[10px] font-semibold uppercase tracking-[0.14em] shadow-[inset_0_1px_0_rgba(240,215,138,0.12)]"
                        >
                          <span className="codex-tag-label">
                            {sourceLabels[s]}
                            {showCount ? <span> ({count})</span> : null}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              <div
                className={`grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 ${
                  loadingMore ? "opacity-70 transition-opacity" : ""
                }`}
              >
                {books.map((book) => (
                  <BookCard key={book.id} book={book} searchQuery={query} />
                ))}
              </div>

              {(hasMore || loadingMore) && (
                <div className="mt-10 flex flex-col items-center gap-3">
                  {loadingMore && (
                    <p
                      className="font-heading text-sm font-medium tracking-wide nav-dragon-gold"
                      aria-live="polite"
                    >
                      Fetching the next page from the archives...
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    disabled={loadingMore || !hasMore}
                    className="btn-primary min-w-[12rem] px-10 py-3.5 text-sm tracking-[0.16em]"
                  >
                    {loadingMore ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        Turning the page...
                      </>
                    ) : (
                      "Load More"
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </FantasyPageShell>
  );
}
