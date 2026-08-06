import { AuthorLinks } from "@/components/books/AuthorLinks";
import { BookCover } from "@/components/books/BookCover";
import { GenreTag } from "@/components/theme/GenreTag";
import { resolvePublicationYears, truncateText } from "@/lib/book-utils";
import type { BookSummary } from "@/types/book";
import { Feather } from "lucide-react";
import Link from "next/link";

type BookCardProps = {
  book: BookSummary;
  /** Active browse search query — preserved on the book detail URL. */
  searchQuery?: string;
  /**
   * Logged-in reader has already inscribed marks on this work.
   * Never set for logged-out users.
   */
  hasUserRating?: boolean;
};

/**
 * TEMPORARY verification switch: renders Inscribed on every card so we can
 * confirm this is the component production serves. Remove after checking.
 */
const FORCE_INSCRIBED_BADGE = true;

/**
 * Browse / search result card.
 * When hasUserRating is true, renders full-width Inscribed above Open the Tome.
 */
export function BookCard({
  book,
  searchQuery,
  hasUserRating = false,
}: BookCardProps) {
  const description = book.description
    ? truncateText(book.description, 120)
    : null;

  const encodedId = encodeURIComponent(book.id);
  const bookHref = searchQuery?.trim()
    ? `/books/${encodedId}?q=${encodeURIComponent(searchQuery.trim())}`
    : `/books/${encodedId}`;

  const { displayYear, firstPublishYear, latestEditionYear } =
    resolvePublicationYears(book);

  const showInscribed = FORCE_INSCRIBED_BADGE || hasUserRating;

  return (
    <article className="tome-card group">
      {/* Leather spine accent */}
      <div className="absolute bottom-0 left-0 top-0 z-10 w-1.5 bg-gradient-to-b from-gold-500/50 via-gold-700/30 to-gold-900/40" />

      <div className="relative aspect-[2/3] w-full overflow-hidden bg-gradient-to-br from-forest-200 to-forest-300 dark:from-forest-900 dark:to-forest-950">
        <BookCover
          book={book}
          variant="card"
          className="object-cover transition duration-500 group-hover:scale-[1.03]"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 200px"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-forest-950/50 via-transparent to-transparent opacity-80" />
      </div>

      <div className="flex flex-1 flex-col border-t border-gold-600/30 bg-gradient-to-b from-[#123229] to-[#0c1f19] p-4 pl-5">
        <h2 className="mb-1.5 line-clamp-2 font-storybook text-[15px] font-bold leading-snug tracking-[0.04em] nav-dragon-gold sm:text-base">
          {book.title}
        </h2>
        <p className="mb-2 line-clamp-1 font-heading text-sm font-medium leading-snug">
          <AuthorLinks
            authors={book.authors}
            className="font-medium nav-dragon-gold"
          />
        </p>

        {displayYear ? (
          <div className="mb-2 space-y-0.5">
            <p className="font-storybook text-[11px] font-semibold tracking-[0.12em] nav-dragon-gold">
              {displayYear}
            </p>
            {firstPublishYear && latestEditionYear ? (
              <p className="font-heading text-[10px] leading-snug text-[#f0e4c7]/70">
                First published {firstPublishYear} · Latest edition{" "}
                {latestEditionYear}
              </p>
            ) : null}
          </div>
        ) : null}

        {description && (
          <p className="mb-3 line-clamp-3 font-heading text-[13px] font-medium leading-relaxed text-[#f0e4c7]/90">
            {description}
          </p>
        )}

        {book.genres.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {book.genres.slice(0, 3).map((genre) => (
              <GenreTag key={genre} size="sm">
                {genre}
              </GenreTag>
            ))}
          </div>
        )}

        {/* Action stack: Inscribed (rated only) + Open the Tome */}
        <div className="mt-auto flex flex-col gap-1.5">
          {showInscribed ? (
            <div
              className="tome-card-inscribed inline-flex w-full min-h-[2.5rem] items-center justify-center gap-1.5 rounded-sm border border-gold-500/80 bg-gradient-to-b from-[#2a5a44] via-[#1a4030] to-[#0f241c] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,230,150,0.2),0_0_14px_rgba(166,124,45,0.22)]"
              role="status"
              data-testid="tome-inscribed"
              aria-label="Inscribed — you have rated this tome"
            >
              <Feather
                className="h-3.5 w-3.5 shrink-0 text-[#e2c06a]"
                aria-hidden="true"
                strokeWidth={2.25}
              />
              <span className="font-storybook text-[11px] font-bold uppercase tracking-[0.16em] text-[#e2c06a]">
                Inscribed
              </span>
            </div>
          ) : null}

          <Link
            href={bookHref}
            className="btn-secondary w-full px-3 py-2 text-[10px]"
            data-testid="open-the-tome"
          >
            Open the Tome
          </Link>
        </div>
      </div>
    </article>
  );
}
