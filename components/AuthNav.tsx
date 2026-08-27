"use client";

import { LogoutButton } from "@/components/auth/LogoutButton";
import { FeedbackModal } from "@/components/feedback/FeedbackWidget";
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
  MessageSquareText,
  Settings,
  SlidersHorizontal,
  User as UserIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

/* Solid gold on deep-emerald panel — avoid nav-dragon-gold clip (white boxes) */
const menuItemClass =
  "flex items-center gap-2 px-3 py-2 font-storybook text-sm font-semibold tracking-wide text-[#e2c06a] transition-colors hover:bg-[#123229] hover:text-[#f0d78a]";
const menuItemActiveClass = "bg-[#123229]/90 text-[#f0d78a]";
const menuIconClass = "h-3.5 w-3.5 shrink-0 text-current";
/** If GoTrue hangs, show the logged-out icon instead of an infinite spinner. */
const AUTH_TIMEOUT_MS = 5000;

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
  const [feedbackOpen, setFeedbackOpen] = useState(false);

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

      const timeoutId = window.setTimeout(() => {
        if (!cancelled) setLoading(false);
      }, AUTH_TIMEOUT_MS);

      supabase.auth
        .getSession()
        .then(({ data: { session } }) => {
          if (cancelled) return;
          window.clearTimeout(timeoutId);
          const currentUser = session?.user ?? null;
          setUser(currentUser);
          setLoading(false);
          if (currentUser) void loadProfile(currentUser.id);
          else setProfile(null);
        })
        .catch(() => {
          if (cancelled) return;
          window.clearTimeout(timeoutId);
          setLoading(false);
        });

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        const nextUser = session?.user ?? null;
        setUser(nextUser);
        setLoading(false);
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

        void supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.user) void loadProfile(session.user.id);
        });
      };

      window.addEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated);

      return () => {
        cancelled = true;
        window.clearTimeout(timeoutId);
        subscription.unsubscribe();
        window.removeEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated);
      };
    } catch {
      setLoading(false);
    }
  }, []);

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
    return (
      <div className="site-nav-avatar shrink-0 opacity-40" aria-hidden="true" />
    );
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
      <>
        <div ref={containerRef} className="relative shrink-0">
          <button
            type="button"
            className={`site-nav-avatar ${
              open || onProfile || onPreferences || onStats || onSettings
                ? "site-nav-avatar--active"
                : ""
            }`}
            aria-expanded={open}
            aria-haspopup="menu"
            aria-controls={menuId}
            aria-label={`Account menu for ${label}`}
            onClick={() => setOpen((prev) => !prev)}
          >
            <AvatarCrest
              avatarKey={profile?.avatar_key}
              className="h-full w-full rounded-full !border-0 shadow-none"
              size={40}
              title={avatar.label}
            />
            <span className="sr-only">{label}</span>
          </button>

          {open ? (
            <div
              id={menuId}
              role="menu"
              aria-label="Account"
              className="absolute right-0 z-[60] mt-2 min-w-[11rem] overflow-hidden rounded-sm border border-gold-500/60 bg-[#0a1812] py-1 shadow-[0_16px_40px_rgba(0,0,0,0.65),0_0_0_1px_rgba(166,124,45,0.28),inset_0_1px_0_rgba(240,215,138,0.1)]"
            >
              <Link
                href="/profile"
                role="menuitem"
                className={`${menuItemClass} ${
                  onProfile ? menuItemActiveClass : ""
                }`}
                onClick={() => setOpen(false)}
              >
                <UserIcon className={menuIconClass} aria-hidden="true" />
                Profile
              </Link>
              <Link
                href="/preferences"
                role="menuitem"
                className={`${menuItemClass} ${
                  onPreferences ? menuItemActiveClass : ""
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
                  onStats ? menuItemActiveClass : ""
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
                  onSettings ? menuItemActiveClass : ""
                }`}
                onClick={() => setOpen(false)}
              >
                <Settings className={menuIconClass} aria-hidden="true" />
                Settings
              </Link>
              <button
                type="button"
                role="menuitem"
                className={`${menuItemClass} w-full cursor-pointer border-0 bg-transparent text-left`}
                onClick={() => {
                  setOpen(false);
                  setFeedbackOpen(true);
                }}
              >
                <MessageSquareText
                  className={menuIconClass}
                  aria-hidden="true"
                />
                Feedback
              </button>
              <div
                className="mx-2 my-1 border-t border-gold-600/35"
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
        <FeedbackModal
          open={feedbackOpen}
          onClose={() => setFeedbackOpen(false)}
        />
      </>
    );
  }

  const onLogin = pathname === "/login";
  const onRegister = pathname === "/register";

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        className={`site-nav-avatar ${
          open || onLogin || onRegister ? "site-nav-avatar--active" : ""
        }`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        aria-label="Account"
        onClick={() => setOpen((prev) => !prev)}
      >
        <UserIcon className="h-4 w-4 sm:h-[1.15rem] sm:w-[1.15rem]" aria-hidden="true" />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Account"
          className="absolute right-0 z-[60] mt-2 min-w-[9.5rem] overflow-hidden rounded-sm border border-gold-500/60 bg-[#0a1812] py-1 shadow-[0_16px_40px_rgba(0,0,0,0.65),0_0_0_1px_rgba(166,124,45,0.28),inset_0_1px_0_rgba(240,215,138,0.1)]"
        >
          <Link
            href="/login"
            role="menuitem"
            className={`${menuItemClass} ${onLogin ? menuItemActiveClass : ""}`}
            onClick={() => setOpen(false)}
          >
            Login
          </Link>
          <Link
            href="/register"
            role="menuitem"
            className={`${menuItemClass} ${onRegister ? menuItemActiveClass : ""}`}
            onClick={() => setOpen(false)}
          >
            Register
          </Link>
        </div>
      ) : null}
    </div>
  );
}
