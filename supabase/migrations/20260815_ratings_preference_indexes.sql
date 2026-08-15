-- =============================================================================
-- LorePath: missing indexes for ratings / preference lookups
-- Production-safe: adds indexes only. Does not drop data or change columns.
-- Safe to re-run (IF NOT EXISTS).
--
-- Run in Supabase Dashboard → SQL Editor.
-- =============================================================================

-- User-scoped rating lists (stats, rated tomes, inscribed badges, save routing)
CREATE INDEX IF NOT EXISTS ratings_rated_by_idx
  ON public.ratings (rated_by);

-- Same lookups ordered by recency (ORDER BY created_at DESC)
CREATE INDEX IF NOT EXISTS ratings_rated_by_created_at_idx
  ON public.ratings (rated_by, created_at DESC);

-- Upsert support is already covered by:
--   ratings_user_book_unique UNIQUE (book_id, rated_by)
-- Community averages are already covered by:
--   ratings_book_id_idx ON ratings (book_id)
-- One preference row per user is already covered by:
--   user_preferences_user_unique UNIQUE (user_id)
-- Book slug lookups are already covered by:
--   books_slug_unique UNIQUE (slug)
