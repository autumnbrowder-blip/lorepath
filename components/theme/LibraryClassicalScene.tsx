/**
 * Shared classical library backdrop.
 * Peter Herrmann Unsplash original (photo O_DUcg4cDlc) as a CSS background
 * on a viewport-fixed layer so cover size never recrops.
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
