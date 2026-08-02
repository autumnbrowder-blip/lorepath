"use client";

import { BookCover } from "@/components/books/BookCover";
import { CodexBoxOrnament } from "@/components/preferences/CodexBoxOrnament";
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
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";

const STORAGE_KEY = "lorepath.goodreads-import.v1";
const INITIAL_VISIBLE = 50;

/** Same parchment plaque as Browse search / first-rating forms. */
const PARCHMENT_PLAQUE: CSSProperties = {
  backgroundImage: "url('/images/parchment.jpg')",
  backgroundSize: "cover",
  backgroundPosition: "center",
  backgroundRepeat: "no-repeat",
  border: "3px solid #8c6b2e",
  borderRadius: "6px",
  boxShadow:
    "0 6px 16px rgba(0,0,0,0.35), inset 0 0 40px rgba(139, 105, 20, 0.15)",
};

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

  async function handleSubmit(e: FormEvent) {
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
  const hasResults = matched.length > 0 || unmatched.length > 0;

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
      {/* Main import plaque — parchment like Browse search */}
      <form
        onSubmit={handleSubmit}
        className="relative overflow-hidden px-5 py-6 sm:px-7 sm:py-8"
        style={PARCHMENT_PLAQUE}
      >
        <div className="relative z-[1] space-y-6">
          <div className="text-center sm:text-left">
            <div className="mb-3 inline-flex items-center gap-2">
              <ScrollText
                className="h-5 w-5 shrink-0 text-[#a67c2d]"
                aria-hidden="true"
              />
              <p className="font-storybook text-[11px] font-bold uppercase tracking-[0.22em] text-[#5c3f0f]">
                Goodreads export
              </p>
            </div>
            <h2 className="font-storybook text-xl font-semibold tracking-[0.05em] text-[#2f1f0f] sm:text-2xl">
              Bring your finished books here
            </h2>
            <p className="mt-2 font-heading text-[15px] leading-relaxed text-[#3f2a1e] sm:text-base">
              Match titles to LorePath shelves, then rate them one by one —
              nothing is marked for you automatically.
            </p>
          </div>

          <ol className="space-y-3">
            <StepRow
              number="1"
              title="Export your Goodreads CSV"
              detail="My Books → Import and export → download your library."
            />
            <StepRow
              number="2"
              title="Upload it here"
              detail="Choose the .csv file (under 2 MB). We prefer your Read shelf."
            />
            <StepRow
              number="3"
              title="Rate matched books you’ve read"
              detail="Open each tome and leave your marks with the usual rating form."
            />
          </ol>

          <label
            className="flex cursor-pointer flex-col items-center gap-3 px-4 py-9 text-center transition hover:brightness-[1.03] sm:py-10"
            style={{
              border: "2px dashed #8c6b2e",
              borderRadius: "4px",
              background: "rgba(255, 248, 230, 0.42)",
              boxShadow: "inset 0 1px 0 rgba(255, 250, 235, 0.55)",
            }}
          >
            <Upload
              className="h-8 w-8 text-[#a67c2d]"
              aria-hidden="true"
            />
            <span className="font-storybook text-xs font-bold uppercase tracking-[0.18em] text-[#5c3f0f]">
              {file ? file.name : "Choose Goodreads CSV"}
            </span>
            <span className="font-heading text-sm text-[#3f2a1e]/85">
              Tap to select a file · .csv only
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

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <button
              type="submit"
              disabled={!file || loading}
              className="btn-primary w-full justify-center px-8 py-3.5 text-sm tracking-[0.14em] sm:w-auto"
            >
              {loading ? (
                <>
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                  Matching your shelves...
                </>
              ) : (
                <>
                  <Feather className="h-4 w-4" aria-hidden="true" />
                  Match my books
                </>
              )}
            </button>
            {hasResults ? (
              <button
                type="button"
                onClick={clearResults}
                className="btn-secondary w-full justify-center sm:w-auto"
              >
                Clear results
              </button>
            ) : null}
          </div>

          {loading ? (
            <p className="font-heading text-sm leading-relaxed text-[#3f2a1e]/90">
              Searching the archives — longer lists may take a quiet moment.
            </p>
          ) : null}
        </div>
      </form>

      {/* Step 3 results */}
      {stats ? (
        <div className="preference-codex-box relative !p-4 sm:!p-5">
          <CodexBoxOrnament />
          <p className="relative z-[3] font-heading text-sm leading-relaxed nav-dragon-gold sm:text-base">
            {stats.matched === 0
              ? "No matching tomes turned up in our shelves yet."
              : `Matched ${stats.matched} tome${stats.matched === 1 ? "" : "s"} from your export${
                  stats.alreadyRated
                    ? ` · ${stats.alreadyRated} already marked`
                    : ""
                }.`}
            {stats.capped
              ? " Showing your first batch of reads."
              : null}
            {!stats.preferredReadShelf
              ? " We didn’t spot a Read shelf, so we included books more broadly."
              : null}
          </p>
        </div>
      ) : null}

      {readyToRate.length > 0 ? (
        <section aria-labelledby="matched-ready-heading" className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <h2
              id="matched-ready-heading"
              className="font-storybook text-base font-bold tracking-[0.1em] nav-dragon-gold sm:text-lg"
            >
              Step 3 · Ready to mark
            </h2>
            <p className="shrink-0 font-heading text-xs nav-dragon-gold/85">
              {readyToRate.length} book{readyToRate.length === 1 ? "" : "s"}
            </p>
          </div>
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
              className="btn-secondary mt-1"
            >
              Show more
            </button>
          ) : null}
        </section>
      ) : null}

      {alreadyMarked.length > 0 ? (
        <section aria-labelledby="already-marked-heading" className="space-y-3">
          <h2
            id="already-marked-heading"
            className="font-storybook text-sm font-semibold tracking-[0.12em] nav-dragon-gold"
          >
            Already marked
          </h2>
          <ul className="space-y-3">
            {alreadyMarked.map((item) => (
              <li key={`rated-${item.book.id}`}>
                <ImportBookCard item={item} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {stats && stats.matched === 0 && unmatched.length === 0 ? (
        <div className="preference-codex-box relative !p-5 text-center sm:!p-6">
          <CodexBoxOrnament />
          <p className="relative z-[3] font-heading text-sm leading-relaxed nav-dragon-gold sm:text-base">
            The keepers found no familiar titles this time. Search the archives
            from Browse, or try another export.
          </p>
          <Link
            href="/browse"
            className="btn-primary relative z-[3] mt-5 inline-flex justify-center"
          >
            Browse the shelves
          </Link>
        </div>
      ) : null}

      {unmatched.length > 0 ? (
        <section aria-labelledby="unmatched-heading">
          <div className="preference-codex-box relative !p-0">
            <CodexBoxOrnament />
            <button
              type="button"
              onClick={() => setShowUnmatched((v) => !v)}
              className="relative z-[3] flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left sm:px-5"
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
              <ul className="relative z-[3] space-y-2 border-t border-gold-600/30 px-4 py-3 sm:px-5">
                {unmatched.map((item, index) => (
                  <li
                    key={`${item.title}-${item.author}-${index}`}
                    className="rounded-sm border border-gold-600/35 bg-[#184033]/50 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,230,150,0.08)]"
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
          </div>
          <p className="mt-2.5 font-heading text-xs leading-relaxed nav-dragon-gold/90">
            These titles can still be found with Browse search when you&apos;re
            ready.
          </p>
        </section>
      ) : null}
    </div>
  );
}

function StepRow({
  number,
  title,
  detail,
}: {
  number: string;
  title: string;
  detail: string;
}) {
  return (
    <li className="flex gap-3 rounded-sm border border-[#8c6b2e]/45 bg-[rgba(255,248,230,0.38)] px-3 py-3 sm:px-3.5">
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-[#8c6b2e] font-storybook text-xs font-bold text-[#5c3f0f]"
        style={{
          background:
            "linear-gradient(180deg, #d0b67a 0%, #b38b4d 45%, #a67c2d 100%)",
        }}
        aria-hidden="true"
      >
        {number}
      </span>
      <div className="min-w-0 pt-0.5">
        <p className="font-storybook text-sm font-bold tracking-[0.06em] text-[#2f1f0f]">
          Step {number}: {title}
        </p>
        <p className="mt-0.5 font-heading text-sm leading-snug text-[#3f2a1e]/90">
          {detail}
        </p>
      </div>
    </li>
  );
}

function ImportBookCard({ item }: { item: MatchedImportBook }) {
  const book = toBookSummary(item.book);

  return (
    <article className="preference-codex-box relative flex gap-3 !p-3 sm:!p-3.5">
      <CodexBoxOrnament />
      <div className="relative z-[3] h-24 w-[4.25rem] shrink-0 overflow-hidden rounded-sm border border-gold-600/40 bg-[#184033]/50">
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
