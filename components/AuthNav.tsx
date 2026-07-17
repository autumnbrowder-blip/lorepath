"use client";

import { LogoutButton } from "@/components/auth/LogoutButton";
import { AvatarCrest } from "@/components/profile/AvatarCrest";
import {
  getAvatarOption,
  PROFILE_UPDATED_EVENT,
  resolveDisplayName,
} from "@/lib/avatars";
import { createClient } from "@/lib/supabase";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { User } from "@supabase/supabase-js";
import {
  BookOpen,
  Settings,
  SlidersHorizontal,
  User,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

const menuItemClass =
  "flex items-center gap-2 px-3 py-2 font-storybook text-sm tracking-wide transition-[filter] nav-dragon-gold hover:bg-forest-900/80";
const menuIconClass = "h-3.5 w-3.5 shrink-0";

type ProfileNavData = {
  display_name: string | null;
  avatar_key: string | null;
};

export function AuthNav() {
  const pathname = usePathname();
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileNavData | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadProfile(userId: string) {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("profiles")
          .select("display_name, avatar_key")
          .eq("id", userId)
          .maybeSingle();

        if (cancelled) return;

        if (error || !data) {
          // Fallback if avatar_key column isn't migrated yet
          const { data: basic } = await supabase
            .from("profiles")
            .select("display_name")
            .eq("id", userId)
            .maybeSingle();
          setProfile(
            basic
              ? { display_name: basic.display_name ?? null, avatar_key: null }
              : null
          );
          return;
        }

        setProfile({
          display_name: data.display_name ?? null,
          avatar_key: data.avatar_key ?? null,
        });
      } catch {
        if (!cancelled) setProfile(null);
      }
    }

    try {
      const supabase = createClient();

      supabase.auth
        .getUser()
        .then(({ data: { user: currentUser } }) => {
          if (cancelled) return;
          setUser(currentUser);
          setLoading(false);
          if (currentUser) void loadProfile(currentUser.id);
          else setProfile(null);
        })
        .catch(() => {
          if (!cancelled) setLoading(false);
        });

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        const nextUser = session?.user ?? null;
        setUser(nextUser);
        if (nextUser) void loadProfile(nextUser.id);
        else {
          setProfile(null);
          setOpen(false);
        }
      });

      const onProfileUpdated = (event: Event) => {
        const detail =
          event instanceof CustomEvent
            ? (event.detail as { display_name?: string | null } | undefined)
            : undefined;

        // Optimistic navbar label when DisplayNameForm (or similar) ships the new name.
        if (detail && "display_name" in detail) {
          setProfile((prev) => ({
            display_name: detail.display_name ?? null,
            avatar_key: prev?.avatar_key ?? null,
          }));
        }

        void supabase.auth.getUser().then(({ data: { user: currentUser } }) => {
          if (currentUser) void loadProfile(currentUser.id);
        });
      };

      window.addEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated);

      return () => {
        cancelled = true;
        subscription.unsubscribe();
        window.removeEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated);
      };
    } catch {
      setLoading(false);
    }
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent | PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  if (loading) {
    return <div className="h-8 w-16 shrink-0" aria-hidden="true" />;
  }

  if (user) {
    const label = resolveDisplayName(
      profile?.display_name,
      user.user_metadata,
      user.email
    );
    const avatar = getAvatarOption(profile?.avatar_key);
    const onProfile = pathname === "/profile";
    const onPreferences = pathname === "/preferences";
    const onStats = pathname === "/stats";
    const onSettings = pathname === "/settings" || pathname.startsWith("/settings/");

    return (
      <div ref={containerRef} className="relative shrink-0">
        <button
          type="button"
          className={`flex max-w-[10.5rem] items-center gap-1.5 rounded-sm border border-gold-600/35 bg-forest-950/80 px-1.5 py-1 transition-[border-color,filter] hover:border-gold-500/55 sm:max-w-[13rem] ${
            open || onProfile || onPreferences || onStats || onSettings
              ? "border-gold-500/60"
              : ""
          }`}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-controls={menuId}
          onClick={() => setOpen((prev) => !prev)}
        >
          <AvatarCrest
            avatarKey={profile?.avatar_key}
            className="h-10 w-10 rounded-sm"
            size={40}
            title={avatar.label}
          />
          <span className="min-w-0 truncate font-storybook text-sm tracking-wide nav-dragon-gold sm:text-base">
            {label}
          </span>
          <svg
            className={`h-3 w-3 shrink-0 text-gold-500/80 transition-transform ${
              open ? "rotate-180" : ""
            }`}
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M2.5 4.25L6 7.75L9.5 4.25"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="sr-only">Account menu</span>
        </button>

        {open ? (
          <div
            id={menuId}
            role="menu"
            aria-label="Account"
            className="absolute right-0 z-[60] mt-2 min-w-[11rem] overflow-hidden rounded-sm border border-gold-600/40 bg-forest-950/98 py-1 shadow-[0_12px_32px_rgba(0,0,0,0.55)] backdrop-blur-md"
          >
            <Link
              href="/profile"
              role="menuitem"
              className={`${menuItemClass} ${
                onProfile ? "nav-dragon-gold--active bg-forest-900/50" : ""
              }`}
              onClick={() => setOpen(false)}
            >
              <User className={menuIconClass} aria-hidden="true" />
              Profile
            </Link>
            <Link
              href="/preferences"
              role="menuitem"
              className={`${menuItemClass} ${
                onPreferences ? "nav-dragon-gold--active bg-forest-900/50" : ""
              }`}
              onClick={() => setOpen(false)}
            >
              <SlidersHorizontal className={menuIconClass} aria-hidden="true" />
              Preferences
            </Link>
            <Link
              href="/stats"
              role="menuitem"
              className={`${menuItemClass} ${
                onStats ? "nav-dragon-gold--active bg-forest-900/50" : ""
              }`}
              onClick={() => setOpen(false)}
            >
              <BookOpen className={menuIconClass} aria-hidden="true" />
              Reading Stats
            </Link>
            <Link
              href="/settings"
              role="menuitem"
              className={`${menuItemClass} ${
                onSettings ? "nav-dragon-gold--active bg-forest-900/50" : ""
              }`}
              onClick={() => setOpen(false)}
            >
              <Settings className={menuIconClass} aria-hidden="true" />
              Settings
            </Link>
            <div
              className="mx-2 my-1 border-t border-gold-600/25"
              aria-hidden="true"
            />
            <LogoutButton
              role="menuitem"
              showIcon
              label="Logout"
              className={`${menuItemClass} w-full cursor-pointer border-0 bg-transparent text-left`}
            />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-3 sm:gap-4">
      <Link
        href="/login"
        className={`font-storybook transition-[filter] nav-dragon-gold ${
          pathname === "/login" ? "nav-dragon-gold--active" : ""
        }`}
      >
        Login
      </Link>
      <Link
        href="/register"
        className={`font-storybook transition-[filter] nav-dragon-gold ${
          pathname === "/register" ? "nav-dragon-gold--active" : ""
        }`}
      >
        Register
      </Link>
    </div>
  );
}
