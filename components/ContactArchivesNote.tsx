import { CodexBoxOrnament } from "@/components/preferences/CodexBoxOrnament";
import { Mail } from "lucide-react";

const CONTACT_EMAIL = "info@lorepath.net";
const MAILTO = `mailto:${CONTACT_EMAIL}`;

type ContactArchivesNoteProps = {
  /**
   * `panel` — Home footer note (quiet; does not compete with signup CTA).
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
 * Home (`panel`) stays quiet so it never competes with the signup CTA.
 * Auth (`inline`) keeps preference-codex-box + CodexBoxOrnament.
 */
export function ContactArchivesNote({
  variant = "panel",
  className = "",
}: ContactArchivesNoteProps) {
  if (variant === "inline") {
    return (
      <aside
        aria-label="Contact the archives"
        className={`ornate-plaque preference-codex-box relative mt-6 !p-3.5 !pt-4 text-center sm:!p-4 sm:!pt-4 ${className}`}
      >
        <CodexBoxOrnament />
        <div className="relative z-[3] px-1 py-0.5">
          <h2 className="font-heading text-base font-medium tracking-normal nav-dragon-gold sm:text-lg">
            Contact the Archives
          </h2>
          <p className="mt-2 font-heading text-sm leading-relaxed nav-dragon-gold">
            Questions or notes may be sent to <MailtoLink />.
          </p>
        </div>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Contact the archives"
      className={`w-full max-w-sm rounded-sm border border-gold-500/25 bg-forest-950/30 px-5 py-3 text-center sm:max-w-md sm:px-6 sm:py-3.5 ${className}`}
    >
      <span className="inline-flex items-center justify-center gap-2 text-gold-200/70">
        <Mail className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden="true" />
        <h2 className="font-display text-[11px] font-normal uppercase tracking-[0.08em]">
          Contact the Archives
        </h2>
      </span>
      <p className="mt-1.5 font-heading text-xs leading-relaxed text-gold-200/65">
        Questions or notes may be sent to <MailtoLink />.
      </p>
    </aside>
  );
}
