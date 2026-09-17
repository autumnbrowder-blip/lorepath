"use client";

import {
  BOOK_COVER_PLACEHOLDER,
  coverSourceFromUrl,
  getCoverCandidates,
} from "@/lib/cover-resolve";
import type { BookSummary } from "@/types/book";
import { BookOpen } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type BookCoverProps = {
  book: Pick<BookSummary, "id" | "title" | "coverUrl" | "isbn"> & {
    coverImage?: string | null;
  };
  /** Layout hint from callers — unused; covers are never next/image. */
  sizes: string;
  /** LCP hint from callers — covers always load lazy to cut bandwidth. */
  priority?: boolean;
  className?: string;
  /** Card uses compact “Ancient volume”; detail uses a larger label. */
  variant?: "card" | "detail";
};

/**
 * Shared cover image with fallback chain:
 * Open Library / stored cover URL → local /images placeholder →
 * inline “Ancient volume” (if even the local asset fails).
 * Plain <img> only — never next/image (Netlify image function).
 */
export function BookCover({
  book,
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

  useEffect(() => {
    console.info(`[covers] source=${coverSourceFromUrl(src)}`);
  }, [src]);

  if (exhausted) {
    return (
      <div
        className={
          variant === "detail"
            ? "relative flex h-full min-h-[20rem] w-full flex-col items-center justify-center gap-3 nav-dragon-gold"
            : "relative flex h-full min-h-[96px] w-full flex-col items-center justify-center gap-2"
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
    <div
      className={
        variant === "detail"
          ? "relative h-full min-h-[20rem] w-full"
          : "relative h-full min-h-[96px] w-full"
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- hotlink OL/local covers; never next/image */}
      <img
        src={src}
        alt={
          isPlaceholder
            ? `Placeholder cover for ${book.title}`
            : `Cover of ${book.title}`
        }
        className={`absolute inset-0 h-full w-full ${className}`}
        loading="lazy"
        decoding="async"
        onError={() => {
          if (index + 1 < candidates.length) {
            setIndex((current) => current + 1);
            return;
          }
          setExhausted(true);
        }}
      />
    </div>
  );
}
