import { CodexBoxOrnament } from "@/components/preferences/CodexBoxOrnament";

const CONTACT_EMAIL = "info@lorepath.net";
const MAILTO = `mailto:${CONTACT_EMAIL}`;

type ContactArchivesNoteProps = {
  /**
   * `panel` — standalone emerald codex box (Home).
   * `inline` — compact codex box inside auth parchment (Login / Register).
   */
  variant?: "panel" | "inline";
  className?: string;
};

function MailtoLink() {
  return (
    <a
      href={MAILTO}
      className="antique-gold-text font-semibold underline decoration-gold-500/60 underline-offset-4 transition hover:brightness-125"
    >
      {CONTACT_EMAIL}
    </a>
  );
}

/**
 * Contact note for the archives — shared across Home, Login, and Register.
 * Reuses preference-codex-box + CodexBoxOrnament (same system as FAQ / Preferences).
 */
export function ContactArchivesNote({
  variant = "panel",
  className = "",
}: ContactArchivesNoteProps) {
  const compact = variant === "inline";

  return (
    <aside
      aria-label="Contact the archives"
      className={`preference-codex-box relative text-center ${
        compact
          ? `mt-6 !p-3.5 !pt-4 sm:!p-4 sm:!pt-4 ${className}`
          : `mx-auto w-full max-w-md ${className}`
      }`}
    >
      <CodexBoxOrnament />
      <div className={`relative z-[3] px-1 ${compact ? "py-0.5" : "py-1"}`}>
        <h2
          className={`font-storybook font-bold tracking-[0.1em] nav-dragon-gold ${
            compact ? "text-base sm:text-lg" : "text-lg sm:text-xl"
          }`}
        >
          Contact the Archives
        </h2>
        <p
          className={`mt-2 font-heading leading-relaxed nav-dragon-gold ${
            compact ? "text-sm" : "text-base sm:text-lg"
          }`}
        >
          Questions or notes may be sent to <MailtoLink />.
        </p>
      </div>
    </aside>
  );
}
