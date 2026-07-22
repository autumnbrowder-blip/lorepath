import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  createAuthenticatedClient,
  createClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import type { ContentRating } from "@/types";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

export type AdminRecentRating = ContentRating & {
  id: string;
  created_at: string;
  book_title: string;
};

export type AdminDashboardStats = {
  totalUsers: number;
  totalRatings: number;
  booksWithRatings: number;
  recentRatings: AdminRecentRating[];
};

function coerceIsAdmin(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

/** Comma-separated emails in ADMIN_EMAILS (server-only) may access /admin. */
function emailIsBootstrapAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw = process.env.ADMIN_EMAILS?.trim() ?? "";
  if (!raw) return false;
  const needle = email.trim().toLowerCase();
  return raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .includes(needle);
}

function dbClientForAdminReads(): SupabaseClient {
  const admin = createServiceRoleClient();
  // Prefer service role so is_admin / aggregates are not blocked by RLS quirks.
  if (!("error" in admin)) {
    return admin.supabase;
  }
  // Fallback: caller must already have a session-scoped client available.
  throw new Error("SERVICE_ROLE_UNAVAILABLE");
}

/**
 * Resolve whether this auth user is an admin.
 * Primary: profiles.is_admin. Bootstrap: ADMIN_EMAILS env (then sync flag when possible).
 */
export async function userIsAdmin(user: User): Promise<boolean> {
  const bootstrap = emailIsBootstrapAdmin(user.email);

  let db: SupabaseClient;
  try {
    db = dbClientForAdminReads();
  } catch {
    // No service role — read with cookie/JWT client.
    const auth = await createAuthenticatedClient();
    db = "error" in auth ? await createClient() : auth.supabase;
  }

  const { data: profile, error } = await db
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!error && coerceIsAdmin(profile?.is_admin)) {
    return true;
  }

  // Column missing / read failed / flag false — allow bootstrap emails.
  if (bootstrap) {
    if (!error) {
      // Best-effort: stamp is_admin so future checks use the DB flag.
      void Promise.resolve(
        db.from("profiles").update({ is_admin: true }).eq("id", user.id)
      ).catch(() => undefined);
    }
    return true;
  }

  return false;
}

/**
 * Server-only gate for /admin.
 * Non-admins and logged-out users go to "/" (never /login) so the route stays hidden.
 */
export async function requireAdmin(): Promise<{ user: User }> {
  noStore();

  if (!isSupabaseConfigured()) {
    redirect("/");
  }

  const auth = await createAuthenticatedClient();
  if ("error" in auth) {
    // Cookie-only fallback (same pattern as other portal pages).
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      redirect("/");
    }
    if (!(await userIsAdmin(user))) {
      redirect("/");
    }
    return { user };
  }

  if (!(await userIsAdmin(auth.user))) {
    redirect("/");
  }

  return { user: auth.user };
}

function mapRecentRating(row: {
  id: unknown;
  created_at: unknown;
  sexual_content: unknown;
  romance: unknown;
  lgbt: unknown;
  horror: unknown;
  ideology: unknown;
  pacing: unknown;
  books: unknown;
}): AdminRecentRating {
  const bookRelation = row.books as
    | { title?: string | null }
    | { title?: string | null }[]
    | null;
  const book = Array.isArray(bookRelation) ? bookRelation[0] : bookRelation;
  const title = book?.title;

  return {
    id: String(row.id),
    created_at: String(row.created_at),
    sexual_content: Number(row.sexual_content) || 0,
    romance: Number(row.romance) || 0,
    lgbt: Number(row.lgbt) || 0,
    horror: Number(row.horror) || 0,
    ideology: Number(row.ideology) || 0,
    pacing: Number(row.pacing) || 0,
    book_title:
      typeof title === "string" && title.trim() ? title : "Untitled tome",
  };
}

/**
 * Admin dashboard payload. Always runs requireAdmin first.
 * Stats are loaded with the service role when available.
 */
export async function getAdminDashboardStats(): Promise<AdminDashboardStats> {
  await requireAdmin();
  noStore();

  let supabase: SupabaseClient;
  try {
    supabase = dbClientForAdminReads();
  } catch {
    supabase = await createClient();
  }

  const [usersResult, ratingsResult, recentResult, ratedBookRowsResult] =
    await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("ratings").select("id", { count: "exact", head: true }),
      supabase
        .from("ratings")
        .select(
          `
          id,
          created_at,
          sexual_content,
          romance,
          lgbt,
          horror,
          ideology,
          pacing,
          books (
            title
          )
        `
        )
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.from("ratings").select("book_id"),
    ]);

  const booksWithRatings = new Set(
    (ratedBookRowsResult.data ?? [])
      .map((row) => row.book_id as string | null)
      .filter((id): id is string => Boolean(id))
  ).size;

  return {
    totalUsers: usersResult.count ?? 0,
    totalRatings: ratingsResult.count ?? 0,
    booksWithRatings,
    recentRatings: (recentResult.data ?? []).map(mapRecentRating),
  };
}
