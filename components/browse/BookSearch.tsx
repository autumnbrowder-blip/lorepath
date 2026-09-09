"use client";

import { BestsellersSection } from "@/components/browse/BestsellersSection";
import { BookCard } from "@/components/browse/BookCard";
import { SignupPrompt } from "@/components/auth/SignupPrompt";
import { FantasyPageShell } from "@/components/theme/FantasyPageShell";
import { queryHint, track } from "@/lib/analytics";
import {
  bookMatchesSearchQuery,
  dropBrowseJunk,
  isTitleOnlyStub,
  rankBrowseSearchResults,
  repairSearchQuery,
} from "@/lib/book-utils";
import { finalizeSearchBooks } from "@/lib/search-finalize";
import type { BookSummary } from "@/types/book";
import { AlertCircle, Loader2, Search } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type SearchPagePayload = {
  books?: BookSummary[];
  hasMore?: boolean;
  page?: number;
  /** Echo of the q that produced this payload — reject stale cache hits. */
  query?: string;
};

function mergeSearchResults(
  existing: BookSummary[],
  incoming: BookSummary[],
  query: string
): BookSummary[] {
  // Same title+author key as the server (getBookDedupeKey). Prefer identities
  // already on screen so load-more cannot add a second Frank Herbert Dune.
  const merged = finalizeSearchBooks([...existing, ...incoming], {
    ratedIds: new Set(existing.map((book) => book.id)),
    // Keep exact-title matches that are already on screen from disappearing
    // when a later page brings in records with richer metadata.
    query: query.trim() || undefined,
    debug: false,
  });
  const cleaned = dropBrowseJunk(merged).filter((book) => !isTitleOnlyStub(book));
  return query.trim() ? rankBrowseSearchResults(cleaned, query) : cleaned;
}

type BookSearchProps = {
  initialQuery?: string;
  /** "genre" = subject/topic search from a tag click. */
  initialMode?: "text" | "genre";
  /** Prefetched NYT lists — display-only; does not affect search. */
  bestsellers?: BookSummary[];
  bestsellersError?: string | null;
  /** SSR auth hint for the signup prompt only — never loads ratings. */
  isLoggedIn?: boolean;
};

