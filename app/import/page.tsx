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
      <div className="mx-auto max-w-2xl px-5 py-10 sm:px-6 sm:py-14">
        <Link href="/profile" className="preference-codex-box--nav relative mb-8">
          <ArrowLeft className="h-4 w-4" />
          <span className="relative z-[1] nav-dragon-gold">Back to Profile</span>
        </Link>

        <header className="mb-8 text-center sm:mb-10 sm:text-left">
          <h1 className="page-title nav-dragon-gold">Import reading list</h1>
          <p className="mt-2 font-heading text-lg nav-dragon-gold">
            Carry books you&apos;ve already finished into LorePath and leave
            your marks at your own pace.
          </p>
        </header>

        <GoodreadsImport ratedSlugs={ratedSlugs} />
      </div>
    </FantasyPageShell>
  );
}
