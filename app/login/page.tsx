import { LoginForm } from "@/components/auth/LoginForm";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { Suspense } from "react";

export default function LoginPage() {
  // Server-side check so login UI reflects env even if a stale client bundle
  // was cached before `.env.local` was loaded.
  const configured = isSupabaseConfigured();

  return (
    <Suspense>
      <LoginForm configured={configured} />
    </Suspense>
  );
}
