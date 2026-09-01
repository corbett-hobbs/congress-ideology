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

| Stage     | Command          | What it does                                                        |
| --------- | ---------------- | ------------------------------------------------------------------ |
| fetch     | `pnpm fetch:all` | download Voteview + congress-legislators into `raw/`               |
| validate  | `pnpm validate`  | schema-check `raw/`: missing fields, bad numbers, duplicate keys   |
| transform | `pnpm transform` | `raw/` → `id_crosswalk`, `legislators`, `terms`, `ideology_scores` in `output/` + `_report.json` |

- `pnpm pipeline` runs all three in order (fetches from upstream).
- `pnpm pipeline:check` runs validate + transform on the committed `raw/` and
  fails if `output/` would change — this is what CI runs.
- Each fetch script is runnable on its own (`pnpm fetch:voteview`,
  `pnpm fetch:legislators`) and overwrites the files in `raw/`.

## Output

| File                   | Grain                                        |
| ---------------------- | -------------------------------------------- |
| `id_crosswalk.json`    | one row per `icpsr`                           |
| `legislators.json`     | one row per `bioguide_id`                     |
| `terms.json`           | one row per (bioguide_id, congress, chamber)  |
| `ideology_scores.json` | one row per (bioguide_id, congress, chamber)  |
| `_report.json`         | run summary and sanity numbers                |

See `docs/DATA_CONVENTIONS.md` §2 for the full contract; schemas are in
`lib/entities.ts`.

## Conventions

- **`bioguide_id` is the only identifier that appears in `output/`.** Voteview's
  native `icpsr` id is mapped to `bioguide_id` during `transform`, using the id
  blocks in the congress-legislators data. See `docs/DATA_CONVENTIONS.md`.
- Scripts are TypeScript, run with `tsx`. No build step.
- `output/` is normalized: one fact in one place. Page-shaped, denormalized data
  is joined at build time by the app, never stored pre-joined here.
