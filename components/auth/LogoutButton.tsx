"use client";

import { createClient } from "@/lib/supabase";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ButtonHTMLAttributes } from "react";

type LogoutButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  showIcon?: boolean;
  label?: string;
};

export function LogoutButton({
  className = "btn-secondary",
  showIcon = true,
  label = "Sign out",
  type = "button",
  ...props
}: LogoutButtonProps) {
  const router = useRouter();

  async function handleSignOut() {
    if (!isSupabaseConfigured()) return;
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <button
      type={type}
      className={className}
      {...props}
      onClick={(event) => {
        props.onClick?.(event);
        if (!event.defaultPrevented) {
          void handleSignOut();
        }
      }}
    >
      {showIcon ? (
        <LogOut className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      ) : null}
      {label}
    </button>
  );
}
