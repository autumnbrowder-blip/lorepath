import { firstPublishedHref } from "@/lib/book-work";
import Link from "next/link";

type FirstPublishedYearLinkProps = {
  bookId: string;
  year: number;
  /** Earliest printing — YEAR opens this tome when known. */
  firstEditionId?: string | null;
  /** Active browse `q` — preserved on the first-published URL. */
  searchQuery?: string;
  /** Prefix shown before the linked year (search cards). */
  label?: string;
  className?: string;
};

/** Linked first-published year → earliest edition (`?q=` + `fy=`). */
export function FirstPublishedYearLink({
  bookId,
  year,
  firstEditionId,
  searchQuery,
  label,
  className = "",
}: FirstPublishedYearLinkProps) {
  const target = firstEditionId?.trim() || bookId;
  return (
    <Link
      href={firstPublishedHref(target, searchQuery ?? "", year)}
      className={`lp-first-published-link ${className}`.trim()}
      title="Open the first published edition"
    >
      {label ? `${label} ${year}` : year}
    </Link>
  );
}
