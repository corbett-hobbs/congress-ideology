# congress-ideology

A data-driven directory of every member of the U.S. Congress — profile pages,
filters, and visualizations built on their voting record (DW-NOMINATE ideology
scores from Voteview) and biographical data.

Personal project. Early foundation stage — no feature pages yet.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4**, themed from the design tokens in `app/globals.css`
- **pnpm**
- Data pipeline in `pipeline/` (fetch → validate → transform), run with `tsx`
- **Vitest** for unit tests
- CI on GitHub Actions: type-check, lint, test, build on every push

## Getting started

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

Requires Node >= 20.9 (see `.nvmrc` — Node 24).

## Common commands

```bash
pnpm dev            # dev server
pnpm build          # production build
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint
pnpm test           # vitest run

pnpm fetch          # download all raw source data into pipeline/raw/
pnpm validate       # schema-check raw data
pnpm transform      # raw/ -> normalized JSON in pipeline/output/
pnpm pipeline       # fetch + validate + transform
```

## Layout

```
app/            Next.js routes
components/      shared React components (empty until there are features to factor out)
lib/            shared types and utilities
pipeline/       data pipeline — see pipeline/README.md
docs/           DATA_CONVENTIONS.md, CREDITS.md
```

## Data & attribution

Ideology scores come from Voteview. See `docs/CREDITS.md` for the required
citation (which must surface in the site footer once pages exist) and
`docs/DATA_CONVENTIONS.md` for the identifier and entity-model conventions.
