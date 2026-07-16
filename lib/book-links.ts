export function getIsbnUrl(isbn: string): string {
  const digits = isbn.replace(/\D/g, "");
  return `https://openlibrary.org/isbn/${digits}`;
}

export function getAuthorPageUrl(author: string): string {
  return `/authors/${encodeURIComponent(author)}`;
}

/** Browse page filtered by genre tag (subject/genre search mode). */
export function getGenreBrowseUrl(genre: string): string {
  const q = encodeURIComponent(genre.trim());
  return `/browse?q=${q}&mode=genre`;
}

export function decodeAuthorName(slug: string): string {
  return decodeURIComponent(slug);
}
