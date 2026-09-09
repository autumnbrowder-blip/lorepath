import { getAvatarOption } from "@/lib/avatars";
import {
  normalizeAuthorForDedupe,
  normalizeTitleForDedupe,
} from "@/lib/book-utils";
import {
  getPageViewStats,
  type PageViewStats,
} from "@/lib/page-views";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  createAuthenticatedClient,
  createClient,
  createServiceRoleClient,
  getVerifiedUser,
  hasRequestAuthCookie,
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

export type AdminBookRatingRow = {
  bookId: string;
  title: string;
  author: string | null;
  /** Route identity / books.slug (not books.id). */
  slug: string;
  /** Live COUNT(*) of public.ratings rows for this books.id. */
  ratingsCount: number;
  /** Live COUNT(DISTINCT rated_by) — labeled "unique raters" in the UI. */
  distinctUsers: number;
  /** Same normalized title+author as at least one other rated book row. */
  isDuplicateWork: boolean;
  /** Other books.id values that share the same title+author key. */
  duplicateBookIds: string[];
  duplicateSlugs: string[];
};

export type AdminDashboardStats = {
  totalUsers: number;
  totalRatings: number;
  booksWithRatings: number;
  bookRatings: AdminBookRatingRow[];
  recentRatings: AdminRecentRating[];
  users: AdminUserRow[];
  pageViews: PageViewStats;
};

const RATINGS_PAGE_SIZE = 1000;
const BOOKS_IN_CHUNK = 100;

type RatingIdentityRow = {
  book_id: string;
  rated_by: string | null;
};

