import { TrackOnMount } from "@/components/analytics/TrackOnMount";
import { BookInformation } from "@/components/books/BookInformation";
import { BookRatingsProvider } from "@/components/books/BookRatingsContext";
import { LiveCommunityRatings } from "@/components/books/LiveCommunityRatings";
import { LiveMatchScore } from "@/components/books/LiveMatchScore";
import { RatingForm } from "@/components/books/RatingForm";
import { CornerFlourish } from "@/components/theme/FantasyDecor";
import { FantasyPageShell } from "@/components/theme/FantasyPageShell";
import { getBookById } from "@/lib/books";
import { RateLimitError } from "@/lib/google-books";
import { getCommunityRatings, getUserRatingForBook } from "@/lib/ratings";
import { getUserPreferences } from "@/lib/preferences";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { ArrowLeft, ScrollText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import type { ContentRating } from "@/types";

type BookDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; from?: string }>;
};

function browseBackHref(searchQuery: string): string {
  return searchQuery
    ? `/browse?q=${encodeURIComponent(searchQuery)}`
    : "/browse";
}

function detailBackHref(searchQuery: string, from?: string): {
  href: string;
  label: string;
} {
  if (from === "first-rating") {
    return {
      href: "/onboarding/first-rating",
      label: "Back to First Mark",
    };
  }
  return {
    href: browseBackHref(searchQuery),
    label: "Back to Results",
  };
}

function TomeUnavailable({
  searchQuery,
  reason,
}: {
  searchQuery: string;
  reason: "missing" | "busy";
}) {
  const backHref = browseBackHref(searchQuery);

  return (
    <FantasyPageShell>
      <div className="mx-auto flex max-w-xl flex-col items-center px-6 py-20 text-center sm:py-28">
        <div
          className="w-full max-w-lg px-6 py-12 shadow-[0_18px_48px_rgba(0,0,0,0.4)]"
          style={{
            backgroundImage: "url('/images/parchment.jpg')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            border: "2px solid #8c6b2e",
            borderRadius: "6px",
          }}
        >
          <ScrollText className="mx-auto mb-4 h-9 w-9 text-[#a67c2d]" />
          <h1 className="font-storybook text-2xl font-semibold tracking-[0.06em] text-[#2f1f0f]">
            {reason === "busy"
              ? "The archives are resting"
              : "This tome could not be opened"}
          </h1>
          <p className="mt-3 font-heading text-lg leading-relaxed text-[#3f2a1e]/90">
            {reason === "busy"
              ? "A keeper of volumes is briefly overwhelmed. Return to the shelves and try this book again in a moment."
              : "This shelf-marker led nowhere in the living archives. The volume may have moved, or the seal may be incomplete."}
          </p>
          <Link
            href={backHref}
            className="btn-primary mt-8 inline-flex min-w-[12rem] items-center justify-center gap-2 px-8 py-3 text-sm tracking-[0.14em]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to Results
          </Link>
        </div>
      </div>
    </FantasyPageShell>
  );
}

export async function generateMetadata({
  params,
  searchParams,
}: BookDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const { q } = await searchParams;

  try {
    const book = await getBookById(id, {
      searchHint: q?.trim() || undefined,
    });
    if (!book) {
      return { title: "Tome Unopened | LorePath" };
    }
    return {
      title: `${book.title} | LorePath`,
      description:
        book.description?.slice(0, 160) ??
        `Ratings and details for ${book.title}`,
    };
  } catch {
    return { title: "Book | LorePath" };
  }
}

async function loadViewerState(bookExternalId: string): Promise<{
  user: User | null;
  userPreferences: ContentRating | null;
  userRating: ContentRating | null;
}> {
  if (!isSupabaseConfigured()) {
    return { user: null, userPreferences: null, userRating: null };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, userPreferences: null, userRating: null };
  }

  // During Beta, every signed-in reader gets Match Score + preferences.
  const [userPreferences, userRating] = await Promise.all([
    getUserPreferences(user.id),
    getUserRatingForBook(bookExternalId, user.id),
  ]);

  return { user, userPreferences, userRating };
}

export default async function BookDetailPage({
  params,
  searchParams,
}: BookDetailPageProps) {
  const { id } = await params;
  const { q, from } = await searchParams;
  const searchQuery = q?.trim() ?? "";
  const fromFirstRating = from === "first-rating";

  let book = null;
  try {
    book = await getBookById(id, {
      searchHint: searchQuery || undefined,
    });
  } catch (error) {
    console.error("[books/[id]] getBookById failed:", {
      id,
      q: searchQuery || null,
      message: error instanceof Error ? error.message : String(error),
      status:
        error instanceof RateLimitError
          ? error.status
          : (error as Error & { status?: number })?.status,
    });
    if (error instanceof RateLimitError) {
      return <TomeUnavailable searchQuery={searchQuery} reason="busy" />;
    }
    return <TomeUnavailable searchQuery={searchQuery} reason="missing" />;
  }

  if (!book) {
    return <TomeUnavailable searchQuery={searchQuery} reason="missing" />;
  }

  const [communityRatings, viewer] = await Promise.all([
    getCommunityRatings(id),
    loadViewerState(id),
  ]);

  const { user, userPreferences, userRating } = viewer;
  const back = detailBackHref(searchQuery, from);

  return (
    <FantasyPageShell>
      <TrackOnMount
        key={id}
        event="open_book"
        props={{ book_id: id, source: "detail" }}
      />
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:py-10">
        <Link href={back.href} className="preference-codex-box--nav relative mb-5">
          <ArrowLeft className="h-4 w-4" />
          <span className="relative z-[1] nav-dragon-gold">{back.label}</span>
        </Link>

        <div className="book-detail-tome relative">
          <div className="book-detail-tome-parchment" aria-hidden="true" />
          <CornerFlourish className="pointer-events-none absolute left-1 top-1 z-20 h-12 w-12 text-[#a67c2d]/70 sm:left-2 sm:top-2 sm:h-14 sm:w-14" />
          <CornerFlourish className="pointer-events-none absolute right-1 top-1 z-20 h-12 w-12 rotate-90 text-[#a67c2d]/70 sm:right-2 sm:top-2 sm:h-14 sm:w-14" />
          <CornerFlourish className="pointer-events-none absolute bottom-1 left-1 z-20 h-12 w-12 -rotate-90 text-[#a67c2d]/70 sm:bottom-2 sm:left-2 sm:h-14 sm:w-14" />
          <CornerFlourish className="pointer-events-none absolute bottom-1 right-1 z-20 h-12 w-12 rotate-180 text-[#a67c2d]/70 sm:bottom-2 sm:right-2 sm:h-14 sm:w-14" />

          <div className="book-detail-tome-content relative z-[2]">
            <BookRatingsProvider
              bookId={id}
              initialCommunityRatings={communityRatings}
            >
              <BookInformation
                book={book}
                communityRatings={<LiveCommunityRatings />}
                matchScore={
                  <LiveMatchScore
                    isLoggedIn={!!user}
                    userPreferences={userPreferences}
                  />
                }
                ratingForm={
                  <RatingForm
                    key={id}
                    bookId={id}
                    isLoggedIn={!!user}
                    initialRatings={userRating}
                    returnToFirstRating={fromFirstRating}
                  />
                }
              />
            </BookRatingsProvider>
          </div>
        </div>
      </div>
    </FantasyPageShell>
  );
}
