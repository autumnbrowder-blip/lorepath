import { BookCover } from "@/components/books/BookCover";
import { CornerFlourish } from "@/components/theme/FantasyDecor";
import { FantasyPageShell } from "@/components/theme/FantasyPageShell";
import { loadBookDetail, searchBooks } from "@/lib/books";
import {
  editionsOfWork,
  firstPublishedYear,
  workEditionsHref,
} from "@/lib/book-work";
import { withTimeoutFallback } from "@/lib/provider-resilience";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { BookSummary } from "@/types/book";

type EditionsPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ hint?: string }>;
};

export async function generateMetadata({
  params,
}: EditionsPageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: "Other editions | LorePath",
    alternates: { canonical: workEditionsHref(id) },
  };
}

export default async function BookEditionsPage({
  params,
  searchParams,
}: EditionsPageProps) {
  const { id } = await params;
  const { hint } = await searchParams;

  const { book } = await loadBookDetail(id, {
    searchHint: hint?.trim() || undefined,
  });

  if (!book) {
    return (
      <FantasyPageShell>
        <div className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
          <h1 className="page-title">Editions</h1>
          <p className="page-subtitle mt-3">
            This tome could not be opened, so its other editions are hidden for
            now.
          </p>
          <Link href="/browse" className="btn-primary mt-8">
            Back to the Archives
          </Link>
        </div>
      </FantasyPageShell>
    );
  }

  const searchQuery = hint?.trim() || book.title;
  const siblingBooks = await withTimeoutFallback(
    searchBooks(searchQuery, 1).then((result) => result.books),
    4000,
    "editions-search",
    [] as BookSummary[]
  );
  const editions = editionsOfWork(book, siblingBooks);
  const firstYear = firstPublishedYear([
    book,
    ...editions.map((edition) => ({
      publishedYear: edition.publishedYear,
      firstPublishYear: null,
    })),
  ]);

  return (
    <FantasyPageShell>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:py-10 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <Link
          href={`/books/${encodeURIComponent(id)}`}
          className="preference-codex-box--nav relative mb-4 sm:mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="relative z-[1] nav-dragon-gold">Back to the Tome</span>
        </Link>

        <div className="book-detail-tome relative">
          <div className="book-detail-tome-parchment" aria-hidden="true" />
          <CornerFlourish className="pointer-events-none absolute left-1 top-1 z-20 h-12 w-12 text-[#a67c2d]/70 sm:left-2 sm:top-2 sm:h-14 sm:w-14" />
          <CornerFlourish className="pointer-events-none absolute right-1 top-1 z-20 h-12 w-12 rotate-90 text-[#a67c2d]/70 sm:right-2 sm:top-2 sm:h-14 sm:w-14" />
          <CornerFlourish className="pointer-events-none absolute bottom-1 left-1 z-20 h-12 w-12 -rotate-90 text-[#a67c2d]/70 sm:bottom-2 sm:left-2 sm:h-14 sm:w-14" />
          <CornerFlourish className="pointer-events-none absolute bottom-1 right-1 z-20 h-12 w-12 rotate-180 text-[#a67c2d]/70 sm:bottom-2 sm:right-2 sm:h-14 sm:w-14" />

          <div className="book-detail-tome-content relative z-[2] px-4 py-5 sm:px-8 sm:py-7">
            <p className="section-label">
              {firstYear ? `First published ${firstYear}` : "Work"}
            </p>
            <h1 className="page-title mt-2">{book.title}</h1>
            <p className="page-subtitle mt-2">
              Other editions of this work. Open a year to rate that record.
            </p>

            <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {editions.map((edition) => {
                const isCurrent = edition.id === book.id;
                return (
                  <li key={edition.id}>
                    <article className="tome-card flex h-full gap-4 p-4 pl-5">
                      <div className="absolute bottom-0 left-0 top-0 w-1.5 bg-gradient-to-b from-gold-500/50 via-gold-700/30 to-gold-900/40" />
                      <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded-sm border border-gold-600/30 bg-surface">
                        <BookCover
                          book={{
                            id: edition.id,
                            title: edition.title,
                            coverUrl: edition.coverUrl,
                            isbn: null,
                          }}
                          variant="card"
                          className="object-cover"
                          sizes="80px"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h2 className="font-heading text-lg font-semibold leading-snug text-foreground">
                          {edition.publishedYear
                            ? String(edition.publishedYear)
                            : "Year unknown"}
                        </h2>
                        <p className="mt-1 text-sm text-muted">
                          {isCurrent ? "This edition" : edition.title}
                        </p>
                        <Link
                          href={`/books/${encodeURIComponent(edition.id)}?hint=${encodeURIComponent(edition.title)}`}
                          className="preference-codex-box--nav relative mt-3 inline-flex min-h-9 w-auto justify-center px-3 py-2"
                        >
                          <span className="relative z-[1] nav-dragon-gold">
                            Open the Tome
                          </span>
                        </Link>
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>

            {editions.length <= 1 ? (
              <p className="mt-6 font-heading text-sm nav-dragon-gold">
                No other editions turned up in the archives yet. This record
                stays the one your marks attach to.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </FantasyPageShell>
  );
}
