import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function BookNotFound() {
  return (
    <div className="mx-auto flex max-w-5xl flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <h1 className="page-title mb-2 text-3xl">Book not found</h1>
      <p className="mb-8 text-muted">
        This book may have been removed or the link is invalid.
      </p>
      <Link href="/browse" className="preference-codex-box--nav relative">
        <ArrowLeft className="h-4 w-4" />
        <span className="relative z-[1] nav-dragon-gold">Back to Browse</span>
      </Link>
    </div>
  );
}
