import { AuthorLinks } from "@/components/books/AuthorLinks";
import { BookMetadataItem } from "@/components/books/BookMetadataItem";
import { CodexBoxOrnament } from "@/components/preferences/CodexBoxOrnament";
import { GenreTag } from "@/components/theme/GenreTag";
import { getIsbnUrl } from "@/lib/book-links";
import type { BookDetail } from "@/types/book";
import {
  BookMarked,
  BookOpen,
  Building2,
  CalendarDays,
  Languages,
  ScanBarcode,
} from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";

type BookInformationProps = {
  book: BookDetail;
  /** Community ratings — under Match Score. */
  communityRatings?: ReactNode;
  /** Match Score — top of the right column. */
  matchScore?: ReactNode;
  /** Rating form — under Community Ratings. */
  ratingForm?: ReactNode;
};

export function BookInformation({
  book,
  communityRatings,
  matchScore,
  ratingForm,
}: BookInformationProps) {
  const metadataItems = [
    book.publishedYear && {
      icon: CalendarDays,
      label: "Published",
      value: String(book.publishedYear),
    },
    book.publisher && {
      icon: Building2,
      label: "Publisher",
      value: book.publisher,
    },
    book.pageCount && {
      icon: BookMarked,
      label: "Pages",
      value: `${book.pageCount} pages`,
    },
    book.language && {
      icon: Languages,
      label: "Language",
      value: book.language.toUpperCase(),
    },
    book.isbn && {
      icon: ScanBarcode,
      label: "ISBN",
      value: (
        <a
          href={getIsbnUrl(book.isbn)}
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:underline nav-dragon-gold"
        >
          {book.isbn}
        </a>
      ),
    },
  ].filter(Boolean) as {
    icon: typeof CalendarDays;
    label: string;
    value: React.ReactNode;
  }[];

  const descriptionBlock = (
    <div className="preference-codex-box preference-codex-box--compact relative">
      <CodexBoxOrnament />
      {book.description ? (
        <div className="relative z-[3] px-1">
          <h3 className="mb-2 font-storybook text-base font-bold tracking-[0.12em] nav-dragon-gold sm:text-lg">
            About this book
          </h3>
          <p className="font-heading text-base leading-relaxed nav-dragon-gold sm:text-lg">
            {book.description}
          </p>
        </div>
      ) : (
        <p className="relative z-[3] px-1 text-center font-heading text-base italic nav-dragon-gold">
          No description available for this book.
        </p>
      )}
    </div>
  );

  const hasRatingsColumn = Boolean(
    communityRatings || matchScore || ratingForm
  );

  return (
    <section aria-labelledby="book-info-heading" className="animate-fade-in-up">
      <div className="border-b border-gold-600/30 px-6 py-4 sm:px-8">
        <p
          id="book-info-heading"
          className="font-storybook text-[13px] font-bold uppercase tracking-[0.28em] nav-dragon-gold"
        >
          Magical Tome
        </p>
      </div>

      <div className="grid gap-6 p-5 sm:gap-8 sm:p-7 lg:grid-cols-[minmax(220px,280px)_1fr] lg:items-start lg:gap-10 lg:p-8">
        <div className="mx-auto flex w-full max-w-[280px] flex-col gap-4 lg:mx-0">
          <div className="group relative">
            <div className="absolute -inset-3 rounded-[1.75rem] bg-gradient-to-br from-gold-500/20 via-transparent to-forest-500/10 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />
            <div className="relative aspect-[2/3] overflow-hidden rounded-sm border-2 border-gold-600/55 bg-forest-100 shadow-lg ring-1 ring-forest-900/5 transition-transform duration-300 group-hover:-translate-y-1 dark:bg-forest-900 dark:ring-gold-500/10">
              {book.coverUrl ? (
                <Image
                  src={book.coverUrl}
                  alt={`Cover of ${book.title}`}
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                  sizes="(max-width: 1024px) 280px, 280px"
                  priority
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 nav-dragon-gold">
                  <BookOpen className="h-16 w-16" />
                  <span className="text-xs">No cover available</span>
                </div>
              )}
            </div>
          </div>

          {metadataItems.length > 0 && (
            <dl className="grid gap-3">
              {metadataItems.map((item) => (
                <BookMetadataItem
                  key={item.label}
                  icon={item.icon}
                  label={item.label}
                >
                  {item.value}
                </BookMetadataItem>
              ))}
            </dl>
          )}
        </div>

        <div className="flex min-w-0 flex-col">
          <h1 className="metallic-emerald-book-title mb-4 font-storybook text-3xl font-bold tracking-[0.04em] sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]">
            {book.title}
          </h1>

          <p className="metallic-emerald mb-4 font-heading text-lg font-semibold leading-relaxed">
            by{" "}
            <AuthorLinks
              authors={book.authors}
              className="font-bold metallic-emerald"
            />
          </p>

          {book.genres.length > 0 && (
            <div className="mb-5 flex flex-wrap gap-2">
              {book.genres.map((genre) => (
                <GenreTag key={genre}>{genre}</GenreTag>
              ))}
            </div>
          )}

          {hasRatingsColumn ? (
            <div className="grid gap-3 sm:gap-3.5 lg:grid-cols-[minmax(0,1.15fr)_minmax(260px,0.85fr)] lg:items-start">
              <div className="min-w-0">{descriptionBlock}</div>
              {(matchScore || communityRatings || ratingForm) && (
                <div className="flex min-w-0 flex-col gap-3 sm:gap-3.5">
                  {matchScore ? (
                    <div className="min-w-0 self-start [&>*]:h-auto">
                      {matchScore}
                    </div>
                  ) : null}
                  {communityRatings ? (
                    <div className="min-w-0 self-start">{communityRatings}</div>
                  ) : null}
                  {ratingForm ? (
                    <div className="min-w-0 w-full self-start [&>*]:w-full">
                      {ratingForm}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ) : (
            descriptionBlock
          )}
        </div>
      </div>
    </section>
  );
}
