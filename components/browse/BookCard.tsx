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
      <div className="tome-card-cover">
        <BookCover
          book={book}
          variant="card"
          className="object-cover"
          sizes="120px"
        />
      </div>

      <div className="tome-card-body">
        <h2 className="tome-card-title">{book.title}</h2>
        <p className="tome-card-author">
          <AuthorLinks
            authors={book.authors}
            className="font-medium text-[#e8d5b0]"
          />
          {displayYear ? (
            <span className="tome-card-year"> · {displayYear}</span>
          ) : null}
        </p>

        {book.genres.length > 0 ? (
          <div className="tome-card-tags">
            {book.genres.slice(0, 2).map((genre) => (
              <GenreTag key={genre} size="sm">
                {genre}
              </GenreTag>
            ))}
          </div>
        ) : null}

        <div className="tome-card-actions">
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
