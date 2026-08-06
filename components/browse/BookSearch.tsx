"use client";

import { BestsellersSection } from "@/components/browse/BestsellersSection";
import { BookCard } from "@/components/browse/BookCard";
import { SignupPrompt } from "@/components/auth/SignupPrompt";
import { FantasyPageShell } from "@/components/theme/FantasyPageShell";
import { queryHint, track } from "@/lib/analytics";
import { rankSearchResults } from "@/lib/book-utils";
import { finalizeSearchBooks } from "@/lib/search-finalize";
import { createClient } from "@/lib/supabase";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  alignBooksToRatedSlugs,
  isBookInscribedByUser,
  normalizeExternalBookId,
  type UserRatedIdentity,
} from "@/lib/user-rated-identity";
import type { BookSummary } from "@/types/book";
import { AlertCircle, Loader2, Search } from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type SearchPagePayload = {
  books?: BookSummary[];
  hasMore?: boolean;
  page?: number;
  /** Card ids on this page that match the user's rated works. */
  userRatedSlugs?: string[];
};

const CLIENT_SEARCH_CACHE_TTL_MS = 90_000;
const JUST_RATED_STORAGE_KEY = "lorepath-just-rated-slugs";
const clientSearchCache = new Map<
  string,
  { expires: number; data: SearchPagePayload }
>();

function searchCacheKey(
  searchQuery: string,
  pageNumber: number,
  mode: "text" | "genre"
) {
  return `${mode}|${pageNumber}|${searchQuery.trim().toLowerCase()}`;
}

