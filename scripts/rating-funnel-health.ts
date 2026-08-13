/**
 * Rating-funnel production health checklist.
 * Run: npx tsx --env-file=.env.local scripts/rating-funnel-health.ts [baseUrl]
 *
 * Default baseUrl: http://localhost:3000
 * Writes: scripts/rating-funnel-health-report.md
 */
import { writeFileSync } from "fs";
import { join } from "path";

const BASE = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const OUT = join(process.cwd(), "scripts", "rating-funnel-health-report.md");

type Check = {
  id: string;
  name: string;
  status: "PASS" | "FAIL" | "WARN" | "SKIP";
  detail: string;
};

const checks: Check[] = [];

function envPresent(name: string): boolean {
  const value = process.env[name]?.trim() ?? "";
  if (!value) return false;
  return !/your-service|your-supabase|changeme|placeholder/i.test(value);
}

function add(check: Check) {
  checks.push(check);
  const mark =
    check.status === "PASS"
      ? "PASS"
      : check.status === "FAIL"
        ? "FAIL"
        : check.status;
  console.log(`${mark.padEnd(4)} ${check.name} — ${check.detail}`);
}

async function probe(
  path: string,
  init?: RequestInit
): Promise<{ status: number; ok: boolean; body: string; json: unknown }> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    redirect: "manual",
    headers: {
      Accept: "application/json, text/html",
      ...(init?.headers ?? {}),
    },
  });
  const body = await response.text();
  let json: unknown = null;
  try {
    json = JSON.parse(body);
  } catch {
    // non-json
  }
  return { status: response.status, ok: response.ok, body, json };
}

