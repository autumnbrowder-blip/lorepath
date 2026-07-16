import { BookCard } from "@/components/browse/BookCard";
import { FantasyPageShell } from "@/components/theme/FantasyPageShell";
import { searchBooks } from "@/lib/books";
import { decodeAuthorName } from "@/lib/book-links";
import { ArrowLeft, User } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

type AuthorPageProps = {
  params: Promise<{ name: string }>;
};

export async function generateMetadata({
  params,
}: AuthorPageProps): Promise<Metadata> {
  const { name } = await params;
  const authorName = decodeAuthorName(name);

  return {
    title: `${authorName} | LorePath`,
    description: `Books by ${authorName} on LorePath`,
  };
}

export default async function AuthorPage({ params }: AuthorPageProps) {
  const { name } = await params;
  const authorName = decodeAuthorName(name);
  const { books } = await searchBooks(authorName);

  return (
    <FantasyPageShell>
      <div className="mx-auto max-w-5xl px-6 py-12">
        <Link href="/browse" className="preference-codex-box--nav relative mb-8">
          <ArrowLeft className="h-4 w-4" />
          <span className="relative z-[1] nav-dragon-gold">Back to Browse</span>
        </Link>

        <div className="mb-10">
          <div className="section-label nav-dragon-gold">
            <User className="h-4 w-4" />
            Author
          </div>
          <h1 className="page-title">{authorName}</h1>
          <p className="mt-2 font-heading text-lg nav-dragon-gold">
            {books.length > 0
              ? `${books.length} book${books.length !== 1 ? "s" : ""} found`
              : "No books found for this author"}
          </p>
        </div>

        {books.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {books.map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </div>
        ) : (
          <div className="parchment-panel px-6 py-16 text-center">
            <p className="font-heading text-lg text-forest-900/80 dark:text-cream-200/80">
              Try searching on the{" "}
              <Link href="/browse" className="text-accent underline">
                browse page
              </Link>{" "}
              for more results.
            </p>
          </div>
        )}
      </div>
    </FantasyPageShell>
  );
}
