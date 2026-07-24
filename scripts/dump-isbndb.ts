/** Dump raw title/title_long/authors from ISBNdb for a query (no tokens printed). */
async function main() {
  const key = process.env.ISBNDB_API_KEY?.trim();
  if (!key) throw new Error("no key");
  const q = process.argv[2] ?? "The Wren in the Holly Library";
  const res = await fetch(
    `https://api2.isbndb.com/books/${encodeURIComponent(q)}?page=1&pageSize=20`,
    { headers: { Accept: "application/json", Authorization: key } }
  );
  const data = (await res.json()) as {
    books?: Array<{
      title?: string;
      title_long?: string;
      authors?: string[] | string;
      isbn13?: string;
    }>;
  };
  for (const b of data.books ?? []) {
    console.log(
      JSON.stringify({
        title: b.title,
        title_long: b.title_long,
        authors: b.authors,
        isbn13: b.isbn13,
      })
    );
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
