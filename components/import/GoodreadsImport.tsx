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
  type FormEvent,
  type ReactNode,
} from "react";

const STORAGE_KEY = "lorepath.goodreads-import.v1";
const INITIAL_VISIBLE_MATCHED = 40;
const INITIAL_VISIBLE_UNMATCHED = 30;

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
  const [visibleMatched, setVisibleMatched] = useState(INITIAL_VISIBLE_MATCHED);
  const [visibleUnmatched, setVisibleUnmatched] = useState(
    INITIAL_VISIBLE_UNMATCHED
  );
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
          data.error ?? "The keepers could not unfurl that scroll."
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
      setVisibleMatched(INITIAL_VISIBLE_MATCHED);
      setVisibleUnmatched(INITIAL_VISIBLE_UNMATCHED);

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
          : "A soft draft stirred the shelves — please try again."
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
  const visibleMatchedItems = matched.slice(0, visibleMatched);
  const visibleUnmatchedItems = unmatched.slice(0, visibleUnmatched);
  const hasMoreMatched = matched.length > visibleMatched;
  const hasMoreUnmatched = unmatched.length > visibleUnmatched;
  const hasResults = matched.length > 0 || unmatched.length > 0;

  if (!restored) {
    return (
      <div className="flex flex-col items-center py-12">
        <Loader2 className="mb-3 h-8 w-8 animate-spin text-gold-500" />
        <p className="font-heading text-sm nav-dragon-gold">
          Lighting the reading lamps...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <form
        onSubmit={handleSubmit}
        className="preference-codex-box relative !px-4 !py-5 sm:!px-7 sm:!py-8"
      >
        <CodexBoxOrnament />
        <div className="relative z-[3] space-y-5 sm:space-y-6">
          <div className="text-center sm:text-left">
            <div className="mb-2.5 inline-flex items-center gap-2">
              <ScrollText
                className="h-5 w-5 shrink-0 text-accent"
                aria-hidden="true"
              />
              <p className="font-storybook text-[11px] font-bold uppercase tracking-[0.22em] nav-dragon-gold">
                From another shelf
              </p>
            </div>
            <h2 className="font-storybook text-xl font-bold tracking-[0.06em] nav-dragon-gold sm:text-2xl">
              Import Books You&apos;ve Read
            </h2>
            <p className="mt-2 font-heading text-[15px] leading-relaxed nav-dragon-gold sm:text-base">
              Bring in tales you&apos;ve already finished so you can leave marks
              faster. Nothing is rated for you — you choose each tome.
            </p>
          </div>

          <ol className="space-y-2.5 sm:space-y-3">
            <StepRow
              number="1"
              title="Gather your Goodreads export"
              detail="On Goodreads: My Books → Import and export → download your library CSV."
            />
            <StepRow
              number="2"
              title="Place it on this desk"
              detail="Choose the .csv scroll (under 2 MB). We look first to your Read shelf."
            />
            <StepRow
              number="3"
              title="Leave your marks"
              detail="Open each matched tome and inscribe ratings with the usual form."
            />
          </ol>

          <label className="codex-inset flex min-h-[2.75rem] cursor-pointer flex-col items-center gap-2.5 border-dashed px-4 py-7 text-center transition hover:border-gold-500/55 sm:py-9">
            <Upload className="h-7 w-7 text-accent sm:h-8 sm:w-8" aria-hidden="true" />
            <span className="font-storybook text-xs font-bold uppercase tracking-[0.18em] nav-dragon-gold">
              {file ? file.name : "Place your Goodreads export here"}
            </span>
            <span className="font-heading text-sm nav-dragon-gold/85">
              Tap to choose a file · .csv only
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

          <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <button
              type="submit"
              disabled={!file || loading}
              className="btn-primary w-full min-h-[2.75rem] justify-center px-8 py-3.5 text-sm tracking-[0.14em] sm:w-auto"
            >
              {loading ? (
                <>
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                  Searching the shelves...
                </>
              ) : (
                <>
                  <Feather className="h-4 w-4" aria-hidden="true" />
                  Open the archive of books you&apos;ve read
                </>
              )}
            </button>
            {hasResults ? (
              <button
                type="button"
                onClick={clearResults}
                className="btn-secondary w-full min-h-[2.75rem] justify-center sm:w-auto"
              >
                Clear the desk
              </button>
            ) : null}
          </div>

          {loading ? (
            <p className="font-heading text-sm leading-relaxed nav-dragon-gold/90">
              The keepers are matching titles — longer lists may take a quiet
              moment.
            </p>
          ) : null}
        </div>
      </form>

      {stats ? (
        <ImportStatusPanel
          readyCount={readyToRate.length}
          alreadyMarkedCount={alreadyMarked.length}
          unmatchedCount={unmatched.length}
          capped={stats.capped}
          preferredReadShelf={stats.preferredReadShelf}
        />
      ) : null}

      {matched.length > 0 ? (
        <section aria-labelledby="matched-heading" className="space-y-3">
          <div className="flex items-end justify-between gap-3 px-0.5">
            <div className="min-w-0">
              <h2
                id="matched-heading"
                className="font-storybook text-base font-bold tracking-[0.1em] nav-dragon-gold sm:text-lg"
              >
                Found on the shelves
              </h2>
              <p className="mt-0.5 font-heading text-sm nav-dragon-gold/90">
                Tomes matched to LorePath — ready for your hand, or already
                marked.
              </p>
            </div>
            <p className="shrink-0 font-heading text-sm tabular-nums nav-dragon-gold">
              <ImportStatNumber>{matched.length}</ImportStatNumber>
            </p>
          </div>

          <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3">
            {visibleMatchedItems.map((item) => (
              <li key={`${item.book.id}-${item.csvTitle}`}>
                <ImportBookCard item={item} />
              </li>
            ))}
          </ul>

          {hasMoreMatched ? (
            <button
              type="button"
              onClick={() => setVisibleMatched((n) => n + 40)}
              className="btn-secondary mt-1 min-h-[2.75rem] w-full justify-center sm:w-auto"
            >
              Reveal more matched tomes
            </button>
          ) : null}
        </section>
      ) : null}

      {stats && matched.length === 0 && unmatched.length === 0 ? (
        <div className="preference-codex-box relative !p-5 text-center sm:!p-6">
          <CodexBoxOrnament />
          <p className="relative z-[3] font-heading text-sm leading-relaxed nav-dragon-gold sm:text-base">
            The shelves stayed quiet — no matching titles this round. Wander
            Browse, or bring another export when you&apos;re ready.
          </p>
          <Link
            href="/browse"
            className="btn-secondary relative z-[3] mt-4 inline-flex min-h-[2.75rem] justify-center"
          >
            Browse the shelves
          </Link>
        </div>
      ) : null}

      {unmatched.length > 0 ? (
        <section aria-labelledby="unmatched-heading" className="space-y-3">
          <div className="flex items-end justify-between gap-3 px-0.5">
            <div className="min-w-0">
              <h2
                id="unmatched-heading"
                className="font-storybook text-base font-bold tracking-[0.1em] nav-dragon-gold sm:text-lg"
              >
                Needs a closer look
              </h2>
              <p className="mt-0.5 font-heading text-sm nav-dragon-gold/90">
                These titles could not be placed on LorePath&apos;s shelves yet.
              </p>
            </div>
            <p className="shrink-0 font-heading text-sm tabular-nums nav-dragon-gold">
              <ImportStatNumber>{unmatched.length}</ImportStatNumber>
            </p>
          </div>

          <ul className="space-y-2">
            {visibleUnmatchedItems.map((item, index) => (
              <li key={`${item.title}-${item.author}-${index}`}>
                <UnmatchedBookRow item={item} />
              </li>
            ))}
          </ul>

          {hasMoreUnmatched ? (
            <button
              type="button"
              onClick={() => setVisibleUnmatched((n) => n + 30)}
              className="btn-secondary mt-1 min-h-[2.75rem] w-full justify-center sm:w-auto"
            >
              Reveal more
            </button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function ImportStatusPanel({
  readyCount,
  alreadyMarkedCount,
  unmatchedCount,
  capped,
  preferredReadShelf,
}: {
  readyCount: number;
  alreadyMarkedCount: number;
  unmatchedCount: number;
  capped: boolean;
  preferredReadShelf: boolean;
}) {
  const totalMatched = readyCount + alreadyMarkedCount;
  const statusLine =
    totalMatched === 0 && unmatchedCount === 0
      ? "The shelves answered with silence."
      : totalMatched === 0
        ? "A few titles still wait beyond the lamp-light."
        : "Your archive has been sorted.";

  return (
    <section
      aria-label="Import results summary"
      className="preference-codex-box relative !p-3.5 sm:!p-4"
    >
      <CodexBoxOrnament />
      <div className="relative z-[3] space-y-3">
        <div className="flex items-start gap-2.5 px-0.5">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-gold-600/50 bg-gradient-to-br from-gold-500/30 to-transparent text-accent">
            <ScrollText className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="font-storybook text-sm font-bold tracking-[0.06em] nav-dragon-gold sm:text-base">
              {statusLine}
            </p>
            <p className="mt-0.5 font-heading text-xs leading-snug nav-dragon-gold/90 sm:text-sm">
              {capped ? "Showing your first shelf of reads. " : null}
              {!preferredReadShelf
                ? "No Read shelf was clear, so we welcomed books more broadly."
                : "Nothing was rated for you — open a tome when you are ready."}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <StatusCount
            label="Matched"
            value={totalMatched}
            hint="on our shelves"
          />
          <StatusCount
            label="Already marked"
            value={alreadyMarkedCount}
            hint="your inscription"
          />
          <StatusCount
            label="Closer look"
            value={unmatchedCount}
            hint="not placed yet"
          />
        </div>
      </div>
    </section>
  );
}

function StatusCount({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="codex-inset px-2 py-2.5 text-center sm:px-3 sm:py-3">
      <p className="font-storybook text-[1.35rem] font-bold tabular-nums leading-none tracking-[0.04em] nav-dragon-gold sm:text-2xl">
        {value}
      </p>
      <p className="mt-1.5 font-storybook text-[10px] font-semibold uppercase tracking-[0.12em] nav-dragon-gold sm:text-[11px]">
        {label}
      </p>
      <p className="mt-0.5 hidden font-heading text-[11px] leading-tight nav-dragon-gold/80 sm:block">
        {hint}
      </p>
    </div>
  );
}

function ImportStatNumber({ children }: { children: ReactNode }) {
  return (
    <span className="antique-gold-text inline-block font-storybook text-[1.15em] font-bold tabular-nums tracking-[0.04em] sm:text-[1.2em]">
      {children}
    </span>
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
    <li className="codex-inset px-3.5 py-3 sm:px-4">
      <p className="font-storybook text-sm font-bold tracking-[0.06em] nav-dragon-gold sm:text-[15px]">
        Step{" "}
        <span className="antique-gold-text text-base font-bold tabular-nums sm:text-lg">
          {number}
        </span>
        : {title}
      </p>
      <p className="mt-1.5 font-heading text-[15px] font-medium leading-relaxed tracking-wide nav-dragon-gold sm:text-base">
        {detail}
      </p>
    </li>
  );
}

function ImportBookCard({ item }: { item: MatchedImportBook }) {
  const book = toBookSummary(item.book);

  return (
    <article className="preference-codex-box relative flex h-full gap-3 !p-2.5 sm:!p-3">
      <CodexBoxOrnament />
      <div className="relative z-[3] h-[5.5rem] w-[3.85rem] shrink-0 overflow-hidden rounded-sm border border-gold-600/40 bg-[#184033]/50 sm:h-24 sm:w-[4.25rem]">
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
          <p className="mt-0.5 line-clamp-1 font-heading text-xs nav-dragon-gold/90 sm:text-sm">
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
          <div className="mt-auto pt-2">
            <p className="mb-1.5 font-heading text-[11px] tracking-wide text-[#e2c06a]/90">
              Ready to mark
            </p>
            <Link
              href={bookHref(item.book.id)}
              className="btn-primary w-full min-h-[2.5rem] justify-center px-3 py-2 text-[11px] tracking-[0.12em] sm:w-auto sm:self-start"
            >
              <Feather className="h-3.5 w-3.5" aria-hidden="true" />
              Inscribe rating
            </Link>
          </div>
        )}
      </div>
    </article>
  );
}

function UnmatchedBookRow({ item }: { item: UnmatchedImportBook }) {
  return (
    <article className="codex-inset px-3 py-2.5 sm:px-3.5">
      <h3 className="line-clamp-2 font-storybook text-sm font-bold tracking-[0.04em] nav-dragon-gold">
        {item.title}
      </h3>
      <p className="mt-0.5 line-clamp-1 font-heading text-xs nav-dragon-gold/90">
        {item.author || "Unknown author"}
        {item.shelfLabel ? ` · ${item.shelfLabel}` : ""}
      </p>
      <p className="mt-1.5 font-heading text-xs italic leading-snug text-[#e2c06a]/85">
        Could not place this tome yet
      </p>
    </article>
  );
}
