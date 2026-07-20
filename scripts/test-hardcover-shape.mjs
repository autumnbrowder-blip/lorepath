import { readFileSync } from "node:fs";

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

const token = process.env.HARDCOVER_API_TOKEN.replace(/^Bearer\s+/i, "").trim();

const res = await fetch("https://api.hardcover.app/v1/graphql", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    query: `query { search(query: "xyznonexistentbookzzz", query_type: "Book", per_page: 5, page: 1) { error ids results } }`,
  }),
});
const payload = await res.json();
const results = payload.data?.search?.results;
console.log("resultsType=", typeof results);
if (typeof results === "object" && results) {
  console.log("resultsKeys=", Object.keys(results));
  console.log("found=", results.found);
  console.log("hitsLen=", results.hits?.length);
}
console.log("ids=", payload.data?.search?.ids);
console.log("error=", payload.data?.search?.error);

// Also test without Authorization capitalisation
const res2 = await fetch("https://api.hardcover.app/v1/graphql", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    query: `query { __typename }`,
  }),
});
console.log("lowercase auth status=", res2.status);
