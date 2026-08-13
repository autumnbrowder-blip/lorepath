# LorePath rating funnel health report

Generated: 2026-08-11T21:39:44.160Z  
Base URL: https://lorepath.net

## Summary

- PASS: 12 (routes, search samples, anon POST 401, GET ratings, anon keys)
- FAIL: 1 (local `SUPABASE_SERVICE_ROLE_KEY` missing)
- WARN: 1+ (verify Netlify service role; mobile fold; soft CTA)

## Runtime checks

| Status | Check | Detail |
|---|---|---|
| PASS | NEXT_PUBLIC_SUPABASE_URL | present (local process) |
| PASS | NEXT_PUBLIC_SUPABASE_ANON_KEY | present (local process) |
| FAIL | SUPABASE_SERVICE_ROLE_KEY | MISSING in `.env.local` — local rating saves cannot upsert |
| WARN | Prod SERVICE_ROLE (Netlify) | Cannot verify remotely — confirm Site env |
| PASS | GET / | HTTP 200 |
| PASS | GET /browse | HTTP 200 |
| PASS | GET /login | HTTP 200 |
| PASS | GET /register | HTTP 200 |
| PASS | GET /preferences | HTTP 307 (auth gate) |
| PASS | Search "Fourth Wing" | HTTP 200, books=1 |
| PASS | Search "Tender Is the Flesh" | HTTP 200, books=2 |
| PASS | Search "Divine Rivals" | HTTP 200, books=4 |
| PASS | Anonymous POST /api/books/[id]/ratings | HTTP 401 — You must be signed in to submit a rating. |
| PASS | GET /api/books/[id]/ratings | HTTP 200 |

## Funnel code audit

| Status | Check | Notes |
|---|---|---|
| PASS | Signup / login | `?redirect=` honored from RatingForm; nav default `/profile` |
| PASS | Profile creation | `handle_new_user` + `ensureProfileExists` |
| PASS | Browse → detail | BookCard → `/books/{id}` |
| WARN | Rating form visibility | Mobile: form under description/community |
| PASS | POST ratings API | JWT + validation; no silent success |
| PASS | books upsert | `ensureBookRecord` before rating |
| PASS | rated_by | JWT `user.id` only |
| PASS | Community refresh | Context + `router.refresh` + `revalidatePath` |
| PASS | Preferences | `/api/preferences` + first-rating redirect |
| PASS | Reading Stats | `revalidatePath("/stats")` on save |

## Schema note

Ratings columns: `sexual_content, romance, lgbt, horror, ideology, pacing`.  
There is no `spice_level` / `themes` column — UI “spice” maps to `sexual_content`.

## Files involved in rating save

- `components/books/RatingForm.tsx`
- `app/api/books/[id]/ratings/route.ts`
- `lib/ratings.ts`
- `lib/supabase/server.ts`
- `components/books/BookRatingsContext.tsx`
- `components/books/LiveCommunityRatings.tsx`
- `components/auth/SignupPrompt.tsx`
- `components/auth/LoginForm.tsx`
- `components/auth/RegisterForm.tsx`
- `app/books/[id]/page.tsx`
- `components/books/BookInformation.tsx`
- `components/browse/BookCard.tsx`
- `app/api/preferences/route.ts`
- `lib/preferences.ts`
- `app/stats/page.tsx`
- `supabase/migrations/20260717_ratings_rls_complete.sql`
- `supabase/schema.sql`

## Top 5 blockers (ranked)

1. **[CRITICAL] SUPABASE_SERVICE_ROLE_KEY missing locally (verify Netlify)**  
   `submitUserRating` writes via service role after JWT verify. Missing key → every save fails.

2. **[HIGH] Email confirmation can create user without session**  
   Account exists but rating POST returns 401 until session exists.

3. **[HIGH] Nav signup defaults to /profile, not the book**  
   Easy to leave the rating surface and never return to the tome.

4. **[MEDIUM] Mobile rating form below the fold**  
   Inscribe panel may never be seen without scroll.

5. **[MEDIUM] Soft signup copy vs rate intent**  
   CTA sells account benefits more than “sign in to rate.”

## Additional findings (code explore)

| Severity | Finding |
|---|---|
| MEDIUM | `loadViewerState` failure → signed-in user sees SignupPrompt |
| MEDIUM | Open redirect: middleware/Login/Register unsanitized `?redirect=` (callback is safe) |
| MEDIUM | Silent empty community/stats reads on transient DB errors |
| LOW | `schema.sql` DELETE grant without DELETE policy vs migrations 20260716/17 |

Explore agent: [Explore rating funnel code](c1b62560-76e3-48b2-ae4e-13078f87d61c)

## Re-run

```bash
npx tsx --env-file=.env.local scripts/rating-funnel-health.ts https://lorepath.net
```
