import { readFileSync } from "node:fs";

async function main() {
  const raw = readFileSync(".env.local", "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }

  console.log(
    "tokenConfigured=",
    Boolean(process.env.HARDCOVER_API_TOKEN?.trim())
  );

  const { searchHardcover } = await import("../lib/hardcover");
  const books = await searchHardcover("Dune");
  console.log(
    JSON.stringify(
      {
        count: books.length,
        sample: books.slice(0, 8).map((b) => ({
          id: b.id,
          title: b.title,
          source: b.source,
          hasDesc: Boolean(b.description?.trim()),
          hasCover: Boolean(b.coverUrl?.trim()),
          authors: b.authors.slice(0, 2),
        })),
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
