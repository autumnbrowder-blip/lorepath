/**
 * Shared classical library backdrop.
 * Viewport-fixed CSS background (not Next/Image fill) so cover size never
 * recrops when content, dropdowns, or rating controls change layout.
 */
export function LibraryClassicalScene({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div
      className={`library-classical-scene ${className}`.trim()}
      aria-hidden="true"
    />
  );
}
