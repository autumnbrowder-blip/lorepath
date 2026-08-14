"use client";

import { createClient } from "@/lib/supabase";
import { Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

/**
 * Browser-side auth callback.
 *
 * Netlify functions currently cannot reach the Supabase Auth API (outbound
 * requests time out), so code exchange MUST happen in the browser — which can
 * reach Supabase — then persist the session via createBrowserClient cookies.
 */
function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Finishing sign-in…");

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      const code = searchParams.get("code");
      const tokenHash = searchParams.get("token_hash");
      const type = searchParams.get("type");
      const nextRaw = searchParams.get("next") ?? searchParams.get("redirect");
      const next =
        nextRaw && nextRaw.startsWith("/") && !nextRaw.startsWith("//")
          ? nextRaw
          : "/";

      try {
        const supabase = createClient();

        if (code) {
          const { error } = await Promise.race([
            supabase.auth.exchangeCodeForSession(code),
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error("Auth callback timed out")),
                12000
              )
            ),
          ]);
          if (error) throw error;
        } else if (tokenHash && type) {
          const { error } = await Promise.race([
            supabase.auth.verifyOtp({
              type: type as
                | "email"
                | "signup"
                | "recovery"
                | "invite"
                | "magiclink"
                | "email_change",
              token_hash: tokenHash,
            }),
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error("Auth callback timed out")),
                12000
              )
            ),
          ]);
          if (error) throw error;
        } else {
          throw new Error("Missing auth code");
        }

        if (cancelled) return;
        setMessage("Signed in. Opening the archives…");
        window.location.replace(next);
      } catch (error) {
        console.error("[auth/callback] failed:", error);
        if (cancelled) return;
        setMessage("Sign-in could not be completed.");
        router.replace("/login?error=auth");
      }
    }

    void finish();
    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <Loader2 className="h-6 w-6 animate-spin text-[#a67c2d]" />
      <p className="font-heading text-base text-[#f5e8c7]">{message}</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[#a67c2d]" />
        </div>
      }
    >
      <AuthCallbackInner />
    </Suspense>
  );
}
