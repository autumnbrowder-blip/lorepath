import { getSessionUser } from "@/lib/preferences";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  createServiceRoleClient,
  getBearerToken,
} from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Permanently deletes the authenticated user via the service role.
 * Profile, preferences, and ratings cascade from auth.users → profiles
 * (ON DELETE CASCADE). Client cannot call auth.admin with the anon key.
 */
export async function DELETE(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase is not configured." },
      { status: 503 }
    );
  }

  const session = await getSessionUser({
    accessToken: getBearerToken(request),
  });
  if ("error" in session) {
    return NextResponse.json(
      { error: session.error, code: session.code },
      { status: 401 }
    );
  }

  const admin = createServiceRoleClient();
  if ("error" in admin) {
    return NextResponse.json({ error: admin.error }, { status: 503 });
  }

  const userId = session.user.id;

  // Defense in depth: remove app rows first if cascades are missing in an
  // older environment. Cascades from profiles handle ratings + preferences.
  const { error: prefsError } = await admin.supabase
    .from("user_preferences")
    .delete()
    .eq("user_id", userId);
  if (prefsError && !/does not exist|schema cache/i.test(prefsError.message)) {
    console.error("[account/delete] preferences cleanup:", prefsError.message);
  }

  const { error: ratingsError } = await admin.supabase
    .from("ratings")
    .delete()
    .eq("rated_by", userId);
  if (
    ratingsError &&
    !/does not exist|schema cache/i.test(ratingsError.message)
  ) {
    console.error("[account/delete] ratings cleanup:", ratingsError.message);
  }

  const { error: profileError } = await admin.supabase
    .from("profiles")
    .delete()
    .eq("id", userId);
  if (
    profileError &&
    !/does not exist|schema cache/i.test(profileError.message)
  ) {
    console.error("[account/delete] profile cleanup:", profileError.message);
  }

  const { error: deleteError } = await admin.supabase.auth.admin.deleteUser(
    userId
  );

  if (deleteError) {
    return NextResponse.json(
      {
        error:
          deleteError.message ||
          "Could not delete your account. Please try again or contact support.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      success: true,
      message: "Your account has been permanently deleted.",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
