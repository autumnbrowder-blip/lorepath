import { AuthorLinks } from "@/components/books/AuthorLinks";
import { BookCover } from "@/components/books/BookCover";
import { getGenreBrowseUrl } from "@/lib/book-links";
import { resolvePublicationYears } from "@/lib/book-utils";
import type { BookSummary } from "@/types/book";
import { Feather } from "lucide-react";
import Link from "next/link";
import "./BookCard.css";

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

/** Present ALL-CAPS catalog titles as title case; leave mixed-case titles alone. */
function displayTitle(title: string): string {
  const raw = title.trim();
  if (!raw) return title;
  const letters = raw.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (!letters || /[a-z]/.test(letters)) return title;
  return raw
    .toLowerCase()
    .replace(/(^|[\s\-–—:/(&])([a-zà-ÿ])/g, (_, sep: string, ch: string) => {
      return sep + ch.toUpperCase();
    });
}

/**
 * Browse / search result card — dark forest-green plaque over the library.
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
    <article className="ornate-plaque lp-book-card">
      <div className="lp-book-card-plate">
        <BookCover
          book={book}
          variant="card"
          className="object-cover"
          sizes="72px"
        />
        <span className="lp-book-card-plate-corners" aria-hidden="true" />
      </div>

      <div className="lp-book-card-body">
        <h2 className="tome-title lp-book-card-title">{displayTitle(book.title)}</h2>
        <p className="tome-author lp-book-card-author">
          <AuthorLinks authors={book.authors} />
          {displayYear ? (
            <span className="lp-book-card-year"> · {displayYear}</span>
          ) : null}
        </p>

        {book.genres.length > 0 ? (
          <div className="lp-book-card-tags">
            {book.genres.slice(0, 2).map((genre) => (
              <Link
                key={genre}
                href={getGenreBrowseUrl(genre)}
                className="lp-book-card-tag"
                title={`Browse ${genre} books`}
              >
                {genre}
              </Link>
            ))}
          </div>
        ) : null}

        <div className="lp-book-card-actions">
          {showInscribed ? (
            <div
              className="lp-book-card-inscribed"
              role="status"
              data-testid="tome-inscribed"
              aria-label="Inscribed — you have rated this tome"
            >
              <Feather className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span>Inscribed</span>
            </div>
          ) : null}
          <Link
            href={bookHref}
            className="tome-link lp-book-card-open"
            data-testid="open-the-tome"
          >
            Open the Tome
          </Link>
        </div>
      </div>
    </article>
  );
}
