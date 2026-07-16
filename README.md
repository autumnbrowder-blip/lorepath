# LorePath

A Next.js 14+ app for exploring lore and premium narrative content.

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
| `/browse`| Browse placeholder catalog           |
| `/paid`  | Protected paid features (auth required) |
