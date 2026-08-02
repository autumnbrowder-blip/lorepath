"use client";

import { BookCover } from "@/components/books/BookCover";
import type {
  MatchedImportBook,
  UnmatchedImportBook,
} from "@/lib/goodreads-import";
import type { BookSummary } from "@/types/book";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Feather,
  Loader2,
  ScrollText,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "lorepath.goodreads-import.v1";
const INITIAL_VISIBLE = 50;

type ImportStats = {
  csvRows: number;
  candidates: number;
  matched: number;
  unmatched: number;
  alreadyRated: number;
  preferredReadShelf: boolean;
  capped: boolean;
};

type StoredImport = {
  matched: MatchedImportBook[];
  unmatched: UnmatchedImportBook[];
  stats: ImportStats;
  savedAt: number;
};

type GoodreadsImportProps = {
  ratedSlugs: string[];
};

function bookHref(bookId: string) {
  return `/books/${encodeURIComponent(bookId)}?from=import`;
}

function toBookSummary(book: BookSummary): BookSummary {
  return book;
}

export function GoodreadsImport({ ratedSlugs }: GoodreadsImportProps) {
  const ratedSet = useMemo(() => new Set(ratedSlugs), [ratedSlugs]);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matched, setMatched] = useState<MatchedImportBook[]>([]);
  const [unmatched, setUnmatched] = useState<UnmatchedImportBook[]>([]);
  const [stats, setStats] = useState<ImportStats | null>(null);
  const [showUnmatched, setShowUnmatched] = useState(false);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [restored, setRestored] = useState(false);

  const persist = useCallback(
    (payload: {
      matched: MatchedImportBook[];
      unmatched: UnmatchedImportBook[];
      stats: ImportStats;
    }) => {
      try {
        const stored: StoredImport = { ...payload, savedAt: Date.now() };
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
      } catch {
        // sessionStorage full / unavailable — in-memory only
      }
    },
    []
  );

  // Restore last in-session import after returning from a book page.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setRestored(true);
        return;
      }
      const stored = JSON.parse(raw) as StoredImport;
      if (!stored?.matched || !Array.isArray(stored.matched)) {
        setRestored(true);
        return;
      }
      const refreshed = stored.matched.map((item) => ({
        ...item,
        alreadyRated: item.alreadyRated || ratedSet.has(item.book.id),
      }));
      refreshed.sort((a, b) => Number(a.alreadyRated) - Number(b.alreadyRated));
      setMatched(refreshed);
      setUnmatched(stored.unmatched ?? []);
      setStats(stored.stats ?? null);
      persist({
        matched: refreshed,
        unmatched: stored.unmatched ?? [],
        stats: stored.stats,
      });
    } catch {
      // ignore corrupt storage
    } finally {
      setRestored(true);
    }
  }, [ratedSet, persist]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || loading) return;

    setLoading(true);
    setError(null);

    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/import/goodreads", {
        method: "POST",
        body,
      });
      const data = (await response.json()) as {
        error?: string;
        matched?: MatchedImportBook[];
        unmatched?: UnmatchedImportBook[];
        stats?: ImportStats;
      };

      if (!response.ok) {
        throw new Error(
          data.error ?? "The archives couldn’t open that scroll."
        );
      }

      const nextMatched = (data.matched ?? []).map((item) => ({
        ...item,
        alreadyRated: item.alreadyRated || ratedSet.has(item.book.id),
      }));
      const nextUnmatched = data.unmatched ?? [];
      const nextStats = data.stats ?? null;

      setMatched(nextMatched);
      setUnmatched(nextUnmatched);
      setStats(nextStats);
      setVisibleCount(INITIAL_VISIBLE);
      setShowUnmatched(false);

      if (nextStats) {
        persist({
          matched: nextMatched,
          unmatched: nextUnmatched,
          stats: nextStats,
        });
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went awry in the archives. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  function clearResults() {
    setMatched([]);
    setUnmatched([]);
    setStats(null);
    setFile(null);
    setError(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  const readyToRate = matched.filter((m) => !m.alreadyRated);
  const alreadyMarked = matched.filter((m) => m.alreadyRated);
  const visibleReady = readyToRate.slice(0, visibleCount);
  const hasMore = readyToRate.length > visibleCount;

  if (!restored) {
    return (
      <div className="flex flex-col items-center py-12">
        <Loader2 className="mb-3 h-8 w-8 animate-spin text-gold-500" />
        <p className="font-heading text-sm nav-dragon-gold">
          Opening the import desk...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <form
        onSubmit={handleSubmit}
        className="parchment-panel space-y-5 px-5 py-6 sm:px-8 sm:py-8"
      >
        <div className="flex items-start gap-3">
          <ScrollText className="mt-0.5 h-6 w-6 shrink-0 text-[#a67c2d]" />
          <div>
            <h2 className="font-storybook text-lg font-bold tracking-[0.08em] text-[#2f1f0f] sm:text-xl">
              Import books you&apos;ve read
            </h2>
            <p className="mt-2 font-heading text-sm leading-relaxed text-[#3f2a1e] sm:text-base">
              Bring a Goodreads library export into LorePath. We&apos;ll match
              titles to our shelves so you can leave marks quickly — nothing is
              rated automatically.
            </p>
          </div>
        </div>

        <ol className="space-y-3 font-heading text-sm leading-relaxed text-[#2a1a0c] sm:text-[15px]">
          <li className="flex gap-2.5">
            <span className="font-storybook text-xs font-bold tracking-[0.12em] text-[#a67c2d]">
              1
            </span>
            <span>
              On Goodreads, open{" "}
              <span className="font-semibold">My Books → Import and export</span>{" "}
              and download your library CSV.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="font-storybook text-xs font-bold tracking-[0.12em] text-[#a67c2d]">
              2
            </span>
            <span>Upload that CSV here. We prefer books on your Read shelf.</span>
          </li>
        </ol>

        <label className="flex cursor-pointer flex-col items-center gap-3 rounded-sm border-2 border-dashed border-[#8c6b2e]/70 bg-[#f7f0dc]/55 px-4 py-8 text-center transition hover:border-[#a67c2d] hover:bg-[#f7f0dc]/8">
          <Upload className="h-7 w-7 text-[#a67c2d]" aria-hidden="true" />
          <span className="font-storybook text-xs font-semibold uppercase tracking-[0.16em] text-[#5c3f0f]">
            {file ? file.name : "Choose Goodreads CSV"}
          </span>
          <span className="font-heading text-xs text-[#5c3f0f]/80">
            .csv only · under 2 MB
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => {
              const next = e.target.files?.[0] ?? null;
              setFile(next);
              setError(null);
            }}
          />
        </label>

        {error ? (
          <div className="alert-error" role="alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={!file || loading}
            className="btn-primary justify-center px-6 py-3 text-sm tracking-[0.14em]"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Matching your shelves...
              </>
            ) : (
              <>
                <Feather className="h-4 w-4" aria-hidden="true" />
                Match my books
              </>
            )}
          </button>
          {matched.length > 0 || unmatched.length > 0 ? (
            <button
              type="button"
              onClick={clearResults}
              className="btn-secondary"
            >
              Clear results
            </button>
          ) : null}
        </div>

        {loading ? (
          <p className="font-heading text-sm leading-relaxed text-[#3f2a1e]/90">
            Searching the archives — this may take a quiet moment for longer
            lists.
          </p>
        ) : null}
      </form>

      {stats ? (
        <p className="text-center font-heading text-sm leading-relaxed nav-dragon-gold sm:text-left">
          {stats.matched === 0
            ? "No matching tomes turned up in our shelves yet."
            : `Matched ${stats.matched} tome${stats.matched === 1 ? "" : "s"} from your export${
                stats.alreadyRated
                  ? ` · ${stats.alreadyRated} already marked`
                  : ""
              }.`}
          {stats.capped
            ? " Showing your first batch of reads — re-export a shorter list if you need more."
            : null}
          {!stats.preferredReadShelf
            ? " We didn’t spot a Read shelf, so we included books more broadly."
            : null}
        </p>
      ) : null}

      {readyToRate.length > 0 ? (
        <section aria-labelledby="matched-ready-heading">
          <h2
            id="matched-ready-heading"
            className="mb-3 font-storybook text-base font-bold tracking-[0.1em] nav-dragon-gold sm:text-lg"
          >
            Books you&apos;ve read — ready to mark
          </h2>
          <ul className="space-y-3">
            {visibleReady.map((item) => (
              <li key={`${item.book.id}-${item.csvTitle}`}>
                <ImportBookCard item={item} />
              </li>
            ))}
          </ul>
          {hasMore ? (
            <button
              type="button"
              onClick={() => setVisibleCount((n) => n + 50)}
              className="btn-secondary mt-4"
            >
              Show more
            </button>
          ) : null}
        </section>
      ) : null}

      {alreadyMarked.length > 0 ? (
        <section aria-labelledby="already-marked-heading">
          <h2
            id="already-marked-heading"
            className="mb-3 font-storybook text-sm font-semibold tracking-[0.12em] nav-dragon-gold"
          >
            Already marked
          </h2>
          <ul className="space-y-2">
            {alreadyMarked.map((item) => (
              <li key={`rated-${item.book.id}`}>
                <ImportBookCard item={item} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {stats && stats.matched === 0 && unmatched.length === 0 ? (
        <div className="preference-codex-box relative !p-5 text-center">
          <p className="relative z-[3] font-heading text-sm leading-relaxed nav-dragon-gold sm:text-base">
            The keepers found no familiar titles this time. You can still search
            the archives from Browse, or try another export.
          </p>
          <Link
            href="/browse"
            className="btn-primary relative z-[3] mt-4 inline-flex justify-center"
          >
            Browse the shelves
          </Link>
        </div>
      ) : null}

      {unmatched.length > 0 ? (
        <section aria-labelledby="unmatched-heading">
          <button
            type="button"
            onClick={() => setShowUnmatched((v) => !v)}
            className="flex w-full items-center justify-between gap-3 rounded-sm border border-gold-600/35 bg-forest-950/45 px-3 py-3 text-left"
            aria-expanded={showUnmatched}
          >
            <h2
              id="unmatched-heading"
              className="font-storybook text-sm font-semibold tracking-[0.1em] nav-dragon-gold"
            >
              Not found in the archives ({unmatched.length})
            </h2>
            {showUnmatched ? (
              <ChevronUp className="h-4 w-4 shrink-0 text-gold-500" />
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0 text-gold-500" />
            )}
          </button>
          {showUnmatched ? (
            <ul className="mt-3 space-y-2">
              {unmatched.map((item, index) => (
                <li
                  key={`${item.title}-${item.author}-${index}`}
                  className="rounded-sm border border-gold-600/25 bg-forest-950/35 px-3 py-2.5"
                >
                  <p className="font-storybook text-sm font-bold tracking-[0.04em] nav-dragon-gold">
                    {item.title}
                  </p>
                  <p className="mt-0.5 font-heading text-xs nav-dragon-gold/85">
                    {item.author}
                    {item.shelfLabel ? ` · ${item.shelfLabel}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-2 font-heading text-xs leading-relaxed nav-dragon-gold/90">
            These titles can still be found with Browse search when you&apos;re
            ready.
          </p>
        </section>
      ) : null}
    </div>
  );
}

function ImportBookCard({ item }: { item: MatchedImportBook }) {
  const book = toBookSummary(item.book);

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
          {item.book.title}
        </h3>
        {item.book.authors.length > 0 ? (
          <p className="mt-1 line-clamp-1 font-heading text-xs nav-dragon-gold/90 sm:text-sm">
            {item.book.authors.join(", ")}
          </p>
        ) : null}
        {item.shelfLabel ? (
          <p className="mt-1 font-heading text-[11px] tracking-wide text-[#e2c06a]/85">
            {item.shelfLabel}
            {item.dateRead ? ` · read ${item.dateRead}` : ""}
          </p>
        ) : null}

        {item.alreadyRated ? (
          <p className="mt-auto inline-flex items-center gap-1.5 pt-2 font-storybook text-[11px] font-semibold uppercase tracking-[0.14em] text-[#e2c06a]">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            Already marked
          </p>
        ) : (
          <Link
            href={bookHref(item.book.id)}
            className="btn-primary mt-auto w-full justify-center px-3 py-2.5 text-[11px] tracking-[0.12em] sm:w-auto sm:self-start"
          >
            <Feather className="h-3.5 w-3.5" aria-hidden="true" />
            Rate this book
          </Link>
        )}
      </div>
    </article>
  );
}
