-- Optional Hardcover detail-cache timestamp. App still works if this
-- column is missing (in-memory 7-day cache + skip API).
-- Safe to re-run (IF NOT EXISTS).

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS hardcover_cached_at timestamptz;
