import { AuthorLinks } from "@/components/books/AuthorLinks";
import { BookCover } from "@/components/books/BookCover";
import { GenreTag } from "@/components/theme/GenreTag";
import { resolvePublicationYears, truncateText } from "@/lib/book-utils";
import type { BookSummary } from "@/types/book";
import Link from "next/link";

type BookCardProps = {
  book: BookSummary;
  /** Active browse search query — preserved on the book detail URL. */
  searchQuery?: string;
};

export function BookCard({ book, searchQuery }: BookCardProps) {
  const description = book.description
    ? truncateText(book.description, 120)
    : null;

  const encodedId = encodeURIComponent(book.id);
  const bookHref = searchQuery?.trim()
    ? `/books/${encodedId}?q=${encodeURIComponent(searchQuery.trim())}`
    : `/books/${encodedId}`;

  const { displayYear, firstPublishYear, latestEditionYear } =
    resolvePublicationYears(book);

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

        <Link
          href={bookHref}
          className="btn-secondary mt-auto px-3 py-2 text-[10px]"
        >
          Open the Tome
        </Link>
      </div>
    </article>
  );
}