export function BookSearch({
  initialQuery = "",
  initialMode = "text",
  bestsellers = [],
  bestsellersError = null,
  isLoggedIn = false,
}: BookSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [books, setBooks] = useState<BookSummary[]>([]);
  /** Query that produced `books` — heading/empty state must not use live input. */
  const [resultsQuery, setResultsQuery] = useState(initialQuery);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const initialSearchDone = useRef(false);
  const lastUrlSearchRef = useRef("");
  const searchModeRef = useRef<"text" | "genre">(initialMode);
  const abortRef = useRef<AbortController | null>(null);
  /** Bumps on each new search/load-more so superseded requests cannot clear loading. */
  const searchRequestIdRef = useRef(0);

  async function fetchSearchPage(
    searchQuery: string,
    pageNumber: number,
    mode: "text" | "genre"
  ) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const params = new URLSearchParams({
      q: repairSearchQuery(searchQuery),
      page: String(pageNumber),
    });
    if (mode === "genre") {
      params.set("mode", "genre");
    }

    const response = await fetch(`/api/books/search?${params.toString()}`, {
      signal: controller.signal,
      credentials: "same-origin",
      cache: "no-store",
    });
    const data = await response.json();
    const books = Array.isArray(data.books)
      ? data.books.map((book: BookSummary) => ({ ...book }))
      : [];
    if (!response.ok && books.length === 0) {
      throw new Error(data.error ?? "Search failed.");
    }
    const echoed =
      typeof data.query === "string" ? data.query.trim().toLowerCase() : "";
    const requested = repairSearchQuery(searchQuery).toLowerCase();
    if (echoed && echoed !== requested && repairSearchQuery(echoed).toLowerCase() !== requested) {
      console.warn("[BookSearch] dropping mismatched search payload", {
        requested: searchQuery,
        echoed: data.query,
      });
      return {
        books: [],
        hasMore: false,
        page: pageNumber,
        query: searchQuery,
      } satisfies SearchPagePayload;
    }
    if (
      books.length === 0 &&
      typeof data.error === "string" &&
      data.error.trim()
    ) {
      // Soft empty payload from the API — show a gentle message, not leftover cards.
      throw new Error(data.error);
    }
    return {
      ...(data as SearchPagePayload),
      books,
      query: searchQuery,
    } satisfies SearchPagePayload;
  }

  async function runSearch(
    searchQuery: string,
    syncUrl = true,
    mode: "text" | "genre" = "text"
  ) {
    const trimmed = repairSearchQuery(searchQuery);
    if (!trimmed) return;

    const requestId = ++searchRequestIdRef.current;
    lastUrlSearchRef.current = `${mode}:${trimmed}`;
    setBooks([]);
    setPage(1);
    setHasMore(false);
    setResultsQuery(trimmed);
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    setHasSearched(true);
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
      if (requestId !== searchRequestIdRef.current) return;

      const incoming = (data.books ?? [])
        .filter((book: BookSummary) => !isTitleOnlyStub(book))
        .filter((book: BookSummary) => bookMatchesSearchQuery(book, trimmed));

      setBooks(incoming);
      setResultsQuery(trimmed);
      setPage(data.page ?? 1);
      setHasMore(Boolean(data.hasMore));
      track("search_performed", {
        ...queryHint(trimmed),
        mode,
        result_count: incoming.length,
        has_more: Boolean(data.hasMore),
      });
    } catch (err) {
      const aborted =
        (err instanceof DOMException && err.name === "AbortError") ||
        (err instanceof Error && err.name === "AbortError");
      if (aborted) return;
      if (requestId !== searchRequestIdRef.current) return;
      setBooks([]);
      setHasMore(false);
      setError(
        err instanceof Error ? err.message : "Something went wrong. Try again."
      );
    } finally {
      // Only the latest in-flight search may leave the loading state.
      if (requestId === searchRequestIdRef.current) {
        setLoading(false);
      }
    }
  }

  async function handleLoadMore() {
    const trimmed = repairSearchQuery(resultsQuery);
    if (!trimmed || loadingMore || loading || !hasMore) return;

    const nextPage = page + 1;
    const requestId = ++searchRequestIdRef.current;
    setLoadingMore(true);
    setError(null);

    try {
      const data = await fetchSearchPage(
        trimmed,
        nextPage,
        searchModeRef.current
      );
      if (requestId !== searchRequestIdRef.current) return;

      const incoming = (data.books ?? [])
        .filter((book: BookSummary) => !isTitleOnlyStub(book))
        .filter((book: BookSummary) => bookMatchesSearchQuery(book, trimmed));

      setBooks((current) => mergeSearchResults(current, incoming, trimmed));
      setPage(data.page ?? nextPage);
      setHasMore(Boolean(data.hasMore));
    } catch (err) {
      const aborted =
        (err instanceof DOMException && err.name === "AbortError") ||
        (err instanceof Error && err.name === "AbortError");
      if (aborted) return;
      if (requestId !== searchRequestIdRef.current) return;
      setError(
        err instanceof Error
          ? err.message
          : "Could not load more books. Try again."
      );
    } finally {
      if (requestId === searchRequestIdRef.current) {
        setLoadingMore(false);
      }
    }
  }

  useEffect(() => {
    track("view_browse");
  }, []);

  useEffect(() => {
    const next = initialQuery.trim();
    const key = `${initialMode}:${next}`;
    if (!next) return;
    if (initialSearchDone.current && lastUrlSearchRef.current === key) return;
    lastUrlSearchRef.current = key;
    initialSearchDone.current = true;
    setQuery(next);
    void runSearch(next, false, initialMode);
  }, [initialQuery, initialMode]);

  async function handleSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Typing in the search box is always a normal title/author search
    await runSearch(query, true, "text");
  }

  return (
    <FantasyPageShell variant="browse" priority>
      <div className="browse-page-wrap relative flex min-h-full flex-col pb-[env(safe-area-inset-bottom,0px)]">
        <div className="browse-page-pad mx-auto flex w-full max-w-6xl flex-col items-center px-4 pb-5 pt-6 sm:px-6 sm:pb-6 sm:pt-8">
          <form
            onSubmit={handleSearch}
            className="browse-search-row"
          >
            <div className="browse-search-scroll">
              <Search
                className="browse-search-icon"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                // Search runs only on form submit — never on each keystroke
                placeholder="Search by title, author, or ISBN…"
                autoComplete="off"
                className="browse-search-ink"
              />
            </div>
            <button
              type="submit"
              disabled={loading || loadingMore || !query.trim()}
              className="browse-search-submit"
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
          </form>

          {!isLoggedIn ? (
            <SignupPrompt
              variant="inline"
              redirectTo="/browse"
              description="Save your marks with a free account."
              showGoodreadsHint={false}
              className="mt-2.5 max-w-xl"
            />
          ) : null}
        </div>

        <div className="browse-page-pad mx-auto w-full max-w-6xl px-4 pb-[max(3rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-16">
          {!hasSearched && !loading && (
            <BestsellersSection
              books={bestsellers}
              error={bestsellersError}
            />
          )}

          {error && (
            <div className="alert-error mb-8">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {loading ? (
            <div
              className="parchment-plaque mx-auto flex max-w-lg flex-col items-center justify-center px-6 py-12 text-center"
              aria-live="polite"
              aria-busy="true"
            >
              <Loader2 className="mb-4 h-9 w-9 animate-spin text-[#8c6b2e]" />
              <p className="font-storybook text-lg font-semibold tracking-[0.08em] text-[#2f1f0f]">
                Searching the archives...
              </p>
              <p className="mt-2 font-heading text-base text-[#4a2f0f]/85">
                Unrolling scrolls across the shared shelves.
              </p>
            </div>
          ) : hasSearched && books.length === 0 && !error ? (
            <div className="parchment-plaque mx-auto max-w-xl px-6 py-12 text-center">
              <Search className="mx-auto mb-4 h-8 w-8 text-[#a67c2d]" />
              <p className="font-storybook text-xl font-semibold tracking-[0.06em] text-[#2f1f0f]">
                No tomes on this shelf
              </p>
              <p className="mt-3 font-heading text-lg leading-relaxed text-[#3f2a1e]/90">
                Nothing with a clear description matched &ldquo;{resultsQuery}&rdquo;.
                Try another title, author name, or ISBN — the archives are
                vast.
              </p>
              <p className="mt-4 font-heading text-sm text-[#5c3f0f]/80">
                Tip: shorter keywords often open more doors.
              </p>
            </div>
          ) : books.length > 0 ? (
            <>
              <div className="mb-5">
                <p className="text-center font-heading text-base font-medium tracking-[0.04em] text-[#d4b36a] sm:text-lg">
                  {books.length} result{books.length !== 1 ? "s" : ""} for
                  &ldquo;{resultsQuery}&rdquo;
                </p>
              </div>

              <div
                className={`tome-card-grid ${
                  loadingMore ? "opacity-70" : ""
                }`}
              >
                {books.map((book, index) => (
                  <BookCard
                    key={book.id}
                    book={book}
                    searchQuery={resultsQuery}
                    priority={index < 3}
                  />
                ))}
              </div>

              {(hasMore || loadingMore) && (
                <div className="mt-10 flex flex-col items-center gap-3">
                  {loadingMore && (
                    <p
                      className="font-heading text-sm font-medium tracking-wide text-[#d4b36a]"
                      aria-live="polite"
                    >
                      Fetching the next page from the archives...
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    disabled={loadingMore || !hasMore}
                    className="parchment-search-btn min-w-[12rem] px-10"
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
          ) : null}
        </div>
      </div>
    </FantasyPageShell>
  );
}
