# LorePath

A Next.js 14+ app for exploring lore and narrative content.

## Stack

- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **Lucide React** (icons)
- **Supabase** (auth & database)
- **next-themes** (dark mode)

## Getting started

```bash
npm install
cp .env.local.example .env.local   # then add your Supabase keys
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Optional API keys

Copy names from `.env.local.example`. After changing env vars, restart `npm run dev`.

| Variable | Purpose |
|----------|---------|
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only; preference/rating writes after JWT verify (required in Netlify) |
| `GOOGLE_BOOKS_API_KEY` | Google Books search (required for Google hits; anonymous quota returns 429) |
| `NYT_BOOKS_API_KEY` | NYT bestsellers on Browse ([free key](https://developer.nytimes.com/)) |
| `ISBNDB_API_KEY` | ISBNdb search |
| `BIG_BOOK_API_KEY` | Big Book semantic search ([free key](https://bigbookapi.com)) — server-only |

Browse search still works without `NYT_BOOKS_API_KEY` — only the bestsellers strip is omitted. Without `BIG_BOOK_API_KEY`, Big Book simply contributes 0 results.

Missing covers are backfilled from the keyless [BookCover API](https://bookcover.longitood.com) (Goodreads covers) — no configuration needed.

### Deploying (Netlify)

Set the same variables in **Netlify → Site configuration → Environment variables** (not only in `.env.local`). Redeploy after adding keys so the server runtime picks them up.

## Project structure

```
app/           # Routes and pages
components/    # Shared UI components
lib/           # Supabase clients and utilities
types/         # Shared TypeScript types
```

## Routes

| Path     | Description                          |
|----------|--------------------------------------|
| `/`      | Home                                 |
| `/browse`| Browse catalog                       |
| `/faq`   | FAQ (Beta details)                   |
| `/preferences` | Content preferences (auth required) |
