/**
 * Returns true only when Supabase env vars look like a real project
 * (not missing and not the .env.local.example placeholders).
 *
 * Reads `process.env.NEXT_PUBLIC_*` via direct property access (no optional
 * chaining on `process.env`) so Next.js can reliably inline them for client bundles.
 */
export function isSupabaseConfigured(): boolean {
  const urlRaw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKeyRaw = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const url = typeof urlRaw === "string" ? urlRaw.trim() : "";
  const anonKey = typeof anonKeyRaw === "string" ? anonKeyRaw.trim() : "";

  if (!url || !anonKey) return false;

  if (looksLikePlaceholder(url) || looksLikePlaceholder(anonKey)) {
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

  // Legacy anon keys are JWTs (three base64 segments). Newer keys use sb_publishable_.
  if (!isLikelyAnonKey(anonKey)) {
    return false;
  }

  return true;
}

function looksLikePlaceholder(value: string): boolean {
  return /your-project|your-anon|your-supabase|changeme|placeholder/i.test(
    value
  );
}

function isLikelyAnonKey(anonKey: string): boolean {
  if (anonKey.startsWith("sb_publishable_")) return true;
  return anonKey.split(".").length === 3;
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
