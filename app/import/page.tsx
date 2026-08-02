import { GoodreadsImport } from "@/components/import/GoodreadsImport";
import { FantasyPageShell } from "@/components/theme/FantasyPageShell";
import { getUserRatedBooks } from "@/lib/ratings";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Import Reading List | LorePath",
  description:
    "Upload a Goodreads library CSV and rate books you’ve already read on LorePath.",
};

export default async function ImportPage() {
  if (!isSupabaseConfigured()) {
    redirect("/login?redirect=/import");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/import");
  }

  const ratedBooks = await getUserRatedBooks(user.id);
  const ratedSlugs = ratedBooks.map((book) => book.slug);

  return (
    <FantasyPageShell variant="browse" priority>
      <div className="mx-auto max-w-2xl px-5 pb-20 pt-8 sm:px-6 sm:pt-12">
        <Link href="/profile" className="preference-codex-box--nav relative mb-8">
          <ArrowLeft className="h-4 w-4" />
          <span className="relative z-[1] nav-dragon-gold">Back to Profile</span>
        </Link>

        <header className="mb-8 text-center sm:mb-10">
          <h1 className="font-storybook text-3xl font-normal tracking-[0.05em] nav-dragon-gold sm:text-4xl">
            Import reading list
          </h1>
          <div
            className="mx-auto mt-3 h-px w-40 bg-gradient-to-r from-transparent via-gold-600/70 to-transparent"
            aria-hidden="true"
          />
          <p className="mx-auto mt-4 max-w-lg font-heading text-base leading-relaxed nav-dragon-gold sm:text-lg">
            Carry books you&apos;ve already finished into LorePath and leave
            your marks at your own pace.
          </p>
        </header>

        <GoodreadsImport ratedSlugs={ratedSlugs} />
      </div>
    </FantasyPageShell>
  );
}
