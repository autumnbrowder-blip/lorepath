import { BookCard } from "@/components/browse/BookCard";
import type { BookSummary } from "@/types/book";
import { Crown, ScrollText } from "lucide-react";

type BestsellersSectionProps = {
  books: BookSummary[];
  error?: string | null;
};

export function BestsellersSection({
  books,
  error = null,
}: BestsellersSectionProps) {
  if (!books.length && !error) return null;

  return (
    <section
      aria-labelledby="bestsellers-heading"
      className="mb-12 border-b border-gold-600/25 pb-12"
    >
      <div className="mb-7 text-center sm:text-left">
        <p className="mb-2 inline-flex items-center gap-2 font-storybook text-[11px] font-bold uppercase tracking-[0.28em] nav-dragon-gold">
          <Crown className="h-3.5 w-3.5 text-[#e2c06a]" aria-hidden="true" />
          From the New York Times
        </p>
        <h2
          id="bestsellers-heading"
          className="font-storybook text-2xl font-bold tracking-[0.06em] nav-dragon-gold sm:text-3xl"
        >
          New Releases & Bestsellers
        </h2>
        <p className="mt-2 max-w-2xl font-heading text-base font-medium leading-relaxed nav-dragon-gold">
          Current hardcover and trade paperback fiction lists.
        </p>
      </div>

      {error && books.length === 0 ? (
        <div className="preference-codex-box relative mx-auto max-w-xl text-center">
          <ScrollText
            className="relative z-[1] mx-auto mb-3 h-8 w-8 text-[#e2c06a]/80"
            aria-hidden="true"
          />
          <p className="relative z-[1] font-heading text-base font-medium leading-relaxed nav-dragon-gold">
            {error}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {books.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>
      )}
    </section>
  );
}
