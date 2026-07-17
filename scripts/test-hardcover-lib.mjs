import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

// Load .env.local
const envPath = resolve(process.cwd(), ".env.local");
const raw = readFileSync(envPath, "utf8");
for (const line of raw.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq < 0) continue;
  const key = trimmed.slice(0, eq).trim();
  let val = trimmed.slice(eq + 1).trim();
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

// Use tsx loader via dynamic import of the TS file through a child approach:
// Write a tiny runner that uses next's path aliases is hard; call fetch path
// mirroring parseHardcoverSearchHit logic by importing via tsx CLI separately.

const { spawnSync } = await import("node:child_process");
const result = spawnSync(
  "npx",
  [
    "--yes",
    "tsx",
    "--eval",
    `
import { readFileSync } from "node:fs";
const raw = readFileSync(".env.local","utf8");
for (const line of raw.split(/\\r?\\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq < 0) continue;
  const key = t.slice(0, eq).trim();
  let val = t.slice(eq + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1,-1);
  if (!(key in process.env)) process.env[key] = val;
}
const mod = await import("./lib/hardcover.ts");
const books = await mod.searchHardcover("Dune");
console.log(JSON.stringify({
  count: books.length,
  sample: books.slice(0, 8).map(b => ({
    id: b.id,
    title: b.title,
    source: b.source,
    hasDesc: Boolean(b.description?.trim()),
    hasCover: Boolean(b.coverUrl?.trim()),
    authors: b.authors.slice(0,2),
  })),
}, null, 2));
`,
  ],
  { cwd: process.cwd(), encoding: "utf8", shell: true, env: process.env }
);
console.log("stdout:\n" + result.stdout);
console.log("stderr:\n" + result.stderr);
console.log("status=" + result.status);
