import { getGenreBrowseUrl } from "@/lib/book-links";
import { Tag } from "lucide-react";
import Link from "next/link";

type GenreTagProps = {
  children: string;
  /** Compact size for browse cards */
  size?: "sm" | "md";
};

/** Clickable genre chip — emerald + dragon-scale gold; opens Browse for that genre. */
export function GenreTag({ children, size = "md" }: GenreTagProps) {
  const genre = children.trim();

  return (
    <Link
      href={getGenreBrowseUrl(genre)}
      className={`codex-tag ${size === "sm" ? "codex-tag--sm" : ""}`}
      title={`Browse ${genre} books`}
    >
      <Tag
        className={size === "sm" ? "h-2.5 w-2.5 shrink-0" : "h-3 w-3 shrink-0"}
        aria-hidden="true"
      />
      <span className="codex-tag-label">{genre}</span>
    </Link>
  );
}
