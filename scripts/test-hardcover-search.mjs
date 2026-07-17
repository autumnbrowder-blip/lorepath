import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Load .env.local without printing secrets
const envPath = resolve(process.cwd(), ".env.local");
try {
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
} catch {
  console.error("Could not read .env.local");
  process.exit(1);
}

const token = process.env.HARDCOVER_API_TOKEN?.trim();
if (!token) {
  console.error("HARDCOVER_API_TOKEN missing");
  process.exit(1);
}
const cleanToken = token.replace(/^Bearer\s+/i, "").trim();
console.log("tokenPresent=true len=" + cleanToken.length);

const query = `
  query SearchBooks($query: String!) {
    search(
      query: $query,
      query_type: "Book",
      per_page: 20,
      page: 1,
      fields: "title,author_names,isbns,series_names,alternative_titles",
      weights: "5,3,5,1,1"
    ) {
      error
      ids
      results
    }
  }
`;

const res = await fetch("https://api.hardcover.app/v1/graphql", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    authorization: `Bearer ${cleanToken}`,
  },
  body: JSON.stringify({ query, variables: { query: "Dune" } }),
});

console.log("httpStatus=" + res.status);
const payload = await res.json();
if (payload.errors?.length) {
  console.error("graphqlErrors=", JSON.stringify(payload.errors).slice(0, 800));
}
const search = payload.data?.search;
console.log("searchError=", search?.error ?? null);
console.log("idsCount=", Array.isArray(search?.ids) ? search.ids.length : 0);
console.log("idsSample=", Array.isArray(search?.ids) ? search.ids.slice(0, 5) : null);

let results = search?.results;
if (typeof results === "string") {
  try {
    results = JSON.parse(results);
  } catch {
    results = null;
  }
}
const hits = results?.hits ?? [];
console.log("hitsCount=", hits.length);
console.log("found=", results?.found ?? null);

const docs = hits.map((h) => h.document).filter(Boolean);
let withDesc = 0;
let withCover = 0;
let withBoth = 0;
let withIdTitle = 0;
for (const d of docs) {
  const hasId = d.id != null;
  const hasTitle = Boolean(d.title?.trim?.() || d.title);
  const hasDesc = Boolean(String(d.description ?? "").trim());
  const cover =
    typeof d.image === "string"
      ? d.image
      : d.image?.url ?? null;
  const hasCover = Boolean(String(cover ?? "").trim());
  if (hasId && hasTitle) withIdTitle++;
  if (hasDesc) withDesc++;
  if (hasCover) withCover++;
  if (hasDesc && hasCover) withBoth++;
}
console.log(
  JSON.stringify(
    {
      withIdTitle,
      withDesc,
      withCover,
      withBoth,
      sample: docs.slice(0, 3).map((d) => ({
        id: d.id,
        title: d.title,
        hasDesc: Boolean(String(d.description ?? "").trim()),
        hasCover: Boolean(
          String(
            (typeof d.image === "string" ? d.image : d.image?.url) ?? ""
          ).trim()
        ),
        author_names: d.author_names?.slice?.(0, 2),
        imageType: typeof d.image,
        imageKeys: d.image && typeof d.image === "object" ? Object.keys(d.image) : null,
      })),
    },
    null,
    2
  )
);

// Hydrate first few ids
const ids = (search?.ids ?? []).slice(0, 5).map(Number).filter((n) => n > 0);
if (ids.length) {
  const hydrateRes = await fetch("https://api.hardcover.app/v1/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authorization: `Bearer ${cleanToken}`,
    },
    body: JSON.stringify({
      query: `
        query BooksByIds($ids: [Int!]!) {
          books(where: { id: { _in: $ids } }, limit: 20) {
            id title description pages release_year
            image { url }
            contributions { author { name } }
            cached_tags
          }
        }
      `,
      variables: { ids },
    }),
  });
  const hydratePayload = await hydrateRes.json();
  if (hydratePayload.errors?.length) {
    console.error(
      "hydrateErrors=",
      JSON.stringify(hydratePayload.errors).slice(0, 800)
    );
  }
  const books = hydratePayload.data?.books ?? [];
  console.log(
    "hydrateCount=" +
      books.length +
      " hydrateSample=" +
      JSON.stringify(
        books.slice(0, 3).map((b) => ({
          id: b.id,
          title: b.title,
          hasDesc: Boolean(String(b.description ?? "").trim()),
          hasCover: Boolean(b.image?.url),
          descLen: String(b.description ?? "").trim().length,
        }))
      )
  );
}
