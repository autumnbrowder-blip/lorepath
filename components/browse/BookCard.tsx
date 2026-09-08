import { AuthorLinks } from "@/components/books/AuthorLinks";
import { BookCover } from "@/components/books/BookCover";
import { FirstPublishedYearLink } from "@/components/books/FirstPublishedYearLink";
import { getGenreBrowseUrl } from "@/lib/book-links";
import { resolvePublicationYears } from "@/lib/book-utils";
import {
  distinctLatestEdition,
  latestEditionHref,
} from "@/lib/book-work";
import { applyKnownWorkFields } from "@/lib/known-editions";
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
  /** Eager-load the cover (first row). Later cards stay lazy. */
  priority?: boolean;
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
  priority = false,
}: BookCardProps) {
  const q = searchQuery?.trim() ?? "";
  const stamped = applyKnownWorkFields(book);
  const { displayYear, firstPublishYear, latestEditionYear } =
    resolvePublicationYears(stamped);
  const firstYear = firstPublishYear ?? displayYear;
  const firstEditionId = stamped.firstEditionId?.trim() || stamped.id;
  const latest = distinctLatestEdition({
    latestId: stamped.latestEditionId,
    latestYear: latestEditionYear,
    firstEditionId,
  });
  // Cover / title / Open the Tome → latest English edition (this card's id).
  const tomeHref = latestEditionHref(stamped.id, q);
  const showInscribed = hasUserRating;
  const title = displayTitle(book.title);

  return (
    <article className="ornate-plaque lp-book-card">
      <Link
        href={tomeHref}
        className="lp-book-card-plate no-underline"
        aria-label={`Open ${title}`}
      >
        <BookCover
          book={book}
          variant="card"
          className="object-cover"
          sizes="72px"
          priority={priority}
        />
        <span className="lp-book-card-plate-corners" aria-hidden="true" />
      </Link>

      <div className="lp-book-card-body">
        <h2 className="tome-title lp-book-card-title">
          <Link href={tomeHref} className="lp-book-card-title no-underline">
            {title}
          </Link>
        </h2>
        <p className="tome-author lp-book-card-author">
          <AuthorLinks authors={book.authors} />
          {firstYear ? (
            <span className="lp-book-card-year">
              {" · "}
              <FirstPublishedYearLink
                bookId={stamped.id}
                year={firstYear}
                firstEditionId={firstEditionId}
                searchQuery={q}
                label="First published"
                className="lp-book-card-year-link"
              />
            </span>
          ) : null}
          {latest ? (
            <span className="lp-book-card-year">
              {" · "}
              <Link
                href={latestEditionHref(latest.id, q)}
                className="lp-book-card-year-link"
                title="Open the latest English edition"
              >
                {`Latest edition ${latest.year}`}
              </Link>
            </span>
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
            href={tomeHref}
            className="lp-book-card-open inline-flex h-9 w-auto items-center justify-center px-3"
            data-testid="open-the-tome"
          >
            Open the Tome
          </Link>
        </div>
      </div>
    </article>
  );
}