type BookIdentityRow = {
  id: string;
  title: string | null;
  author: string | null;
  slug: string | null;
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
    if (!(await hasRequestAuthCookie())) return false;
    const auth = await getVerifiedUser();
    if ("error" in auth) return false;
    return userIsAdmin(auth.user);
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

  const auth = await getVerifiedUser();
  if ("error" in auth) {
    redirect("/");
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

function workDedupeKey(title: string, author: string | null): string | null {
  const normalizedTitle = normalizeTitleForDedupe(title);
  if (!normalizedTitle) return null;
  const normalizedAuthor = author ? normalizeAuthorForDedupe(author) : "";
  return normalizedAuthor
    ? `${normalizedTitle}|${normalizedAuthor}`
    : `title:${normalizedTitle}`;
}

/**
 * Live identity columns from public.ratings — COUNT(*) later groups by
 * book_id. Never books.rating_count, never community_averages.
 */
async function loadLiveRatingIdentities(
  supabase: SupabaseClient
): Promise<RatingIdentityRow[]> {
  const rows: RatingIdentityRow[] = [];

  for (let from = 0; from < 50_000; from += RATINGS_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("ratings")
      .select("book_id, rated_by")
      .range(from, from + RATINGS_PAGE_SIZE - 1);

    if (error) {
      console.error("[admin] live ratings COUNT(*) query failed:", error.message);
      break;
    }
    if (!data?.length) break;

    for (const row of data) {
      const bookId = typeof row.book_id === "string" ? row.book_id : "";
      if (!bookId) continue;
      rows.push({
        book_id: bookId,
        rated_by: typeof row.rated_by === "string" ? row.rated_by : null,
      });
    }

    if (data.length < RATINGS_PAGE_SIZE) break;
  }

  return rows;
}

async function loadBooksByIds(
  supabase: SupabaseClient,
  bookIds: string[]
): Promise<Map<string, BookIdentityRow>> {
  const map = new Map<string, BookIdentityRow>();
  if (bookIds.length === 0) return map;

  for (let i = 0; i < bookIds.length; i += BOOKS_IN_CHUNK) {
    const chunk = bookIds.slice(i, i + BOOKS_IN_CHUNK);
    const { data, error } = await supabase
      .from("books")
      .select("id, title, author, slug")
      .in("id", chunk);

    if (error) {
      console.error("[admin] books lookup for rating counts failed:", error.message);
      continue;
    }

    for (const row of data ?? []) {
      const id = typeof row.id === "string" ? row.id : "";
      if (!id) continue;
      map.set(id, {
        id,
        title: typeof row.title === "string" ? row.title : null,
        author: typeof row.author === "string" ? row.author : null,
        slug: typeof row.slug === "string" ? row.slug : null,
      });
    }
  }

  return map;
}

function aggregateBookRatingRows(
  ratingRows: RatingIdentityRow[],
  booksById: Map<string, BookIdentityRow>
): AdminBookRatingRow[] {
  const byBook = new Map<
    string,
    { ratingsCount: number; users: Set<string> }
  >();

  for (const row of ratingRows) {
    const current = byBook.get(row.book_id) ?? {
      ratingsCount: 0,
      users: new Set<string>(),
    };
    current.ratingsCount += 1;
    if (row.rated_by) current.users.add(row.rated_by);
    byBook.set(row.book_id, current);
  }

  const draft: AdminBookRatingRow[] = [];
  const siblingsByKey = new Map<string, string[]>();

  for (const [bookId, counts] of Array.from(byBook.entries())) {
    const book = booksById.get(bookId);
    const title =
      book?.title && book.title.trim() ? book.title.trim() : "Untitled tome";
    const author =
      book?.author && book.author.trim() ? book.author.trim() : null;
    const slug = book?.slug?.trim() || "—";
    const key = workDedupeKey(title, author);

    draft.push({
      bookId,
      title,
      author,
      slug,
      ratingsCount: counts.ratingsCount,
      distinctUsers: counts.users.size,
      isDuplicateWork: false,
      duplicateBookIds: [],
      duplicateSlugs: [],
    });

    if (key) {
      const group = siblingsByKey.get(key) ?? [];
      group.push(bookId);
      siblingsByKey.set(key, group);
    }
  }

  const bookById = new Map(draft.map((row) => [row.bookId, row]));
  for (const ids of Array.from(siblingsByKey.values())) {
    if (ids.length < 2) continue;
    for (const id of ids) {
      const row = bookById.get(id);
      if (!row) continue;
      const others = ids.filter((otherId) => otherId !== id);
      row.isDuplicateWork = true;
      row.duplicateBookIds = others;
      row.duplicateSlugs = others.map(
        (otherId) => bookById.get(otherId)?.slug ?? "—"
      );
    }
  }

  draft.sort((a, b) => {
    if (b.ratingsCount !== a.ratingsCount) return b.ratingsCount - a.ratingsCount;
    const titleCmp = a.title.localeCompare(b.title);
    if (titleCmp !== 0) return titleCmp;
    return a.bookId.localeCompare(b.bookId);
  });

  return draft;
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
    liveRatingIdentities,
    recentResult,
    profilesResult,
    pageViews,
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    // Totals: live COUNT(*) from public.ratings (head), not books.rating_count.
    supabase.from("ratings").select("id", { count: "exact", head: true }),
    loadLiveRatingIdentities(supabase),
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
    // Registered users — newest first (emails joined from auth.admin below).
    supabase
      .from("profiles")
      .select(
        "id, display_name, username, avatar_key, is_subscriber, is_admin, created_at"
      )
      .order("created_at", { ascending: false }),
    getPageViewStats(supabase),
  ]);

  const bookIds = Array.from(
    new Set(liveRatingIdentities.map((row) => row.book_id))
  );
  const booksById = await loadBooksByIds(supabase, bookIds);
  const bookRatings = aggregateBookRatingRows(liveRatingIdentities, booksById);

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
    totalRatings: ratingsResult.count ?? liveRatingIdentities.length,
    booksWithRatings: bookRatings.length,
    bookRatings,
    recentRatings: (recentResult.data ?? []).map(mapRecentRating),
    users,
    pageViews,
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
