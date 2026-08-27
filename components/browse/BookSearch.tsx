"use client";

import { BestsellersSection } from "@/components/browse/BestsellersSection";
import { BookCard } from "@/components/browse/BookCard";
import { SignupPrompt } from "@/components/auth/SignupPrompt";
import { FantasyPageShell } from "@/components/theme/FantasyPageShell";
import { queryHint, track } from "@/lib/analytics";
import { bookMatchesSearchQuery, rankSearchResults } from "@/lib/book-utils";
import { finalizeSearchBooks } from "@/lib/search-finalize";
import { createClient } from "@/lib/supabase";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  alignBooksToRatedSlugs,
  createRatedBookLookup,
  ratedBookKey,
  type UserRatedIdentity,
} from "@/lib/user-rated-identity";
import type { BookSummary } from "@/types/book";
import { AlertCircle, Loader2, Search } from "lucide-react";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

type SearchPagePayload = {
  books?: BookSummary[];
  hasMore?: boolean;
  page?: number;
  /** Echo of the q that produced this payload — reject stale cache hits. */
  query?: string;
  /** Card ids on this page that match the user's rated works. */
  userRatedSlugs?: string[];
};

/** Where the rated set came from — surfaced in the temporary debug log. */
type RatedSource =
  | "ssr"
  | "browser-query"
  | "api"
  | "session-storage"
  | "none";

const JUST_RATED_STORAGE_KEY = "lorepath-just-rated-slugs";

function mergeSearchResults(
  existing: BookSummary[],
  incoming: BookSummary[],
  query: string
): BookSummary[] {
  // Same cleanup path as the server. Prefer identities already on screen so
  // load-more cannot swap a rated/DB slug for a different provider edition.
  const merged = finalizeSearchBooks([...existing, ...incoming], {
    ratedIds: new Set(existing.map((book) => book.id)),
    // Keep exact-title matches that are already on screen from disappearing
    // when a later page brings in records with richer metadata.
    query: query.trim() || undefined,
    debug: false,
  });
  return query.trim() ? rankSearchResults(merged, query) : merged;
}

