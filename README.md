# Drizzypips Hub

Vite + React + TypeScript + Tailwind CSS, with Supabase for data, auth, and storage.

## Getting started

```bash
npm install
```

Copy the environment template and fill in your Supabase project values:

```bash
cp .env.example .env.local
```

`.env.local` is git-ignored. Only `VITE_`-prefixed variables reach the browser, so
never place a service-role key in one.

Start the dev server:

```bash
npm run dev
```

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run typecheck` | Type-check with no emit |
| `npm run build` | Type-check, then build for production |
| `npm run lint` | Run ESLint |
| `npm run preview` | Serve the production build locally |

`build` runs `typecheck` first so type errors fail the build instead of shipping.

## Low-memory machines

On machines with little free RAM, `npm run build` can abort during the transform step:

```
FATAL ERROR: Zone Allocation failed - process out of memory
```

This is the OS refusing memory, not a JS heap ceiling. Cap V8's heap so it stays
within what is actually available:

```bash
NODE_OPTIONS="--max-old-space-size=1024" npm run build
```

Closing memory-heavy background apps helps as well. The cap is deliberately kept
out of `package.json` so CI and normal machines use Node's defaults.

## Database types

`src/types/database.types.ts` mirrors the Supabase schema. Regenerate it after any
migration rather than editing it by hand:

```bash
npx supabase gen types typescript --linked > src/types/database.types.ts
```
