/**
 * Immersive login/register scene.
 * Hall photo is a CSS full-page background on .portal-auth-page so Login and
 * Register share the same cover image. Form boxes sit on top.
 */
export function PortalAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="portal-auth-page">
      <div className="portal-auth-shell">
        <div className="ornate-plaque portal-auth-parchment">
          <div className="pointer-events-none absolute inset-[6px] rounded-[2px] border border-[#a67c2d]/30" />
          <div className="relative z-10">{children}</div>
        </div>
      </div>
    </div>
  );
}