function readJustRatedSlugs(): string[] {
  try {
    const raw = sessionStorage.getItem(JUST_RATED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

type BookSearchProps = {
  initialQuery?: string;
  /** "genre" = subject/topic search from a tag click. */
  initialMode?: "text" | "genre";
  /** Prefetched NYT lists — display-only; does not affect search. */
  bestsellers?: BookSummary[];
  bestsellersError?: string | null;
  /** SSR hint — may be false even when the browser session is logged in. */
  isLoggedIn?: boolean;
  /**
   * Works the logged-in user has already rated (slug + title/author).
   * Empty for logged-out users. Slug is the rating identity; title/author
   * match search cards that use a different provider id for the same work.
   */
  initialRatedIdentities?: UserRatedIdentity[];
};

export function BookSearch({
  initialQuery = "",
  initialMode = "text",
  bestsellers = [],
  bestsellersError = null,
  isLoggedIn = false,
  initialRatedIdentities = [],
}: BookSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [searchMode, setSearchMode] = useState<"text" | "genre">(initialMode);
  const [books, setBooks] = useState<BookSummary[]>([]);
  /** Query that produced `books` — heading/empty state must not use live input. */
  const [resultsQuery, setResultsQuery] = useState(initialQuery);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  /** Client auth — Navbar uses the browser session; SSR isLoggedIn can miss it. */
  const [clientLoggedIn, setClientLoggedIn] = useState(isLoggedIn);
  const [ratedIdentities, setRatedIdentities] = useState<UserRatedIdentity[]>(
    initialRatedIdentities
  );
  /** Extra card ids from search payload (already work-matched server-side). */
  const [inscribedCardIds, setInscribedCardIds] = useState<string[]>([]);
  const initialSearchDone = useRef(false);
  const searchModeRef = useRef<"text" | "genre">(initialMode);
  const abortRef = useRef<AbortController | null>(null);
  /** Bumps on each new search/load-more so superseded requests cannot clear loading. */
  const searchRequestIdRef = useRef(0);
  const ratedDebugLoggedRef = useRef(false);
  /** True after the first client rated-identity load attempt finishes. */
  const [ratedLoadAttempted, setRatedLoadAttempted] = useState(
    initialRatedIdentities.length > 0
  );
  const [ratedSource, setRatedSource] = useState<RatedSource>(
    initialRatedIdentities.length > 0 ? "ssr" : "none"
  );

  const effectivelyLoggedIn = isLoggedIn || clientLoggedIn;

  /**
   * One lookup for every Inscribed decision. Rated identities carry the saved
   * `books.slug`; server-matched card ids are slug-only entries.
   */
  const ratedLookup = useMemo(
    () =>
      createRatedBookLookup([
        ...ratedIdentities,
        ...inscribedCardIds
          .filter(
            (id) => id && !ratedIdentities.some((row) => row.slug === id)
          )
          .map((id) => ({ slug: id, title: "", author: null })),
      ]),
    [ratedIdentities, inscribedCardIds]
  );

  function hasUserRating(book: BookSummary): boolean {
    if (!effectivelyLoggedIn) return false;
    return ratedLookup.has(book);
  }

  function mergeInscribedCardIds(extra: string[] | undefined) {
    if (!extra?.length) return;
    setInscribedCardIds((current) => {
      const next = new Set(current);
      let changed = false;
      for (const id of extra) {
        if (!id || next.has(id)) continue;
        next.add(id);
        changed = true;
      }
      return changed ? Array.from(next) : current;
    });
  }

  function applyRatedAlignment(list: BookSummary[]): BookSummary[] {
    if (ratedIdentities.length === 0) return list;
    return alignBooksToRatedSlugs(list, ratedIdentities);
  }

  /**
   * Primary path: read ratings with the browser Supabase session (same as AuthNav).
   * API / cookie SSR often miss the session on Netlify; this does not.
   */
  const refreshRatedIdentities = useCallback(async () => {
    if (!isSupabaseConfigured()) return;

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user ?? null;

      if (!user) {
        setClientLoggedIn(false);
        // Keep SSR identities if present; only clear when we know logged out
        // and SSR also had none.
        if (initialRatedIdentities.length === 0) {
          setRatedIdentities([]);
          setInscribedCardIds([]);
        }
        return;
      }

      setClientLoggedIn(true);

      // 1) Direct browser query (ratings are readable; filter by this user).
      const { data: ratingRows, error: ratingError } = await supabase
        .from("ratings")
        .select("book_id")
        .eq("rated_by", user.id);

      let next: UserRatedIdentity[] = [];
      let source: RatedSource = "none";

      if (!ratingError && ratingRows && ratingRows.length > 0) {
        const bookIds = Array.from(
          new Set(
            ratingRows
              .map((row) =>
                typeof row.book_id === "string" ? row.book_id : null
              )
              .filter((id): id is string => Boolean(id))
          )
        );

        if (bookIds.length > 0) {
          const { data: bookRows } = await supabase
            .from("books")
            .select("slug, title, author")
            .in("id", bookIds);

          for (const book of bookRows ?? []) {
            const slug =
              typeof book.slug === "string" ? book.slug.trim() : "";
            const title =
              typeof book.title === "string" ? book.title.trim() : "";
            if (!slug || !title) continue;
            if (next.some((row) => row.slug === slug)) continue;
            next.push({
              slug,
              title,
              author:
                typeof book.author === "string"
                  ? book.author.trim() || null
                  : null,
            });
          }
          if (next.length > 0) source = "browser-query";
        }
      }

      // 2) API fallback only when the browser query itself failed.
      if (ratingError) {
        const headers: Record<string, string> = {};
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.access_token) {
          headers.Authorization = `Bearer ${session.access_token}`;
        }
        const response = await fetch("/api/me/rated-slugs", {
          credentials: "same-origin",
          cache: "no-store",
          headers,
        });
        if (response.ok) {
          const data = (await response.json()) as {
            identities?: UserRatedIdentity[];
            slugs?: string[];
          };
          if (Array.isArray(data.identities) && data.identities.length > 0) {
            next = data.identities;
            source = "api";
          } else if (Array.isArray(data.slugs) && data.slugs.length > 0) {
            next = data.slugs.map((slug) => ({
              slug,
              title: "",
              author: null,
            }));
            source = "api";
          }
        }
      }

      // 3) Same-tab ratings just submitted.
      for (const slug of readJustRatedSlugs()) {
        if (!next.some((row) => row.slug === slug)) {
          next.push({ slug, title: "", author: null });
          if (source === "none") source = "session-storage";
        }
      }

      if (next.length > 0) {
        setRatedIdentities(next);
        setRatedSource(source);
        setInscribedCardIds((ids) =>
          Array.from(new Set([...ids, ...next.map((row) => row.slug)]))
        );
      } else {
        setRatedSource("none");
      }
    } catch {
      // Keep SSR / last-known identities.
    } finally {
      setRatedLoadAttempted(true);
    }
  }, [initialRatedIdentities.length]);

  // Detect browser session + load rated works (do not gate on SSR isLoggedIn).
  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setRatedLoadAttempted(true);
      return;
    }

    let cancelled = false;
    const supabase = createClient();

    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      const user = session?.user ?? null;
      setClientLoggedIn(Boolean(user));
      if (user && initialRatedIdentities.length === 0) {
        await refreshRatedIdentities();
      } else {
        if (user) mergeJustRatedFromStorage();
        setRatedLoadAttempted(true);
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      const signedIn = Boolean(session?.user);
      setClientLoggedIn(signedIn);
      if (signedIn && event === "SIGNED_IN") {
        void refreshRatedIdentities();
      }
    });

    function mergeJustRatedFromStorage() {
      const slugs = readJustRatedSlugs();
      if (slugs.length === 0) return;
      setRatedIdentities((current) => {
        let changed = false;
        const next = [...current];
        for (const slug of slugs) {
          if (!next.some((row) => row.slug === slug)) {
            next.push({ slug, title: "", author: null });
            changed = true;
          }
        }
        return changed ? next : current;
      });
      setInscribedCardIds((ids) =>
        Array.from(new Set([...ids, ...slugs]))
      );
    }

    function onVisible() {
      if (document.visibilityState === "visible") {
        mergeJustRatedFromStorage();
      }
    }
    function onPageShow() {
      mergeJustRatedFromStorage();
    }

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [refreshRatedIdentities, initialRatedIdentities.length]);

  // Keep in sync if the server re-renders with a newer identity list.
  useEffect(() => {
    if (initialRatedIdentities.length > 0) {
      setRatedIdentities((current) =>
        current.length >= initialRatedIdentities.length
          ? current
          : initialRatedIdentities
      );
    }
  }, [initialRatedIdentities]);

  // Re-align visible cards when identities arrive/update.
  useEffect(() => {
    if (ratedIdentities.length === 0) return;
    setBooks((current) => {
      if (current.length === 0) return current;
      const next = alignBooksToRatedSlugs(current, ratedIdentities);
      const changed = next.some(
        (book, index) => book.id !== current[index]?.id
      );
      return changed ? next : current;
    });
    setInscribedCardIds((ids) =>
      Array.from(
        new Set([...ids, ...ratedIdentities.map((row) => row.slug)])
      )
    );
  }, [ratedIdentities]);

  // Temporary verification: first 5 search cards + rated-set membership.
  useEffect(() => {
    if (ratedDebugLoggedRef.current) return;
    if (books.length === 0) return;
    if (!ratedLoadAttempted && ratedIdentities.length === 0) return;
    if (!effectivelyLoggedIn && ratedIdentities.length === 0) return;

    const allowLog =
      process.env.NODE_ENV !== "production" ||
      (typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("debugInscribed") ===
          "1");
    if (!allowLog) return;

    ratedDebugLoggedRef.current = true;
    const sample = books.slice(0, 5).map((book) => ({
      cardKey: book.id,
      cardWorkKey: ratedBookKey(book),
      hasUserRating: hasUserRating(book),
      matchedRatedKey: ratedLookup.keyFor(book),
    }));
    console.info("[InscribedDebug] first cards", {
      effectivelyLoggedIn,
      ratedSource,
      ratedSetSize: ratedLookup.size,
      ratedKeys: Array.from(ratedLookup.slugs).slice(0, 8),
      ratedWorkKeys: Array.from(ratedLookup.workKeys).slice(0, 8),
      cards: sample,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot debug when books+ratings ready
  }, [books, ratedIdentities, effectivelyLoggedIn, ratedLoadAttempted]);

  async function fetchSearchPage(
    searchQuery: string,
    pageNumber: number,
    mode: "text" | "genre"
  ) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const params = new URLSearchParams({
      q: searchQuery,
      page: String(pageNumber),
    });
    if (mode === "genre") {
      params.set("mode", "genre");
    }

    const headers: Record<string, string> = {};
    if (isSupabaseConfigured()) {
      try {
        const {
          data: { session },
        } = await createClient().auth.getSession();
        if (session?.access_token) {
          headers.Authorization = `Bearer ${session.access_token}`;
        }
      } catch {
        // Search still works without bearer; Inscribed falls back to client set.
      }
    }

    const response = await fetch(`/api/books/search?${params.toString()}`, {
      signal: controller.signal,
      credentials: "same-origin",
      headers,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "Search failed.");
    }
    const echoed =
      typeof data.query === "string" ? data.query.trim().toLowerCase() : "";
    if (echoed && echoed !== searchQuery.trim().toLowerCase()) {
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
    const books = Array.isArray(data.books) ? data.books : [];
    if (
      books.length === 0 &&
      typeof data.error === "string" &&
      data.error.trim()
    ) {
      // Soft empty payload from the API — show a gentle message, not leftover cards.
      throw new Error(data.error);
    }
    return data as SearchPagePayload;
  }

  async function runSearch(
    searchQuery: string,
    syncUrl = true,
    mode: "text" | "genre" = "text"
  ) {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;

    const requestId = ++searchRequestIdRef.current;
    setBooks([]);
    setPage(1);
    setHasMore(false);
    setResultsQuery(trimmed);
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    setHasSearched(true);
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
      if (requestId !== searchRequestIdRef.current) return;

      const incoming = applyRatedAlignment(data.books ?? []);
      const matched = incoming.filter((book) =>
        bookMatchesSearchQuery(book, trimmed)
      );
      setBooks(matched);
      setResultsQuery(trimmed);
      setPage(data.page ?? 1);
      setHasMore(Boolean(data.hasMore));
      mergeInscribedCardIds(data.userRatedSlugs);
      track("search_performed", {
        ...queryHint(trimmed),
        mode,
        result_count: matched.length,
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
    const trimmed = query.trim();
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

      const incoming = applyRatedAlignment(data.books ?? []).filter((book) =>
        bookMatchesSearchQuery(book, trimmed)
      );

      setBooks((current) => mergeSearchResults(current, incoming, trimmed));
      setPage(data.page ?? nextPage);
      setHasMore(Boolean(data.hasMore));
      mergeInscribedCardIds(data.userRatedSlugs);
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
      <div className="relative flex min-h-full flex-col pb-[env(safe-area-inset-bottom,0px)]">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 pb-5 pt-6 sm:px-6 sm:pb-6 sm:pt-8">
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

          {!effectivelyLoggedIn ? (
            <SignupPrompt
              variant="inline"
              redirectTo="/browse"
              description="Save your marks with a free account."
              showGoodreadsHint={false}
              className="mt-2.5 max-w-xl"
            />
          ) : null}
        </div>

        <div className="mx-auto w-full max-w-6xl px-4 pb-[max(3rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-16">
          {!hasSearched && !loading && (
            <BestsellersSection
              books={bestsellers}
              error={bestsellersError}
              isBookInscribed={
                effectivelyLoggedIn ? hasUserRating : undefined
              }
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
                    hasUserRating={hasUserRating(book)}
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
