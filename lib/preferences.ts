import { DEFAULT_USER_PREFERENCES } from "@/lib/rating-categories";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { ContentRating } from "@/types";

export async function getUserPreferences(
  userId: string
): Promise<ContentRating> {
  if (!isSupabaseConfigured()) {
    return DEFAULT_USER_PREFERENCES;
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("user_preferences")
      .select("sexual_content, romance, lgbt, horror, ideology, pacing")
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) {
      return DEFAULT_USER_PREFERENCES;
    }

    return {
      sexual_content: data.sexual_content,
      romance: data.romance,
      lgbt: data.lgbt,
      horror: data.horror,
      ideology: data.ideology,
      pacing: data.pacing,
    };
  } catch {
    return DEFAULT_USER_PREFERENCES;
  }
}

export async function saveUserPreferences(
  userId: string,
  preferences: ContentRating
): Promise<{ success: true } | { success: false; error: string }> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: "Supabase is not configured." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("user_preferences").upsert(
    {
      user_id: userId,
      sexual_content: preferences.sexual_content,
      romance: preferences.romance,
      lgbt: preferences.lgbt,
      horror: preferences.horror,
      ideology: preferences.ideology,
      pacing: preferences.pacing,
    },
    { onConflict: "user_id" }
  );

  if (error) {
    return { success: false, error: "Failed to save preferences." };
  }

  return { success: true };
}

export async function getUserProfile(userId: string) {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, is_subscriber, created_at")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}
