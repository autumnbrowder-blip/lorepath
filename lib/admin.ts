import { getAvatarOption } from "@/lib/avatars";
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

export type AdminUserRow = {
  id: string;
  name: string;
  email: string | null;
  emailNote: string | null;
  avatarKey: string | null;
  avatarLabel: string;
  clan: string;
  isSubscriber: boolean;
  isAdmin: boolean;
  createdAt: string;
};

export type AdminDashboardStats = {
  totalUsers: number;
  totalRatings: number;
  booksWithRatings: number;
  recentRatings: AdminRecentRating[];
  users: AdminUserRow[];
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
 * Allow if profiles.is_admin OR email is in ADMIN_EMAILS.
 */
export async function userIsAdmin(user: User): Promise<boolean> {
  // Fast path: env bootstrap (works even if the is_admin column is missing).
  if (emailIsBootstrapAdmin(user.email)) {
    let db: SupabaseClient | null = null;
    try {
      db = dbClientForAdminReads();
    } catch {
      const auth = await createAuthenticatedClient();
      db = "error" in auth ? await createClient() : auth.supabase;
    }
    // Best-effort: stamp the DB flag for next time.
    void Promise.resolve(
      db.from("profiles").update({ is_admin: true }).eq("id", user.id)
    ).catch(() => undefined);
    return true;
  }

  let db: SupabaseClient;
  try {
    db = dbClientForAdminReads();
  } catch {
    const auth = await createAuthenticatedClient();
    db = "error" in auth ? await createClient() : auth.supabase;
  }

  const { data: profile, error } = await db
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    return false;
  }

  return coerceIsAdmin(profile?.is_admin);
}

/**
 * Soft admin check for public routes/APIs.
 * Returns false when logged out, misconfigured, or not an admin — never redirects.
 */
export async function sessionUserIsAdmin(): Promise<boolean> {
  noStore();

  if (!isSupabaseConfigured()) {
    return false;
  }

  try {
    const auth = await createAuthenticatedClient();
    if (!("error" in auth)) {
      return userIsAdmin(auth.user);
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;
    return userIsAdmin(user);
  } catch {
    return false;
  }
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
 * Stats + user directory are loaded with the service role when available.
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

  const [
    usersResult,
    ratingsResult,
    recentResult,
    ratedBookRowsResult,
    profilesResult,
  ] = await Promise.all([
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
    // Registered users — newest first (emails joined from auth.admin below).
    supabase
      .from("profiles")
      .select(
        "id, display_name, username, avatar_key, is_subscriber, is_admin, created_at"
      )
      .order("created_at", { ascending: false }),
  ]);

  const booksWithRatings = new Set(
    (ratedBookRowsResult.data ?? [])
      .map((row) => row.book_id as string | null)
      .filter((id): id is string => Boolean(id))
  ).size;

  const emailById = await loadAuthEmailMap(supabase);

  const users: AdminUserRow[] = (profilesResult.data ?? []).map((row) => {
    const displayName =
      typeof row.display_name === "string" ? row.display_name.trim() : "";
    const username =
      typeof row.username === "string" ? row.username.trim() : "";
    const name = displayName || username || "Unnamed traveler";

    const avatarKey =
      typeof row.avatar_key === "string" && row.avatar_key.trim()
        ? row.avatar_key.trim()
        : null;
    const avatar = getAvatarOption(avatarKey);

    const email = emailById.get(String(row.id)) ?? null;
    const isSubscriber =
      row.is_subscriber === true ||
      String(row.is_subscriber).toLowerCase() === "true";

    return {
      id: String(row.id),
      name,
      email,
      emailNote: email
        ? null
        : "Email not accessible (auth.users requires service role)",
      avatarKey,
      avatarLabel: avatar.label,
      clan: avatar.clan,
      isSubscriber,
      isAdmin: coerceIsAdmin(row.is_admin),
      createdAt: String(row.created_at ?? ""),
    };
  });

  return {
    totalUsers: usersResult.count ?? users.length,
    totalRatings: ratingsResult.count ?? 0,
    booksWithRatings,
    recentRatings: (recentResult.data ?? []).map(mapRecentRating),
    users,
  };
}

/**
 * Page through auth.users via the Admin API (service role only).
 * Returns an empty map when the service role key is missing.
 */
async function loadAuthEmailMap(
  supabase: SupabaseClient
): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  // auth.admin only works with the service role client.
  if (typeof supabase.auth.admin?.listUsers !== "function") {
    return map;
  }

  const perPage = 200;
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error || !data?.users?.length) {
      break;
    }

    for (const authUser of data.users) {
      if (authUser.id && authUser.email) {
        map.set(authUser.id, authUser.email);
      }
    }

    if (data.users.length < perPage) {
      break;
    }
  }

  return map;
}
