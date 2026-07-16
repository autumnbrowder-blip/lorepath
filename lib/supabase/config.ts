/**
 * Returns true only when Supabase env vars look like a real project
 * (not missing and not the .env.local.example placeholders).
 */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

  if (!url || !anonKey) return false;

  const placeholderPattern =
    /your-project|your-anon|example\.com|changeme|placeholder/i;
  if (placeholderPattern.test(url) || placeholderPattern.test(anonKey)) {
    return false;
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
  } catch {
    return false;
  }

  // Real anon keys are JWTs (three base64 segments).
  if (anonKey.split(".").length !== 3) {
    return false;
  }

  return true;
}

export function getSupabaseEnv() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim(),
  };
}
