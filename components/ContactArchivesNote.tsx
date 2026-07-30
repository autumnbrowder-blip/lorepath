const CONTACT_EMAIL = "info@lorepath.net";
const MAILTO = `mailto:${CONTACT_EMAIL}`;

type ContactArchivesNoteProps = {
  /**
   * `panel` — standalone parchment box (Home, dark library scene).
   * `inline` — quiet note inside an existing parchment auth card.
   */
  variant?: "panel" | "inline";
  className?: string;
};

function MailtoLink({ className }: { className?: string }) {
  return (
    <a
      href={MAILTO}
      className={className}
    >
      {CONTACT_EMAIL}
    </a>
  );
}

/**
 * Soft contact note for the archives — shared across Home, Login, and Register.
 */
export function ContactArchivesNote({
  variant = "panel",
  className = "",
}: ContactArchivesNoteProps) {
  if (variant === "inline") {
    return (
      <p
        className={`mt-6 border-t border-[#a67c2d]/35 pt-5 text-center font-heading text-sm leading-relaxed text-[#0f2a22]/85 ${className}`}
      >
        Questions or notes for the archives may be sent to{" "}
        <MailtoLink className="font-semibold text-[#0f2a22] underline decoration-[#a67c2d]/70 underline-offset-4 transition hover:decoration-[#a67c2d]" />
        .
      </p>
    );
  }

  return (
    <aside
      aria-label="Contact the archives"
      className={`relative mx-auto w-full max-w-md overflow-hidden rounded-sm border border-gold-500/45 shadow-[0_12px_28px_rgba(0,0,0,0.35)] ${className}`}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(160deg, #ece2c8 0%, #e4d6b4 40%, #dcc9a0 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.3] mix-blend-multiply"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='p'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23p)'/%3E%3C/svg%3E\")",
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_45%,_rgba(90,60,20,0.14)_100%)]" />
      <div className="pointer-events-none absolute inset-[5px] border border-gold-700/20" />

      <p className="relative px-5 py-3.5 text-center font-heading text-sm leading-relaxed text-forest-900/80 sm:px-6 sm:py-4 sm:text-[0.95rem]">
        Questions or notes for the archives may be sent to{" "}
        <MailtoLink className="font-semibold text-forest-900 underline decoration-gold-700/55 underline-offset-4 transition hover:decoration-gold-600" />
        .
      </p>
    </aside>
  );
}
