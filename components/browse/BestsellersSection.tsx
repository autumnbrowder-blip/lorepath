import { BookCard } from "@/components/browse/BookCard";
import type { BookSummary } from "@/types/book";
import { ScrollText } from "lucide-react";

type BestsellersSectionProps = {
  books: BookSummary[];
  error?: string | null;
  /** When set (logged-in), marks cards the user has already rated. */
  isBookInscribed?: (book: BookSummary) => boolean;
};

export function BestsellersSection({
  books,
  error = null,
  isBookInscribed,
}: BestsellersSectionProps) {
  if (!books.length && !error) return null;

  return (
    <section aria-labelledby="bestsellers-heading" className="mb-10">
      <div className="mb-5 text-center">
        <p className="mb-1 font-heading text-[11px] font-medium uppercase tracking-[0.22em] text-[#f0d78a]/80">
          From the New York Times
        </p>
        <h2
          id="bestsellers-heading"
          className="font-display text-xl font-medium tracking-[0.06em] text-[#f0d78a] sm:text-2xl"
        >
          New Releases & Bestsellers
        </h2>
      </div>

      {error && books.length === 0 ? (
        <div className="preference-codex-box relative mx-auto max-w-xl text-center">
          <ScrollText
            className="relative z-[1] mx-auto mb-3 h-8 w-8 text-[#e2c06a]/80"
            aria-hidden="true"
          />
          <p className="relative z-[1] font-heading text-base font-medium leading-relaxed text-[#f0d78a]">
            {error}
          </p>
        </div>
      ) : (
        <div className="tome-card-grid">
          {books.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              hasUserRating={Boolean(isBookInscribed?.(book))}
            />
          ))}
        </div>
      )}
    </section>
  );
}
