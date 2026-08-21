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

This is the OS refusing memory, not a JS heap ceiling. Two things are needed, and on a
~4 GB machine neither works without the other:

```bash
NODE_OPTIONS="--max-old-space-size=3072" npm run build
```

**Stop the Vite dev server first.** It holds enough RAM on its own to make the build
fail, and the failure looks identical to a heap-size problem. A verified run on a
3.86 GB machine with the dev server stopped took **15m 22s** and produced a 968 kB
JS bundle — slow, but it completes. A smaller cap such as `1024` does not help here:
the transform step needs more than that, so it aborts sooner rather than later.

The cap is deliberately kept out of `package.json` so CI and normal machines use
Node's defaults.

## Database types

`src/types/database.types.ts` mirrors the Supabase schema. Regenerate it after any
migration rather than editing it by hand:

```bash
npx supabase gen types typescript --linked > src/types/database.types.ts
```
