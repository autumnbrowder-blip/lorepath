import { Feather, ScrollText } from "lucide-react";
import Link from "next/link";

export const SIGNUP_PROMPT_COPY =
  "Create a free account to save your marks across the realm, strengthen community ratings, and see Match Scores on books the community has marked.";

export const SIGNUP_PROMPT_GOODREADS =
  "Import your Goodreads list after signup.";

type SignupPromptProps = {
  /** Where to send the reader after registration. */
  redirectTo?: string;
  /**
   * `panel` — book detail / rating (dominant CTA).
   * `compact` — nested inside Match Score shell.
   * `inline` — browse (quiet supporting line + link).
   */
  variant?: "panel" | "compact" | "inline";
  /** Override body copy (defaults to shared signup line). */
  description?: string;
  /** Show the quiet Goodreads hint. Default: true for panel/inline, false for compact. */
  showGoodreadsHint?: boolean;
  className?: string;
};

function registerHref(redirectTo?: string) {
  if (!redirectTo) return "/register";
  return `/register?redirect=${encodeURIComponent(redirectTo)}`;
}

function loginHref(redirectTo?: string) {
  if (!redirectTo) return "/login";
  return `/login?redirect=${encodeURIComponent(redirectTo)}`;
}

/**
 * High-intent signup nudge for logged-out readers.
 * Not shown to signed-in users — callers must gate on auth.
 */
export function SignupPrompt({
  redirectTo,
  variant = "panel",
  description = SIGNUP_PROMPT_COPY,
  showGoodreadsHint,
  className = "",
}: SignupPromptProps) {
  const signup = registerHref(redirectTo);
  const signin = loginHref(redirectTo);
  const goodreadsHint =
    showGoodreadsHint ?? (variant === "panel" || variant === "inline");

  if (variant === "inline") {
    return (
      <p
        className={`text-center font-heading text-sm leading-relaxed nav-dragon-gold sm:text-[0.9375rem] ${className}`}
      >
        {description}{" "}
        <Link
          href={signup}
          className="font-semibold underline decoration-gold-500/60 underline-offset-4 transition hover:brightness-125"
        >
          Create free account
        </Link>
        {goodreadsHint ? (
          <span className="mt-1 block text-xs text-gold-200/65 sm:text-[0.8125rem]">
            {SIGNUP_PROMPT_GOODREADS}
          </span>
        ) : null}
      </p>
    );
  }

  if (variant === "compact") {
    return (
      <div className={`space-y-3 ${className}`}>
        <p className="font-heading text-sm leading-relaxed nav-dragon-gold">
          {description}
        </p>
        {goodreadsHint ? (
          <p className="font-heading text-xs leading-relaxed text-gold-200/70">
            {SIGNUP_PROMPT_GOODREADS}
          </p>
        ) : null}
        <Link href={signup} className="btn-primary w-full justify-center sm:w-auto">
          <ScrollText className="h-4 w-4 shrink-0" aria-hidden="true" />
          Create free account
        </Link>
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-sm border border-gold-600/50 bg-gradient-to-b from-[#1a2e24] to-forest-950/90 px-4 py-4 text-center shadow-[inset_0_1px_0_rgba(212,175,55,0.18)] ${className}`}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-20 mix-blend-overlay"
        aria-hidden="true"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
      <div className="relative z-[1] mx-auto mb-2.5 flex h-10 w-10 items-center justify-center rounded-sm border border-gold-500/55 bg-forest-950/70 text-[#d4af37]">
        <Feather className="h-5 w-5" aria-hidden="true" />
      </div>
      <p className="relative z-[1] mx-auto max-w-md font-heading text-sm leading-relaxed nav-dragon-gold sm:text-base">
        {description}
      </p>
      {goodreadsHint ? (
        <p className="relative z-[1] mt-1.5 font-heading text-xs leading-relaxed text-gold-200/70 sm:text-sm">
          {SIGNUP_PROMPT_GOODREADS}
        </p>
      ) : null}
      <div className="relative z-[1] mt-4 flex flex-col items-center gap-2.5">
        <Link
          href={signup}
          className="btn-primary min-h-[2.75rem] w-full max-w-xs justify-center px-6 py-3"
        >
          <ScrollText className="h-4 w-4 shrink-0" aria-hidden="true" />
          Create free account
        </Link>
        <p className="font-heading text-sm nav-dragon-gold">
          Already a traveler?{" "}
          <Link
            href={signin}
            className="underline decoration-gold-600/60 underline-offset-4 hover:decoration-gold-500"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
