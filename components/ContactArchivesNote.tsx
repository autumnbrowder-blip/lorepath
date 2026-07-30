import { CodexBoxOrnament } from "@/components/preferences/CodexBoxOrnament";
import { Mail } from "lucide-react";

const CONTACT_EMAIL = "info@lorepath.net";
const MAILTO = `mailto:${CONTACT_EMAIL}`;

type ContactArchivesNoteProps = {
  /**
   * `panel` — Home CTA box (matches btn-primary / preferences Link).
   * `inline` — compact codex box inside auth parchment (Login / Register).
   */
  variant?: "panel" | "inline";
  className?: string;
};

function MailtoLink({ onGold = false }: { onGold?: boolean }) {
  return (
    <a
      href={MAILTO}
      className={
        onGold
          ? "font-semibold underline decoration-[#1a1205]/55 underline-offset-4 transition hover:brightness-125"
          : "antique-gold-text font-semibold underline decoration-gold-500/60 underline-offset-4 transition hover:brightness-125"
      }
    >
      {CONTACT_EMAIL}
    </a>
  );
}

/**
 * Contact note for the archives — shared across Home, Login, and Register.
 * Home (`panel`) reuses btn-primary chrome like the preferences CTA.
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
        className={`preference-codex-box relative mt-6 !p-3.5 !pt-4 text-center sm:!p-4 sm:!pt-4 ${className}`}
      >
        <CodexBoxOrnament />
        <div className="relative z-[3] px-1 py-0.5">
          <h2 className="font-storybook text-base font-bold tracking-[0.1em] nav-dragon-gold sm:text-lg">
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
      className={`btn-primary w-full max-w-md flex-col gap-1.5 px-6 py-3.5 text-center sm:w-auto ${className}`}
    >
      <span className="relative inline-flex items-center justify-center gap-2">
        <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
        <h2 className="font-storybook text-xs font-semibold uppercase tracking-[0.16em]">
          Contact the Archives
        </h2>
      </span>
      <p className="relative normal-case font-storybook text-xs font-normal leading-relaxed tracking-[0.06em]">
        Questions or notes may be sent to <MailtoLink onGold />.
      </p>
    </aside>
  );
}
