import type { BookSource } from "@/types/book";

/** Catalog source encoded in a route/slug. No database I/O. */
export function sourceFromBookSlug(slug: string): BookSource {
  if (slug.startsWith("ol-") || slug.startsWith("openlibrary-")) {
    return "openlibrary";
  }
  if (slug.startsWith("gutenberg-") || slug.startsWith("gutendex-")) {
    return "gutendex";
  }
  if (slug.startsWith("isbndb-")) return "isbndb";
  if (slug.startsWith("bigbook-")) return "bigbook";
  if (slug.startsWith("nyt-")) return "nyt";
  return "google";
}
