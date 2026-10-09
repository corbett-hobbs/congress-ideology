# Individual law pages: plan

A native page for every public law (93rd Congress on, 12,619 laws as of 2026-10-09), so a reader gets the summary,
actions, sponsor, cosponsors, votes, amendments and related bills here instead of on congress.gov.

Scope is **laws only**, not every bill. Failed and stalled bills are out of scope.

Status: **Phase 1 built** (2026-10-09, uncommitted at the time of writing); Phase 2 planned. Recommended effort: **medium** for Phase 1, **high** for Phase 2.

---

## What the repo has today

| Item | State | Where |
| --- | --- | --- |
| Full CRS summary | In raw (`summary_html`, one picked version per law); only the first sentence is in `laws.json` | `pipeline/raw/congress-gov/<93-107>.json`, `pipeline/raw/govinfo-billstatus/<108-119>.json` |
| Actions | **Only** floor, presidential, became-law and resolving-differences actions (`keepAction` in `pipeline/fetch/laws-raw.ts`). Introduction and committee actions are dropped. About 12-16 per law. | same |
| Sponsor | Done | `laws.json` (`sponsor_bioguide_id`) |
| Cosponsors | Ids only, withdrawn dropped | `laws_cosponsors.json` |
| Committees and referral steps | Done | `laws_committees.json` |
| Passage vote totals | Done (yea/nay and roll number per chamber, plus override votes) | `laws.json` (`house`, `senate`, `override_votes`) |
| Who voted yea/nay | **Not downloaded.** Voteview rollcalls are totals only. | `pipeline/raw/voteview/rollcalls_93on.json` |
| Amendments | **Stripped on purpose** (`<amendments>` removed in `pipeline/fetch/billstatus-lib.ts`) | n/a |
| Related bills | **Not kept**; the source field `relatedBills` exists | n/a |

Cache situation:

- 108th-119th: the GovInfo Bill Status ZIPs are cached locally (`pipeline/raw/_scratch/govinfo-billstatus/`, about
  471 MB, gitignored) and contain everything. A re-parse needs no network.
- 93rd-107th: the cached Congress.gov responses (`pipeline/raw/_scratch/congress-gov/`) are **already slimmed** to the
  same shape as the committed raw files. Anything beyond that needs a new Congress.gov API fetch (`CONGRESS_API_KEY`).

---

## Phase 1: law pages from data already in the repo

No new fetching. Ships a useful page for all 12,619 laws.

### Pipeline

- New `pipeline/transform/law-details.ts` (+ test) writes `pipeline/output/law_details/<congress>.json`, one shard
  per Congress, keyed by `law_id`. Each record carries:
  - full CRS summary as clean text (HTML stripped), stored once per law
  - the kept actions, with roll-call references
  - cosponsor bioguide ids
  - sponsor
  - committee steps
  - both chambers' passage tuples and any override votes
- Schemas in `lib/law-details-entities.ts` (zod, parsed at the boundary like the other tracks).
- New section in `docs/DATA_CONVENTIONS.md`; update the table in `ARCHITECTURE_MAP.md`.
- Add the transform to `pnpm transform` so `pnpm pipeline:check` covers it in CI.
- **Gate:** the shards' law ids equal `laws.json` exactly (same style as the committee-bills gate).

### App

- Route: `/congress/laws/[law_id]/[name_slug]`. A valid id with a stale slug redirects (same pattern as member and
  justice pages).
- `lib/law-details-data.ts` (`server-only`) reads one Congress shard and joins sponsor, cosponsors, signer (derived
  from the signing date, never stored), committees and administrations at build time.
- Page sections, built with `components/PageHeader.tsx` (no `max-w-*`):
  1. Header: title, "Public Law 118-90", signing date, signer, sponsor, policy area.
  2. Summary.
  3. Timeline of the kept actions.
  4. Passage votes: yea/nay per chamber, vote type (roll, voice, unanimous consent, unstated), override votes.
  5. Cosponsors: party split bar plus list, linking only to members who have a page.
  6. Committees, linked where a committee page exists.
  7. "Official record" link out to congress.gov.
