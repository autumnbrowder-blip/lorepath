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
| `GOOGLE_BOOKS_API_KEY` | Higher Google Books rate limits |
| `NYT_BOOKS_API_KEY` | NYT bestsellers on Browse ([free key](https://developer.nytimes.com/)) |
| `ISBNDB_API_KEY` | ISBNdb search |
| `HARDCOVER_API_TOKEN` | Hardcover search ([API token](https://hardcover.app/account/api) / settings) — server-only |

Browse search still works without `NYT_BOOKS_API_KEY` — only the bestsellers strip is omitted.

### Deploying (Netlify)

Set the same variables in **Netlify → Site configuration → Environment variables** (not only in `.env.local`). Redeploy after adding keys so the server runtime picks them up.

**Hardcover specifically** (if the browse UI shows no Hardcover hits / a config warning):

1. Exact name: `HARDCOVER_API_TOKEN` (no spaces, no `NEXT_PUBLIC_` prefix).
2. Value: the raw JWT from Hardcover settings — do **not** include a `Bearer ` prefix or wrapping quotes (the app adds `Bearer `).
3. Scopes: enable for **Production** (and Preview if you test deploy previews), including **Runtime / Functions** — not Builds-only.
4. Trigger a **new deploy** after saving — changing env alone does not update an already-running site.
5. Confirm in function logs: you should see `[Hardcover] searchHardcover done` with `books > 0`, not `HARDCOVER_API_TOKEN is missing` or `unauthorized`.
6. Local check: with the token in `.env.local`, restart `npm run dev`, search `dune` on Browse — the source chip should show `Hardcover (N)` with N > 0.

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