async function main() {
  console.log(`Rating funnel health — ${new Date().toISOString()}`);
  console.log(`Base: ${BASE}\n`);

  // --- Env (local process; mirrors Netlify expectations) ---
  add({
    id: "env-supabase-url",
    name: "NEXT_PUBLIC_SUPABASE_URL",
    status: envPresent("NEXT_PUBLIC_SUPABASE_URL") ? "PASS" : "FAIL",
    detail: envPresent("NEXT_PUBLIC_SUPABASE_URL")
      ? "present"
      : "missing — auth + ratings cannot work",
  });
  add({
    id: "env-anon",
    name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    status: envPresent("NEXT_PUBLIC_SUPABASE_ANON_KEY") ? "PASS" : "FAIL",
    detail: envPresent("NEXT_PUBLIC_SUPABASE_ANON_KEY") ? "present" : "missing",
  });
  const probingRemote = !/localhost|127\.0\.0\.1/i.test(BASE);
  const serviceOk =
    envPresent("SUPABASE_SERVICE_ROLE_KEY") ||
    envPresent("SERVICE_ROLE_KEY") ||
    envPresent("SUPABASE_SERVICE_KEY");
  if (probingRemote && !serviceOk) {
    add({
      id: "env-service-role",
      name: "SUPABASE_SERVICE_ROLE_KEY (local process)",
      status: "WARN",
      detail:
        "Not in local .env — verify Netlify Site env has SUPABASE_SERVICE_ROLE_KEY (required for prod rating writes)",
    });
  } else {
    add({
      id: "env-service-role",
      name: "SUPABASE_SERVICE_ROLE_KEY",
      status: serviceOk ? "PASS" : "FAIL",
      detail: serviceOk
        ? "present (required for rating writes)"
        : "MISSING — submitUserRating cannot upsert; users see save errors",
    });
  }

  // --- Public routes ---
  for (const path of ["/", "/browse", "/login", "/register", "/preferences"]) {
    try {
      const res = await probe(path);
      const expected =
        path === "/preferences"
          ? res.status === 307 || res.status === 302 || res.status === 200
          : res.status === 200 || res.status === 307 || res.status === 308;
      add({
        id: `route-${path}`,
        name: `GET ${path}`,
        status: expected ? "PASS" : "FAIL",
        detail: `HTTP ${res.status}`,
      });
    } catch (error) {
      add({
        id: `route-${path}`,
        name: `GET ${path}`,
        status: "FAIL",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // --- Search samples (need browse/search API) ---
  for (const q of ["Fourth Wing", "Tender Is the Flesh", "Divine Rivals"]) {
    try {
      const res = await probe(
        `/api/books/search?q=${encodeURIComponent(q)}&page=1`
      );
      const count =
        res.json &&
        typeof res.json === "object" &&
        Array.isArray((res.json as { books?: unknown[] }).books)
          ? (res.json as { books: unknown[] }).books.length
          : null;
      add({
        id: `search-${q}`,
        name: `Search "${q}"`,
        status:
          res.status === 200 && typeof count === "number" && count > 0
            ? "PASS"
            : res.status === 200 && count === 0
              ? "WARN"
              : "FAIL",
        detail: `HTTP ${res.status}, books=${count ?? "?"}`,
      });
    } catch (error) {
      add({
        id: `search-${q}`,
        name: `Search "${q}"`,
        status: "FAIL",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // --- Anonymous rating POST must 401 ---
  try {
    const fakeId = "ol-OL29226517W";
    const res = await probe(`/api/books/${fakeId}/ratings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sexual_content: 1,
        romance: 2,
        lgbt: 0,
        horror: 1,
        ideology: 0,
        pacing: 3,
      }),
    });
    const errMsg =
      res.json &&
      typeof res.json === "object" &&
      typeof (res.json as { error?: unknown }).error === "string"
        ? (res.json as { error: string }).error
        : "";
    const ok =
      res.status === 401 &&
      /signed in|sign in|unauthorized/i.test(errMsg || res.body);
    add({
      id: "anon-post-rating",
      name: "Anonymous POST /api/books/[id]/ratings",
      status: ok ? "PASS" : "FAIL",
      detail: `HTTP ${res.status}${errMsg ? ` — ${errMsg}` : ""}`,
    });
  } catch (error) {
    add({
      id: "anon-post-rating",
      name: "Anonymous POST /api/books/[id]/ratings",
      status: "FAIL",
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  // --- GET ratings (public community) ---
  try {
    const res = await probe(`/api/books/ol-OL29226517W/ratings`);
    add({
      id: "get-ratings",
      name: "GET /api/books/[id]/ratings",
      status: res.status === 200 ? "PASS" : "FAIL",
      detail: `HTTP ${res.status}`,
    });
  } catch (error) {
    add({
      id: "get-ratings",
      name: "GET /api/books/[id]/ratings",
      status: "FAIL",
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  const files = [
    "components/books/RatingForm.tsx",
    "app/api/books/[id]/ratings/route.ts",
    "lib/ratings.ts",
    "lib/supabase/server.ts",
    "components/books/BookRatingsContext.tsx",
    "components/books/LiveCommunityRatings.tsx",
    "components/auth/SignupPrompt.tsx",
    "components/auth/LoginForm.tsx",
    "components/auth/RegisterForm.tsx",
    "app/books/[id]/page.tsx",
    "components/books/BookInformation.tsx",
    "components/browse/BookCard.tsx",
    "app/api/preferences/route.ts",
    "lib/preferences.ts",
    "app/stats/page.tsx",
    "supabase/migrations/20260717_ratings_rls_complete.sql",
    "supabase/schema.sql",
  ];

  const blockers = [
    {
      rank: 1,
      severity: "CRITICAL",
      title: "Missing SUPABASE_SERVICE_ROLE_KEY in production",
      why: "submitUserRating writes via service role after JWT verify. Without the key, every save fails after signup.",
    },
    {
      rank: 2,
      severity: "HIGH",
      title: "Email confirmation blocks immediate session",
      why: "RegisterForm can create auth.users without a session; user believes they signed up but cannot rate until confirm/disable Confirm email.",
    },
    {
      rank: 3,
      severity: "HIGH",
      title: "Signup without book redirect lands on /profile",
      why: "Nav Register defaults redirect=/profile → Preferences onboarding. Users who never opened a book from SignupPrompt on detail never return to rate that tome.",
    },
    {
      rank: 4,
      severity: "MEDIUM",
      title: "Mobile rating form below the fold",
      why: "BookInformation stacks description then Match Score → Community → RatingForm. First-time raters may not scroll to Inscribe.",
    },
    {
      rank: 5,
      severity: "MEDIUM",
      title: "Soft signup copy vs rate intent",
      why: "SignupPrompt emphasizes account benefits, not 'Sign in to leave marks' as the primary verb — weaker conversion at the rating panel.",
    },
  ];

  const pass = checks.filter((c) => c.status === "PASS").length;
  const fail = checks.filter((c) => c.status === "FAIL").length;
  const warn = checks.filter((c) => c.status === "WARN").length;

  const md = [
    `# LorePath rating funnel health report`,
    ``,
    `Generated: ${new Date().toISOString()}`,
    `Base URL: ${BASE}`,
    ``,
    `## Summary`,
    ``,
    `- PASS: ${pass}`,
    `- FAIL: ${fail}`,
    `- WARN: ${warn}`,
    ``,
    `## Runtime checks`,
    ``,
    `| Status | Check | Detail |`,
    `|---|---|---|`,
    ...checks.map(
      (c) => `| ${c.status} | ${c.name.replace(/\|/g, "/")} | ${c.detail.replace(/\|/g, "/")} |`
    ),
    ``,
    `## Files involved in rating save`,
    ``,
    ...files.map((f) => `- \`${f}\``),
    ``,
    `## Top 5 blockers (ranked)`,
    ``,
    ...blockers.map(
      (b) =>
        `${b.rank}. **[${b.severity}] ${b.title}**  \n   ${b.why}`
    ),
    ``,
    `## Expected anonymous POST behavior`,
    ``,
    `\`POST /api/books/[id]/ratings\` without auth must return **401** with message containing "signed in".`,
    ``,
    `## Schema note`,
    ``,
    `Ratings columns are \`sexual_content, romance, lgbt, horror, ideology, pacing\` (not \`spice_level\` / \`themes\`). UI "spice" maps to \`sexual_content\`.`,
    ``,
  ].join("\n");

  writeFileSync(OUT, md, "utf8");
  console.log(`\nWrote ${OUT}`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
