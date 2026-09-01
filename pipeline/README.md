# pipeline/

Turns external source data into the clean, normalized JSON the app reads.

```
pipeline/
  fetch/       download raw data from external sources -> raw/
  validate/    schema-check raw data before anything downstream touches it
  transform/   raw/ -> normalized, bioguide_id-keyed JSON -> output/
  raw/         checked-in raw snapshots (committed, never gitignored)
  output/      checked-in normalized JSON the app imports (committed)
```

## Why raw data is committed

Builds are reproducible and have no live network dependency. Source data
updates are reviewed as normal git diffs on the files in `raw/`, not applied
silently. See `.github/workflows/voteview-freshness.yml` for the automated
"check weekly, gate acceptance on a human" flow.

## Stages

| Stage       | Command                  | Status (session 1)                         |
| ----------- | ------------------------ | ------------------------------------------ |
| fetch       | `pnpm fetch`             | implemented — Voteview + congress-legislators |
| validate    | `pnpm validate`          | minimal Zod stubs — real schemas are later |
| transform   | `pnpm transform`         | stub — proves the pipeline runs end to end |

`pnpm pipeline` runs all three in order.

Each fetch script is runnable on its own (`pnpm fetch:voteview`,
`pnpm fetch:legislators`) and simply overwrites the files in `raw/`.

## Conventions

- **`bioguide_id` is the only identifier that appears in `output/`.** Voteview's
  native `icpsr` id is mapped to `bioguide_id` during `transform`, using the id
  blocks in the congress-legislators data. See `docs/DATA_CONVENTIONS.md`.
- Scripts are TypeScript, run with `tsx`. No build step.
- `output/` is normalized: one fact in one place. Page-shaped, denormalized data
  is joined at build time by the app, never stored pre-joined here.