- "Data notes" under the timeline says introduction and committee actions are not included yet (until Phase 2).
- The Laws list title (`components/laws/LawsListCard.tsx`) links to the new page instead of congress.gov.
- Sitemap entries (`app/sitemap.ts`), an OG image, and a `next.config.ts` `outputFileTracingIncludes` entry for the
  new shard path.
- Follow `ARCHITECTURE_MAP.md` "Page-level layout rules" (labels that never vanish, solid colours, etc.).

### Build size

12.6k static pages is the main risk. Default: `generateStaticParams` for the most recent Congresses plus major laws,
with `dynamicParams` on for the rest (same approach as the justice pages). Measure `next build` time before deciding to
pre-render everything.

### Tests

- Transform unit tests and schema tests.
- The exact-match gate above.
- A render check on one old law (e.g. 93rd) and one new law (e.g. 119th), one with a veto override, one with a voice vote.

### As built (differences from the plan)

- Shards carry only the summary and actions. The sponsor, cosponsors, committees, passage tuples and override votes are joined from `laws.json`, `laws_cosponsors.json` and `laws_committees.json` at build time instead of being copied into each shard, so there is one source for each fact. The gate compares law ids with `laws.json`.
- The transform is `law-details.ts` (pure) plus `law-details-run.ts` (I/O), the repo's usual split.
- The summary is not always full: the fetchers cap raw summaries at 3,000 characters, so 2,321 of 12,619 are cut (ended on a finished sentence, flagged, with a Congress.gov link). Lifting the cap belongs in Phase 2a.
- Build measurement: `next build` with the two newest Congresses plus Mayhew major laws pre-rendered (about 1,100 law pages) took 33 s in total; the rest render on first request.

### Done when

- `pnpm pipeline:check`, tests, lint and `next build` pass.
- Every law in `laws.json` resolves to a page; the Laws list links to it.

---

## Phase 2: the fields we do not have yet

Each step is independent and can ship on its own. The page shows a section only where data exists for that law.

### 2a. Re-parse the cached Bill Status ZIPs (108th-119th, no network)

- Extend `pipeline/fetch/billstatus-lib.ts` to keep: the **full** action list, amendments, related bills, cosponsor
  names and dates (including withdrawn, flagged).
- Run `pnpm fetch:billstatus -- --rebuild`. Existing fields must stay byte-identical; only additions are expected in
  the committed raw JSON diffs. Review that diff before committing.
- Update `law-details.ts`, the schemas and the page (timeline gains introduction and committee actions; new
  Amendments and Related bills sections).

### 2b. Same fields for the 93rd-107th (new API fetch)

- New fetch via Congress.gov (`CONGRESS_API_KEY`): roughly 6k laws, several endpoints each (actions, amendments,
  related bills, cosponsors). Needs rate-limit handling and a resumable cache.
- Slowest and riskiest step. Can be done last or skipped; older laws then show the Phase 1 sections only, with a data
  note.

### 2c. Who voted yea/nay

- New fetch: Voteview `HSall_votes.csv`, reduced to the roll calls attached to laws and keyed by `bioguide_id`
  (via `id_crosswalk.json`). Output is compact: member -> yea / nay / other per roll call.
- Page: a vote breakdown by party, and member names that link to a profile only where one exists.
- Limits to show on the page: voice votes and unanimous consent have no member list; many laws have several roll
  calls (House, Senate, concurrence, override), so each is labelled.

### 2d. Freshness and docs

- Add the new outputs to the weekly `laws-freshness.yml` and `voteview-freshness.yml` workflows.
- Update `docs/DATA_CONVENTIONS.md`, `docs/LAWS_METHODOLOGY.md` and `ARCHITECTURE_MAP.md`.

### Done when

- 2a: 108th-119th laws show a full timeline, amendments and related bills.
- 2c: laws with a recorded vote show the party breakdown and a member list.
- 2b only if taken on: 93rd-107th match the same sections.

---

## Open decisions

1. Pre-render every law page, or recent Congresses plus major laws with the rest on demand? (Recommended: the latter,
   pending a build-time measurement.)
2. Ship Phase 1 with a thinner timeline (no introduction or committee actions), or wait for 2a? (Recommended: ship
   Phase 1 with the data note.)
3. Take on 2b (93rd-107th API fetch), or let older laws show fewer sections?
