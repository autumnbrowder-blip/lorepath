import { parseGoodreadsCsv } from "@/lib/goodreads-csv";
import { matchGoodreadsRows } from "@/lib/goodreads-import";
import { getUserRatedBooks } from "@/lib/ratings";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Matching many ISBN/title lookups can take a while. */
export const maxDuration = 60;

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

function warmError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return warmError("Sign in to import your reading list.", 401);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return warmError("Sign in to import your reading list.", 401);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return warmError(
      "We couldn’t read that upload. Try choosing the file again.",
      400
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return warmError("Please choose a Goodreads CSV file to upload.", 400);
  }

  const name = (file.name || "").toLowerCase();
  const type = (file.type || "").toLowerCase();
  const looksCsv =
    name.endsWith(".csv") ||
    type.includes("csv") ||
    type === "text/plain" ||
    type === "application/vnd.ms-excel";

  if (!looksCsv) {
    return warmError(
      "Only CSV scrolls are welcome here — export your library from Goodreads and try again.",
      400
    );
  }

  if (file.size <= 0) {
    return warmError(
      "That scroll looks empty. Try exporting again from Goodreads.",
      400
    );
  }

  if (file.size > MAX_BYTES) {
    return warmError(
      "That file is a bit too large for the archives. Try a smaller export (under 2 MB).",
      400
    );
  }

  let text: string;
  try {
    text = await file.text();
  } catch {
    return warmError(
      "The parchment wouldn’t open. Please try uploading once more.",
      400
    );
  }

  let rows;
  try {
    ({ rows } = parseGoodreadsCsv(text));
  } catch (err) {
    return warmError(
      err instanceof Error
        ? err.message
        : "We couldn’t read that CSV. Please use a Goodreads library export.",
      400
    );
  }

  const ratedBooks = await getUserRatedBooks(user.id);
  const ratedSlugs = new Set(ratedBooks.map((b) => b.slug));

  const result = await matchGoodreadsRows(rows, ratedSlugs);

  return NextResponse.json({
    matched: result.matched,
    unmatched: result.unmatched,
    stats: result.stats,
  });
}
