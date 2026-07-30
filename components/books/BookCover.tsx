"use client";

import {
  BOOK_COVER_PLACEHOLDER,
  getCoverCandidates,
} from "@/lib/cover-resolve";
import type { BookSummary } from "@/types/book";
import { BookOpen } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

type BookCoverProps = {
  book: Pick<BookSummary, "id" | "title" | "coverUrl" | "isbn"> & {
    coverImage?: string | null;
  };
  /** next/image sizes attribute */
  sizes: string;
  /** LCP priority — use on book detail hero cover only */
  priority?: boolean;
  className?: string;
  /** Card uses compact “Ancient volume”; detail uses a larger label. */
  variant?: "card" | "detail";
};

/**
 * Shared cover image with fallback chain:
 * provider → Open Library ISBN → Open Library OLID → parchment placeholder →
 * inline “Ancient volume” (if even the local asset fails).
 */
export function BookCover({
  book,
  sizes,
  priority = false,
  className = "object-cover",
  variant = "card",
}: BookCoverProps) {
  const candidates = useMemo(
    () =>
      getCoverCandidates({
        id: book.id,
        coverUrl: book.coverUrl,
        isbn: book.isbn,
        coverImage: book.coverImage,
      }),
    [book.id, book.coverUrl, book.isbn, book.coverImage]
  );

  const [index, setIndex] = useState(0);
  const [exhausted, setExhausted] = useState(false);

  useEffect(() => {
    setIndex(0);
    setExhausted(false);
  }, [candidates]);

  const src =
    candidates[Math.min(index, candidates.length - 1)] ?? BOOK_COVER_PLACEHOLDER;
  const isPlaceholder = src === BOOK_COVER_PLACEHOLDER;

  if (exhausted) {
    return (
      <div
        className={
          variant === "detail"
            ? "flex h-full flex-col items-center justify-center gap-3 nav-dragon-gold"
            : "flex h-full flex-col items-center justify-center gap-2"
        }
      >
        <BookOpen
          className={
            variant === "detail"
              ? "h-16 w-16"
              : "h-10 w-10 text-[#b38b4d]/80"
          }
        />
        <span
          className={
            variant === "detail"
              ? "text-xs"
              : "font-storybook text-[10px] uppercase tracking-[0.2em] nav-dragon-gold"
          }
        >
          {variant === "detail" ? "No cover available" : "Ancient volume"}
        </span>
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={
        isPlaceholder
          ? `Placeholder cover for ${book.title}`
          : `Cover of ${book.title}`
      }
      fill
      className={className}
      sizes={sizes}
      priority={priority}
      loading={priority ? undefined : "lazy"}
      onError={() => {
        if (index + 1 < candidates.length) {
          setIndex((current) => current + 1);
          return;
        }
        setExhausted(true);
      }}
    />
  );
}
