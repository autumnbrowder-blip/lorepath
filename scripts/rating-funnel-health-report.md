# LorePath rating funnel health report

Generated: 2026-08-13T18:56:10.880Z
Base URL: https://lorepath.net

## Summary

- PASS: 10
- FAIL: 1
- WARN: 2

## Runtime checks

| Status | Check | Detail |
|---|---|---|
| PASS | NEXT_PUBLIC_SUPABASE_URL | present |
| PASS | NEXT_PUBLIC_SUPABASE_ANON_KEY | present |
| WARN | SUPABASE_SERVICE_ROLE_KEY (local process) | Not in local .env — verify Netlify Site env has SUPABASE_SERVICE_ROLE_KEY (required for prod rating writes) |
| PASS | GET / | HTTP 200 |
| PASS | GET /browse | HTTP 200 |
| PASS | GET /login | HTTP 200 |
| PASS | GET /register | HTTP 200 |
| PASS | GET /preferences | HTTP 307 |
| PASS | Search "Fourth Wing" | HTTP 200, books=5 |
| PASS | Search "Tender Is the Flesh" | HTTP 200, books=2 |
| WARN | Search "Divine Rivals" | HTTP 200, books=0 |
| PASS | Anonymous POST /api/books/[id]/ratings | HTTP 401 — You must be signed in to submit a rating. |
| FAIL | GET /api/books/[id]/ratings | HTTP 500 |

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

1. **[CRITICAL] Missing SUPABASE_SERVICE_ROLE_KEY in production**  
   submitUserRating writes via service role after JWT verify. Without the key, every save fails after signup.
2. **[HIGH] Email confirmation blocks immediate session**  
   RegisterForm can create auth.users without a session; user believes they signed up but cannot rate until confirm/disable Confirm email.
3. **[HIGH] Signup without book redirect lands on /profile**  
   Nav Register defaults redirect=/profile → Preferences onboarding. Users who never opened a book from SignupPrompt on detail never return to rate that tome.
4. **[MEDIUM] Mobile rating form below the fold**  
   BookInformation stacks description then Match Score → Community → RatingForm. First-time raters may not scroll to Inscribe.
5. **[MEDIUM] Soft signup copy vs rate intent**  
   SignupPrompt emphasizes account benefits, not 'Sign in to leave marks' as the primary verb — weaker conversion at the rating panel.

## Expected anonymous POST behavior

`POST /api/books/[id]/ratings` without auth must return **401** with message containing "signed in".

## Schema note

Ratings columns are `sexual_content, romance, lgbt, horror, ideology, pacing` (not `spice_level` / `themes`). UI "spice" maps to `sexual_content`.
