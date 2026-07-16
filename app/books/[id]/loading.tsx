export default function BookDetailLoading() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10 sm:py-12">
      <div className="mb-10 h-4 w-32 animate-pulse rounded bg-forest-200 dark:bg-forest-800" />

      <div className="mb-8 flex items-center gap-2">
        <div className="h-5 w-5 animate-pulse rounded bg-forest-200 dark:bg-forest-800" />
        <div className="h-4 w-36 animate-pulse rounded bg-forest-200 dark:bg-forest-800" />
      </div>

      <div className="grid gap-10 lg:grid-cols-[280px_1fr] lg:gap-12">
        <div className="mx-auto aspect-[2/3] w-full max-w-[280px] animate-pulse rounded-2xl bg-forest-200 dark:bg-forest-800 lg:mx-0" />

        <div className="space-y-6">
          <div className="h-10 w-3/4 animate-pulse rounded-lg bg-forest-200 dark:bg-forest-800" />
          <div className="h-5 w-1/2 animate-pulse rounded bg-forest-200 dark:bg-forest-800" />
          <div className="flex gap-2">
            <div className="h-7 w-20 animate-pulse rounded-full bg-forest-200 dark:bg-forest-800" />
            <div className="h-7 w-24 animate-pulse rounded-full bg-forest-200 dark:bg-forest-800" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-lg bg-forest-200 dark:bg-forest-800"
              />
            ))}
          </div>
          <div className="h-40 animate-pulse rounded-xl bg-forest-200 dark:bg-forest-800" />
        </div>
      </div>

      <div className="my-12 border-t border-border" />

      <div className="grid gap-8 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="h-96 animate-pulse rounded-2xl bg-forest-200 dark:bg-forest-800"
          />
        ))}
      </div>
    </div>
  );
}
