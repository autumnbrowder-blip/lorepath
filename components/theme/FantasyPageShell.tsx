import { LibraryClassicalScene } from "@/components/theme/LibraryClassicalScene";

type FantasyPageShellProps = {
  children: React.ReactNode;
  className?: string;
  /** Kept for callers; all inner pages share the classical library scene. */
  variant?: "library" | "browse";
  /** Unused — scene is a CSS background, not a prioritized Image. */
  priority?: boolean;
};

/**
 * Ambient classical library atmosphere for inner pages (navbar untouched).
 * Viewport-fixed background; content scrolls in a separate layer so the
 * photo never rescales when controls, dropdowns, or cards change height.
 */
export function FantasyPageShell({
  children,
  className = "",
}: FantasyPageShellProps) {
  return (
    <div className={`fantasy-page-shell relative overflow-x-clip ${className}`}>
      <LibraryClassicalScene />
      <div className="fantasy-page-shell-scroll relative z-10 h-full overflow-y-auto overscroll-contain">
        {children}
      </div>
    </div>
  );
}