function mergeSearchResults(
  existing: BookSummary[],
  incoming: BookSummary[],
  query: string
): BookSummary[] {
  // Same cleanup path as the server. Prefer identities already on screen so
  // load-more cannot swap a rated/DB slug for a different provider edition.
  const merged = finalizeSearchBooks([...existing, ...incoming], {
    ratedIds: new Set(existing.map((book) => book.id)),
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

  const effectivelyLoggedIn = isLoggedIn || clientLoggedIn;

  function hasUserRating(book: BookSummary): boolean {
    if (!effectivelyLoggedIn) return false;
    const id = normalizeExternalBookId(book.id);
    if (inscribedCardIds.some((x) => normalizeExternalBookId(x) === id)) {
      return true;
    }
    if (
      ratedIdentities.some(
        (row) => normalizeExternalBookId(row.slug) === id
      )
    ) {
      return true;
    }
    return isBookInscribedByUser(book, ratedIdentities);
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
        data: { user },
      } = await supabase.auth.getUser();

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
        }
      }

      // 2) API fallback with bearer (server service-role path).
      if (next.length === 0) {
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
          } else if (Array.isArray(data.slugs) && data.slugs.length > 0) {
            next = data.slugs.map((slug) => ({
              slug,
              title: slug,
              author: null,
            }));
          }
        }
      }

      // 3) Same-tab ratings just submitted.
      for (const slug of readJustRatedSlugs()) {
        if (!next.some((row) => row.slug === slug)) {
          next.push({ slug, title: slug, author: null });
        }
      }

      if (next.length > 0) {
        setRatedIdentities(next);
        setInscribedCardIds((ids) =>
          Array.from(new Set([...ids, ...next.map((row) => row.slug)]))
        );
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
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      setClientLoggedIn(Boolean(user));
      if (user) {
        await refreshRatedIdentities();
      } else {
        setRatedLoadAttempted(true);
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      const signedIn = Boolean(session?.user);
      setClientLoggedIn(signedIn);
      if (signedIn && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION")) {
        void refreshRatedIdentities();
      }
    });

    function onVisible() {
      if (document.visibilityState === "visible") {
        void refreshRatedIdentities();
      }
    }
    function onPageShow() {
      void refreshRatedIdentities();
    }

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [refreshRatedIdentities]);

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
    const ratedKeys = new Set(
      ratedIdentities.map((row) => normalizeExternalBookId(row.slug))
    );
    const sample = books.slice(0, 5).map((book) => {
      const id = normalizeExternalBookId(book.id);
      const flagged = hasUserRating(book);
      return {
        cardId: book.id,
        slug: book.id,
        hasUserRating: flagged,
        keyInRatedSet: ratedKeys.has(id) || isBookInscribedByUser(book, ratedIdentities),
      };
    });
    console.info("[InscribedDebug] first cards", {
      effectivelyLoggedIn,
      ratedSetSize: ratedIdentities.length,
      ratedSlugsSample: ratedIdentities.slice(0, 8).map((r) => r.slug),
      cards: sample,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot debug when books+ratings ready
  }, [books, ratedIdentities, effectivelyLoggedIn, ratedLoadAttempted]);

  async function fetchSearchPage(
    searchQuery: string,
    pageNumber: number,
    mode: "text" | "genre"
  ) {
    const key = searchCacheKey(searchQuery, pageNumber, mode);
    const cached = clientSearchCache.get(key);
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }

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
    const books = Array.isArray(data.books) ? data.books : [];
    if (
      books.length === 0 &&
      typeof data.error === "string" &&
      data.error.trim()
    ) {
      // Soft empty payload from the API — show a gentle message, not a crash.
      throw new Error(data.error);
    }
    const payload = data as SearchPagePayload;
    // Do not cache empty userRatedSlugs while logged in — cookie/bearer race.
    const canCache =
      !effectivelyLoggedIn ||
      (Array.isArray(payload.userRatedSlugs) &&
        payload.userRatedSlugs.length > 0) ||
      ratedIdentities.length > 0;
    if (canCache) {
      clientSearchCache.set(key, {
        expires: Date.now() + CLIENT_SEARCH_CACHE_TTL_MS,
        data: payload,
      });
    }
    return payload;
  }

  async function runSearch(
    searchQuery: string,
    syncUrl = true,
    mode: "text" | "genre" = "text"
  ) {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;

    const requestId = ++searchRequestIdRef.current;
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    setHasSearched(true);
    setBooks([]);
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
      if (requestId !== searchRequestIdRef.current) return;

      const results = applyRatedAlignment(data.books ?? []);
      setBooks(results);
      setPage(data.page ?? 1);
      setHasMore(Boolean(data.hasMore));
      mergeInscribedCardIds(data.userRatedSlugs);
      track("search_performed", {
        ...queryHint(trimmed),
        mode,
        result_count: results.length,
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

      const incoming = applyRatedAlignment(data.books ?? []);

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

      <div className="relative flex min-h-full flex-col">
        <div
          className={`mx-auto flex w-full max-w-2xl flex-col items-center px-4 sm:px-6 ${
            hasSearched || loading
              ? "pb-6 pt-8 sm:pb-8 sm:pt-16"
              : "flex-1 justify-center pb-12 pt-6 sm:pb-24 sm:pt-10"
          }`}
        >
          <p className="relative mb-5 max-w-xl px-1 text-center text-base leading-relaxed sm:mb-8 sm:text-xl md:text-[1.35rem]">
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
            className="parchment-plaque mx-auto w-full max-w-3xl px-3 py-3 sm:px-5 sm:py-3.5"
          >
            <div className="relative flex flex-col items-stretch gap-2.5 sm:flex-row sm:items-center sm:gap-3">
              <Search className="pointer-events-none absolute left-3.5 top-3.5 z-10 h-5 w-5 text-[#a67c2d] sm:left-6 sm:top-1/2 sm:-translate-y-1/2" />

              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                // Search runs only on form submit — never on each keystroke
                placeholder="Search by title, author, or ISBN..."
                autoComplete="off"
                className="min-h-[2.75rem] flex-1 bg-transparent py-3 pl-11 pr-3 text-base placeholder:text-[#4a2f0f] placeholder:opacity-75 focus:outline-none sm:pl-14 sm:pr-4 sm:text-[17px]"
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
                className="btn-primary min-h-[2.75rem] w-full px-8 py-3 text-sm tracking-[0.14em] sm:w-auto"
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

          {!effectivelyLoggedIn ? (
            <SignupPrompt
              variant="inline"
              redirectTo="/browse"
              className="mt-4 max-w-xl sm:mt-5"
            />
          ) : null}
        </div>

        <div className="mx-auto w-full max-w-5xl px-4 pb-12 sm:px-6 sm:pb-16">
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
            <div className="alert-error mb-8 backdrop-blur-sm">
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
                Nothing with a clear description matched &ldquo;{query}&rdquo;.
                Try another title, author name, or ISBN — the archives are
                vast.
              </p>
              <p className="mt-4 font-heading text-sm text-[#5c3f0f]/80">
                Tip: shorter keywords often open more doors.
              </p>
            </div>
          ) : books.length > 0 ? (
            <>
              <div className="mb-6">
                <p className="font-storybook text-sm font-semibold tracking-[0.12em] nav-dragon-gold sm:text-[15px]">
                  {books.length} result{books.length !== 1 ? "s" : ""} for
                  &ldquo;{query}&rdquo;
                </p>
              </div>

              <div
                className={`grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 ${
                  loadingMore ? "opacity-70 transition-opacity" : ""
                }`}
              >
                {books.map((book) => (
                  <BookCard
                    key={book.id}
                    book={book}
                    searchQuery={query}
                    hasUserRating={hasUserRating(book)}
                  />
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
          ) : null}
        </div>
      </div>
    </FantasyPageShell>
  );
}
