"use client";

import { getAvatarOption } from "@/lib/avatars";
import { useEffect, useState } from "react";

type AvatarCrestProps = {
  avatarKey: string | null | undefined;
  /** Tailwind size / shape classes for the frame (default: navbar chip). */
  className?: string;
  /** Pixel size hint for the img (default 28). */
  size?: number;
  title?: string;
  /**
   * `display` — large hero crest (profile current choice): richer gold frame,
   * soft inner vignette. Default stays compact for navbar / picker chips.
   */
  variant?: "default" | "display";
};

/**
 * Always prefers the fantasy portrait under /avatars/.
 * Emoji is only shown if the image fails to load (onError) — never overlaid
 * on a successful portrait.
 */
export function AvatarCrest({
  avatarKey,
  className = "h-7 w-7 rounded-sm",
  size = 28,
  title,
  variant = "default",
}: AvatarCrestProps) {
  const option = getAvatarOption(avatarKey);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [option.src]);

  const frameClass =
    variant === "display"
      ? "shrink-0 overflow-hidden rounded-sm border-[3px] border-gold-500 shadow-[0_0_0_1px_rgba(201,162,74,0.55),0_0_0_4px_rgba(120,90,30,0.28),0_10px_28px_rgba(0,0,0,0.45),inset_0_0_24px_rgba(0,0,0,0.35)] ring-1 ring-gold-400/40"
      : "shrink-0 overflow-hidden border-2 border-gold-500/70 bg-forest-950 shadow-[0_0_0_1px_rgba(120,90,30,0.35),inset_0_0_10px_rgba(0,0,0,0.4)]";

  if (failed) {
    return (
      <span
        className={`flex items-center justify-center bg-forest-950 leading-none ${frameClass} ${className} ${
          variant === "display" ? "text-6xl" : "text-sm"
        }`}
        title={title ?? option.label}
        aria-hidden="true"
      >
        {option.emoji}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- local /avatars portraits + onError emoji fallback
    <img
      src={option.src}
      alt=""
      width={size}
      height={size}
      loading={variant === "display" ? "eager" : "lazy"}
      decoding="async"
      title={title ?? option.label}
      aria-hidden="true"
      onError={() => setFailed(true)}
      className={`object-cover bg-forest-950 ${frameClass} ${className}`}
    />
  );
}
