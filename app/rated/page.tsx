import { FantasyPageShell } from "@/components/theme/FantasyPageShell";
import { getUserRatedBooks } from "@/lib/ratings";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { BookOpen, LogIn } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Your Rated Tomes | LorePath",
  description: "Books you have rated on LorePath.",
};

export default async function RatedTomesPage() {
  let user = null;
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();
    user = currentUser;
  }

  if (!user) {
    return (
      <FantasyPageShell>
        <div className="mx-auto max-w-3xl px-6 py-16 text-center">
          <div className="ornate-panel mx-auto max-w-md px-6 py-10">
            <LogIn className="mx-auto mb-4 h-8 w-8 text-accent" />
            <h1 className="page-title">Your Rated Tomes</h1>
            <p className="page-subtitle">
              Sign in to revisit the books you have marked.
            </p>
            <Link href="/login" className="btn-primary mt-8">
              Sign in to the Archives
            </Link>
          </div>
        </div>
      </FantasyPageShell>
    );
  }

  const ratedBooks = await getUserRatedBooks(user.id);

  return (
    <FantasyPageShell>
      <div className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
        <div className="mb-10 text-center sm:text-left">
          <p className="section-label justify-center sm:justify-start">
            <BookOpen className="h-3.5 w-3.5" />
            Personal archive
          </p>
          <h1 className="page-title">Your Rated Tomes</h1>
          <p className="page-subtitle">
            {ratedBooks.length === 0
              ? "No ratings yet — open a book and leave your mark."
              : `${ratedBooks.length} tome${ratedBooks.length === 1 ? "" : "s"} you have marked.`}
          </p>
        </div>

        {ratedBooks.length === 0 ? (
          <div className="parchment-panel px-6 py-12 text-center">
            <p className="font-heading text-lg text-forest-900/80 dark:text-cream-200/80">
              Your shelves are waiting for their first inscription.
            </p>
            <Link href="/browse" className="btn-primary mt-6">
              Browse the Archives
            </Link>
          </div>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {ratedBooks.map((item) => (
              <li key={item.ratingId}>
                <Link
                  href={`/books/${item.slug}`}
                  className="tome-card flex h-full gap-4 p-4 pl-5"
                >
                  <div className="absolute bottom-0 left-0 top-0 w-1.5 bg-gradient-to-b from-gold-500/50 via-gold-700/30 to-gold-900/40" />
                  <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded-sm border border-gold-600/30 bg-surface">
                    {item.coverImageUrl ? (
                      <Image
                        src={item.coverImageUrl}
                        alt={`Cover of ${item.title}`}
                        fill
                        className="object-cover"
                        sizes="80px"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted">
                        <BookOpen className="h-6 w-6" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-heading text-lg font-semibold leading-snug text-foreground">
                      {item.title}
                    </h2>
                    {item.author && (
                      <p className="mt-1 text-sm text-muted">by {item.author}</p>
                    )}
                    <p className="mt-3 font-display text-[10px] uppercase tracking-wide text-accent/80">
                      Rated{" "}
                      {new Date(item.createdAt).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </FantasyPageShell>
  );
}
