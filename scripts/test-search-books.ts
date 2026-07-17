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

  const { searchBooks } = await import("../lib/books");
  const r = await searchBooks("Dune", 1);
  const bySource = r.books.reduce<Record<string, number>>((acc, b) => {
    acc[b.source] = (acc[b.source] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    JSON.stringify(
      {
        total: r.books.length,
        sourceCounts: r.sourceCounts,
        bySourceAfterFinalize: bySource,
        sample: r.books.slice(0, 10).map((b) => ({
          title: b.title,
          source: b.source,
          id: b.id,
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
