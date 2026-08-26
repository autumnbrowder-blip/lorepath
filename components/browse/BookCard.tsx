import { AuthorLinks } from "@/components/books/AuthorLinks";
import { BookCover } from "@/components/books/BookCover";
import { GenreTag } from "@/components/theme/GenreTag";
import { resolvePublicationYears } from "@/lib/book-utils";
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
 * Browse / search result card — dark translucent gold frame over the library.
 * When hasUserRating is true, shows Inscribed above Open the Tome.
 */
export function BookCard({
  book,
  searchQuery,
  hasUserRating = false,
}: BookCardProps) {
  const encodedId = encodeURIComponent(book.id);
  const bookHref = searchQuery?.trim()
    ? `/books/${encodedId}?q=${encodeURIComponent(searchQuery.trim())}`
    : `/books/${encodedId}?hint=${encodeURIComponent(book.title)}`;

  const { displayYear } = resolvePublicationYears(book);
  const showInscribed = hasUserRating;

  return (
    <article className="tome-card">
      <div className="relative h-[7.25rem] w-[4.85rem] shrink-0 overflow-hidden border-r border-gold-600/25 bg-[#0c1f19] sm:h-[8.25rem] sm:w-[5.5rem]">
        <BookCover
          book={book}
          variant="card"
          className="object-cover"
          sizes="88px"
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col px-3 py-2.5 sm:px-3.5 sm:py-3">
        <h2 className="line-clamp-2 font-storybook text-[0.95rem] font-bold leading-snug tracking-[0.02em] text-[#f0d78a] sm:text-base">
          {book.title}
        </h2>
        <p className="mt-0.5 line-clamp-1 font-heading text-sm leading-snug text-[#f0e4c7]/90">
          <AuthorLinks
            authors={book.authors}
            className="font-medium text-[#f0e4c7]/90"
          />
        </p>
        {displayYear ? (
          <p className="mt-0.5 font-heading text-[11px] text-[#f0e4c7]/65">
            {displayYear}
          </p>
        ) : null}

        {book.genres.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {book.genres.slice(0, 2).map((genre) => (
              <GenreTag key={genre} size="sm">
                {genre}
              </GenreTag>
            ))}
          </div>
        ) : null}

        <div className="mt-auto flex flex-col gap-1 pt-2">
          {showInscribed ? (
            <div
              className="inline-flex w-fit items-center gap-1 text-[#e2c06a]"
              role="status"
              data-testid="tome-inscribed"
              aria-label="Inscribed — you have rated this tome"
            >
              <Feather className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="font-heading text-xs italic">Inscribed</span>
            </div>
          ) : null}
          <Link
            href={bookHref}
            className="tome-open-link"
            data-testid="open-the-tome"
          >
            Open the Tome
          </Link>
        </div>
      </div>
    </article>
  );
}
