"use client";

import { AlertCircle, ArrowLeft, RefreshCw } from "lucide-react";
import Link from "next/link";

type BookDetailErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function BookDetailError({ error, reset }: BookDetailErrorProps) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-6 py-24 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gold-100 dark:bg-gold-950/50">
        <AlertCircle className="h-6 w-6 text-gold-700 dark:text-gold-400" />
      </div>
      <h1 className="page-title mb-2 text-2xl">Couldn&apos;t load this book</h1>
      <p className="mb-8 text-sm text-muted">
        {error.message ||
          "Something went wrong while fetching book details. Please try again."}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={reset} className="btn-primary">
          <RefreshCw className="h-4 w-4" />
          Try again
        </button>
        <Link href="/browse" className="preference-codex-box--nav relative">
          <ArrowLeft className="h-4 w-4" />
          <span className="relative z-[1] nav-dragon-gold">Back to Browse</span>
        </Link>
      </div>
    </div>
  );
}
