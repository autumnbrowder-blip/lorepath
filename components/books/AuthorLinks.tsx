import { getAuthorPageUrl } from "@/lib/book-links";
import Link from "next/link";

type AuthorLinksProps = {
  authors: string[];
  className?: string;
};

export function AuthorLinks({ authors, className }: AuthorLinksProps) {
  if (authors.length === 0) return null;

  return (
    <span>
      {authors.map((author, index) => (
        <span key={author}>
          {index > 0 && <span className={className}>, </span>}
          <Link
            href={getAuthorPageUrl(author)}
            className={`transition hover:underline hover:brightness-125 ${className ?? ""}`}
          >
            {author}
          </Link>
        </span>
      ))}
    </span>
  );
}
