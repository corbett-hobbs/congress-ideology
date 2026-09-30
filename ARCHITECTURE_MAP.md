# Architecture map

A one-page index of where things live: the data layer, the routes, and the
shared components every view is built from. Paths here are verified against the
tree as of the committees session (Session 5). When you touch an area, correct
anything that has drifted.

---

## Data layer

The pipeline (`pipeline/`) fetches raw snapshots, validates them, and transforms
them into normalized JSON in `pipeline/output/` (all committed). The app reads
those at build time and joins them into page-shaped data — nothing pre-joined is
stored. See `docs/DATA_CONVENTIONS.md` for the full contract.

| `pipeline/output/`            | Grain                                     | Key                            | Built by                     | Read by |
| ---------------------------- | ----------------------------------------- | ------------------------------ | ---------------------------- | ------- |
| `id_crosswalk.json`          | one row per `icpsr`                        | `icpsr`                        | `transform/crosswalk.ts`     | transform only |
| `legislators.json`           | one row per person                         | `bioguide_id`                  | `transform/legislators.ts`   | `lib/congress-data.ts` |
| `terms.json`                 | (legislator, Congress, chamber)            | `bioguide_id`+`congress`+`chamber` | `transform/terms.ts`     | `lib/congress-data.ts` |
| `ideology_scores.json`       | (legislator, Congress, chamber)            | `bioguide_id`+`congress`+`chamber` | `transform/scores.ts`    | `lib/congress-data.ts` |
| `committees.json`            | one row per top-level committee (119th)    | `committee_id` (THOMAS id)     | `transform/committees.ts`    | `lib/committee-data.ts` |
| `committee_memberships.json` | (legislator, committee) (119th)            | `bioguide_id`                  | `transform/committees.ts`    | `lib/committee-data.ts` |
| `member-photos.json`         | which current members have a photo         | —                              | `fetch/photos.ts`            | `lib/congress-data.ts` |
| `wikipedia_summaries.json`   | one row per current member with a usable Wikipedia article (trimmed lead) | `bioguide_id` | `fetch/wikipedia.ts` (+ `wikipedia/trim.ts`) | `lib/wikipedia-bio.ts` → `profile/ProfileHeader` |
| `_report.json`               | run summary / sanity numbers               | —                              | `transform/index.ts`         | humans |
| `subcommittees.json`         | one row per subcommittee (119th)           | `subcommittee_id`              | `transform/committees.ts` (`buildSubcommittees`) | `lib/committee-data.ts` |
| `subcommittee_memberships.json` | (legislator, subcommittee) (119th)      | `bioguide_id`                  | `transform/committees.ts`    | `lib/committee-data.ts` |
| **Supreme Court track** (`court/`) — separate from Congress | | | | |
| `court/justices.json`        | one row per justice (person)               | `justice_id` (SCDB numeric)    | `transform/court.ts` via `court-run.ts` | `lib/justice-data.ts` |
| `court/mq_scores.json`       | (justice, term)                            | `justice_id`+`term`            | `transform/court.ts`         | `lib/justice-data.ts` |
| `court/court_terms.json`     | (term[, segment a/b])                      | `term`+`segment`               | `transform/court.ts`         | `lib/justice-data.ts` |
| `court/court_median_probabilities.json` | (term[, segment], justice)      | `term`+`segment`+`justice_id`  | `transform/court.ts`         | `lib/justice-data.ts` |
| `court/_report.json`         | run summary                                | —                              | `transform/court-run.ts`     | humans |
| `financial_disclosures.json` | (legislator, reporting year), band-count grain | `bioguide_id`+`year`       | Python sidecar: `pipeline/financial_disclosures/build.py` / `build_senate_html.py` / `build_ocr.py` | `lib/wealth-data.ts` |
| `line-items/<year>.json`     | (legislator, reporting year) that reconciled, item grain | `bioguide_id`+`year`, sharded by `year` | `pipeline/financial_disclosures/build_line_items.py` | `lib/line-items-data.ts` |

Court raw sources: Martin-Quinn `pipeline/raw/mq/<year>/{justices,court}.csv` (hand-placed/`--adopt`ed — the host bot-challenges scripts; fetch: `fetch/mq.ts`, pure helpers `fetch/mq-check.ts`) and FJC bios `pipeline/raw/fjc/*.csv` (`fetch/fjc.ts`); committed hand-reviewed crosswalk `pipeline/transform/court-crosswalk.json`; schemas `lib/court-entities.ts`. Freshness: `.github/workflows/mq-freshness.yml` (monthly, warns instead of failing on a challenge). See DATA_CONVENTIONS §6.

Raw sources: Voteview `HSall_members.csv` / `HSall_parties.csv`;
`@unitedstates/congress-legislators` `legislators-current.yaml`,
`legislators-historical.yaml`, `committees-current.yaml`,
`committee-membership-current.yaml`. Committee data is **current-Congress only**
— there is no historical roster file — so the committee views are pinned to the
latest Congress and carry no trend chart.

### Build-time joins (`lib/`, `server-only`)

| Module                | Produces                                                     |
| --------------------- | ----------------------------------------------------------- |
| `lib/congress-data.ts`| `ChamberCurrent` / `ChamberHistory` / `MemberProfile`; `getCurrentMemberIndex()` (shared by committee-data) |
| `lib/committee-data.ts`| `CommitteeSummary` / `CommitteeProfile` — joins the roster to each member's latest-Congress score and **blends each committee to a `(dim1, dim2)` point** (unweighted mean) + `spread` (`max−min` dim1). Also resolves `compassColorClass` (chamber → fill class, via `lib/committee-palette.ts`) once per committee here, at the data-prep layer — `CommitteeCompass` just reads the field, no member-vs-committee branching in the chart component. Also builds `byMember` (`committee_memberships.json` inverted to `bioguide_id`-keyed) for `getMemberCommitteeMemberships()` — a member's own committee list, role-then-seniority sorted. Client-safe shapes in `lib/committee-types.ts`. |
| `lib/committee-palette.ts` | Committee-compass **chamber**-identity colours (House / Senate / joint→neutral) — a deliberate departure from `lib/party-palette.ts`'s majority-party colouring, scoped to compass dots only (`committee/CommitteeCompass`). "How each committee votes" (`CommitteeSwarm`) still uses party colours per member seat, unaffected. Validated via `validate_palette.js` (see its `FORCED_PAIRS`/`NEW_KEYS` — these colours never co-occur with a real `party_code`, so the automatic co-occurrence detection can't see them; they're checked explicitly instead). |
| `lib/neighbors.ts`    | `nearestNeighbors` — generic over any `{dim1, dim2}` entity (members *and* committees), with `ideologicalDistance` |
| `lib/wealth-data.ts`  | Reads `financial_disclosures.json` + `terms.json`, `server-only`. `getWealthData()` — every current member joined to usable filing years (cohort-wide, for `/wealth`). `getMemberWealthProfile(bioguideId)` — one member's *every* row (not just usable), classified per year by `buildProfileYears` (`lib/wealth-derive.ts`), plus reconciled line-item rows — the profile card's payload. Re-exports `lib/wealth-derive.ts` in full. |
| `lib/wealth-derive.ts`| Pure, unit-tested data-shaping (no file I/O): `isUsableRow`, `buildWealthMembers`, `annualizedRate`, `hasDataGap`, `buildProfileYears` (the profile card's 4-state year classification: usable / needs_review / not_extractable / no_filing), `filingYearOf`, the compact client payload codec (`toWealthPayload`/`fromWealthPayload`). |
| `lib/wealth-bands.ts` | EIGA band label → `(lo, hi)` bounds, TS restatement of `pipeline/financial_disclosures/bands.py`; `filingRange()` sums a filing's band counts into a net worth range. |
| `lib/line-items-data.ts` | Reads `pipeline/output/line-items/<year>.json`, `server-only` — the **first sharded** pipeline output (every other `lib/*-data.ts` reader assumes one flat file). Indexes all shards once by `bioguide_id` then `year`; degrades to empty (not an error) if the directory doesn't exist yet in a checkout. |
| `lib/disclosure-url.ts` | `sourceDocUrl(sourceSystem, sourceDocId, year)` — the app-side restatement of `fetch.py`'s House PDF URL template and `senate_fetch.py`'s Senate report URL template (no such builder existed before Session 6). |

---

## Routes (`app/`)

| Route                                               | Kind | Renders |
| --------------------------------------------------- | ---- | ------- |
| `/`                                                 | static | Hub — a card per branch (`lib/verticals.ts`): Congress (party-mean sparkline + dim-1 gap stat for the latest Congress, from `getBothTrend()`) and Supreme Court (median justice's name for the latest term + court-median sparkline, from `getCourtHubSummary()` in `lib/justice-data.ts`; no numeric score). Redirect target of nothing; bare `/` never redirects. |
| `/supreme-court`                                    | static | `CourtExplorer` — "How Does the Supreme Court Lean?": sticky toolbar (Appointed by party pills + president dropdown, term slider), chart 1 `JusticeStrip` (beeswarm of the selected term), chart 2 `PresidentRows` (career average by appointing president), chart 3 `JusticeTrajectory` (every justice over time). One shared `term` / `appointed` / `president` / `selectedId` in `CourtExplorer`. One section, so no secondary header row. |
| `/congress`                                         | static | `SenateExplorer` — the compass / delegation / trend explorer, with a Members ↔ Committees toggle (119th only). Reads `?chamber`, `?state`, `?show`. |
| `/congress/senators/[bioguide_id]/[name_slug]`      | SSG + dynamic | `MemberProfileView` (stale slug → 308, bad id → 404) |
| `/congress/house/[bioguide_id]/[name_slug]`         | SSG + dynamic | `MemberProfileView` |
| `/congress/committees/[committee_id]/[name_slug]`   | SSG + dynamic | `CommitteeProfileView` — same shape as a member profile minus the trajectory chart |
| `/data/[chamber]`                                   | static JSON | the scrub-through-time payload, fetched on demand |
| `/congress/wealth`                                  | static | `WealthPageClient` — chamber/state filter bar, the net worth scatter ("where they started, where they are now"), highest/lowest lists. |
| `/sitemap.xml`, `/robots.txt`, `/opengraph-image`   | static | — |

`next.config.ts` `redirects()`: `/wealth` → `/congress/wealth` (308) and, for each explorer query param (`chamber`, `state`, `show`), `/?<param>` → `/congress` (308, query carried through). Bare `/` serves the hub. The `#delegation` hash can't be redirected server-side. `/supreme-court` is the Court branch (`status: 'live'` in `lib/verticals.ts`).

Each `*/[.../name_slug]` route also has `opengraph-image.tsx` (rendered on
demand) and `not-found.tsx`. Routes that read `pipeline/output/*.json` via `fs`
are listed in `next.config.ts` `outputFileTracingIncludes` (keyed by route; the static pages `/`, `/congress`, `/congress/wealth` read the JSON at build time and need no entry).

---

## Shared chart components (`components/`)

Low-level primitives → chart bodies → typed wrappers. A change to a body applies
to members and committees at once — there is no forked chart code.

| Layer            | Component                          | Notes |
| ---------------- | --------------------------------- | ----- |
| primitive        | `charts/ChartFrame`, `charts/Axis`, `charts/Tooltip` | responsive SVG frame, ticks/gridlines, pointer-following tooltip (`useTooltip` is generic) |
| body             | `charts/ScatterPlot`              | the 2-D compass: draw order, hover, click-to-navigate, focus fade, domain-positioned labels, optional faint backdrop. Accessors + `renderTooltip` in, no entity knowledge. |
| body             | `charts/SwarmRows`                | the 1-D row list: label gutter (clamped to width), min→max connector, endpoint emphasis, right-hand meta, per-row and per-point click |
| member wrapper   | `senate/CompassChart`            | `ScatterPlot` + member accessors (`partyFillClass`, `MemberTooltip`, `memberPath`/`hasProfilePage`) |
| member wrapper   | `senate/DelegationChart`         | `SwarmRows` + state grouping (`buildDelegations`), pair (dumbbell) and range modes |
| identity header  | `profile/ProfileHeader` vs. `committee/CommitteeHeader` | Same structural pattern (eyebrow, serif name, meta line, sub-line) — **deliberately not** a shared component. `ProfileHeader` keeps a `w-[84px]`/`w-28` photo slot (`w-24`/`w-28` when a Wikipedia bio is present; see below) (a real, systematically available per-member asset); `CommitteeHeader` has **no photo/seal placeholder at all** (a monogram was tried and dropped — pure decoration, no informational content, unlike the member photo) and reclaims that width, so its header isn't capped at `ProfileHeader`'s photo-driven `max-w-[52rem]` — it runs out to the page's own `max-w-[1180px]` instead. |
| committee wrapper| `committee/CommitteeCompass`     | `ScatterPlot` + committee accessors (dot colour read straight off `CommitteeSummary.compassColorClass`, joint→neutral, `CommitteeDotTooltip`, `committeePath`) |
| committee wrapper| `committee/CommitteeSwarm`       | `SwarmRows` + one row per committee, party-split meta, chamber-disambiguated labels |
| control           | `charts/SortToggle`               | Shared "Widest spread / A–Z / Ideology" pill group behind both "How each state votes" and "How each committee votes" (`SenateExplorer`). "Ideology" is reversible (click again to flip direction) instead of pick-one-of-N; `DelegationChart` and `CommitteeSwarm` both take a `SortState` and sort their own row-level mean-dim1 field on it. |
| control           | `charts/PillGroup`                | Generic controlled pick-one pill group in the same chrome as `ChamberSwitch`/`SortToggle`. Used by the Court explorer for "Appointed by" and the president sort. |
| shell             | `charts/ChartCard`                | The explorer card chrome (serif title, optional action on the title row, lede, body) extracted from `SenateExplorer` and shared with `CourtExplorer`. |
| primitive        | `charts/AlignmentTrack`           | Small inline two-dot [-1, 1] comparison (a member's own position vs. a reference point) — plain divs, not an SVG `ChartFrame` body, since it's one comparison per profile-card row rather than a shared-axis multi-row chart. Introduced for `profile/CommitteeMembershipsCard`; reusable anywhere a single "this thing vs. that thing" ideology comparison is needed. |

`components/senate/BeeswarmChart` (d3-force collision layout) is still its own
chart — the profile-page single-state delegation and, potentially, a future
committee roster swarm. Not yet folded into a primitive.

### Wealth track (`components/wealth/`, `/congress/wealth` + profile pages)

Built on the same `charts/ChartFrame` + `charts/Axis` + `charts/Tooltip`
primitives as the ideology charts — no parallel chart stack.

| Component | Notes |
| --------- | ----- |
| `wealth/NetWorthScatterCard` | "Where they started, where they are now" — first vs. latest net worth on a square, shared `asinh` signed-log domain capped at ±$20M, no-change diagonal, clipped-point diamonds, click-to-navigate dots (`memberPath`/`hasProfilePage`), select-in-place member search, `<details>` table fallback |
| `wealth/WealthListsSection`, `wealth/WealthList`, `wealth/Sparkline` | Highest/lowest net worth lists, each row's own min/max-scaled sparkline over the shared 2013–2025 axis |
| `wealth/WealthFilterBar` | Chamber switch (`components/ChamberSwitch`) + state dropdown (`components/senate/StateFilter`) — the same controls the homepage explorer uses, wired to page-level state instead of URL params |
| `profile/MemberWealthSection` | The profile page's full-width "Net worth over time" card (sibling to `MemberIdeologySection`/`CommitteeMembershipsCard` in `MemberProfileView`) — absent (not an empty state) for a member with zero `financial_disclosures.json` rows |
| `wealth/MemberNetWorthChart` | One member's midpoint line + range band, one point per covered year. No existing click-to-select-driving-a-dropdown pattern existed before this — built from scratch, modeled on `senate/SenatorTrajectoryChart`'s zoom-to-data y-domain. Gaps break the band and bridge the midpoint line with a dashed segment (restricted to gaps *between* the member's own first/last data year — labeling every pre-entry year up to the 2013 floor was tried and reverted, it buried the axis). Open-ended bands get one chart-wide top gradient fade rather than a precise per-point effect (documented trade-off in the component). |
| `wealth/MemberWealthItemsPanel` | The chart's year-linked assets/liabilities list — year dropdown (years with a reconciled `line-items` row only), sticky section headers, falls back to the band-count total (no fabricated items) for a year Session 5 didn't reconcile |

`WealthMemberTooltip` (hover-card content, scatter + hover-linked from search)
and `wealth-copy.ts`/`wealth-scatter.ts` (pure transform/standout-picking
helpers, unit-tested) round out the scatter's own supporting files.

### Wikipedia bio in the member header (`components/profile/ProfileHeader.tsx`)

`MemberProfileView` passes `bio` (`getMemberWikipediaBio()` from
`lib/wikipedia-bio.ts`, `WikipediaBio` in `lib/wikipedia-types.ts`) to
`ProfileHeader`. With a bio, at `lg`+ the header is one top-aligned row: photo,
a fixed `380px` details column, then the bio column (`flex-1`, `--line` left
border) — `relative` with an `absolute inset-0 overflow-hidden` inner column so
it adds **no height**; the header height is still set by the photo / details.
Below `lg` the bio stacks under the photo + details row behind a top rule, with
no line clamp. Body text is clamped to **4 lines** at `lg`: the 5-line clamp in
the design spec does not fit — the shortest real header is 137px (photo-driven)
and label + 5 lines + attribution needs ~154px. Members with no record render
the header exactly as before (same markup, `max-w-[52rem]`); the 16 members of
the 119th Congress who already left office aren't in `legislators-current.yaml`,
so they (and `James Gallagher`, no `id.wikipedia`) have no bio.

The data file is refreshed weekly by `.github/workflows/wikipedia-freshness.yml`
(fetch → diff → PR on a meaningful diff, never auto-merged); CI does **not**
re-fetch, it only Zod-validates the committed file (`pnpm validate`).

### Committee page shell (`components/committee/`)

`CommitteeProfileView` → `CommitteeHeader` (no photo/seal — see the identity
header row in the table above; control + compact `14R·9D` split, shared with
`CommitteeSwarm`'s `partySplit`; Chair / Ranking Member from the real
`title` field, never inferred from roster order) + `CommitteeCompassCard`
(compass fed committees, "All committees" / "Nearest neighbors" toggle,
`CommitteeNeighborChips` in neighbour mode) + `CommitteeRosterCard`
(single-row swarm + scrollable roster list, no
trajectory chart).

### Two-tier nav and header back-link (`lib/verticals.ts`, `components/SiteHeader.tsx`, `components/SiteNav.tsx`, `components/BackLinkContext.tsx`)

`lib/verticals.ts` holds `branches: Branch[]` — `{ id, label, href, status: 'live' | 'soon', sections, owns(pathname) }` — Congress (sections Ideology `/congress`, Wealth `/congress/wealth`) and Supreme Court (`/supreme-court`, one section, `status: 'live'`). `SiteNav` is the primary row (live branches only, current one underlined; profile pages under `/congress/...` count as Congress). `SiteSectionNav` is the secondary tab row, rendered only for a live branch with two or more sections, on its section pages (not on profiles, the hub, or the Court). The Court's `status` is now `live`, so it has its nav entry and a linked hub card. The header is **not** sticky; the explorer/wealth toolbars pin at `top-0 z-40` exactly as before.

The wordmark is a plain link to `/` (no arrow) on `/`, `/congress`, `/congress/wealth`, `/supreme-court`; everywhere else it is `← InsideGov` going to whatever the page registered via `SetBackLink` (falls back to `/`). `BackLinkProvider` (wraps the body in `layout.tsx`) plus a page-level `<SetBackLink href={...} />` (used by `MemberProfileView` and `CommitteeProfileView`, now pointing under `/congress`) bridge the header/page gap. Always a fixed href, never `history.back()`.

---

## Session 0.2 — the `AGENTS.md` "nextjs-agent-rules" block

`CLAUDE.md` is a single line, `@AGENTS.md`. `AGENTS.md` opens with a
`<!-- BEGIN:nextjs-agent-rules -->` block that tells an agent "This is NOT the
Next.js you know… Read the relevant guide in `node_modules/next/dist/docs/`…
before writing any code" and "committing it with your work keeps the tree
clean."

**This is legitimate Next.js 16 tooling, not an injection.** Verified:

- `git blame AGENTS.md` → the block was added in the initial scaffold commit
  (`1a582fc`, "chore: scaffold Next.js 16 app", authored by the project owner,
  2026-08-31), i.e. by `create-next-app` — not inserted later by a third party.
- `next@16.3.4` ships `node_modules/next/dist/server/lib/generate-agent-files.js`,
  which produces exactly that text (`buildAgentRulesBlock()`) and regenerates it
  on `next dev` if it goes missing. It cross-references
  `packages/create-next-app/helpers/generate-agent-files.ts` and
  `packages/next-codemod/lib/agents-md.ts`.
- `node_modules/next/dist/docs/` is the normal Next.js documentation tree
  (`index.md` is the standard "Welcome to the Next.js documentation").

The wording is heavy-handed (and Vercel shipping auto-generated agent files was
community-controversial), but there is nothing malicious here. The committees
session did **not** treat "read `dist/docs/` before any code" as a hard gate;
those bundled docs are fine to consult as ordinary vendor documentation for
Next 16 specifics. Leave the block in place — deleting it only makes `next dev`
rewrite it.

---

## Divergences: session prompt / mockups vs. the real code

The committees session prompt (`committees-feature-session-prompt.md`) and its
two HTML mockups were written without repo access. Where they differed from what
was actually here, and how it was resolved:

1. **The prompt's cited source docs don't exist.**
   `congress-ideology-requirements.md`, `TECHNICAL-REQUIREMENTS.md`, and
   `ARCHITECTURE_MAP.md` are not in the tree or git history. Anything the prompt
   attributes to them is unverified — in particular the "~320px capped list"
   figure (see #2). This file is the `ARCHITECTURE_MAP.md` the prompt expected,
   created now.

2. **Card-height / whitespace guidance was already superseded.** The prompt
   says "stop trying to match the two cards' heights… cap the tall list at a
   fixed scrollable height (~320px)… no cross-card coupling." But `main` had
   already converged (commits `b40e6a3`, `e32676e`, `9a62f22`) on grid
   `md:items-stretch` + the tall list absolutely positioned inside a `flex-1`
   wrapper so its length never drives the row height — with a 15-line comment
   in `SenateExplorer.tsx` explaining why. **Kept the shipped pattern** and
   extended it to the committees Chart 2. The committee *detail* page uses
   `items-start` + a capped scrollable roster list, matching the member profile
   page's own precedent (`MemberIdeologySection`), not a height-matching
   mechanism.

3. **`CompassChart` couldn't take committees as-is.** It was hard-typed to
   `ChamberMember` (used `bioguideId`, `lastName`, `partyCode`, `isCurrent`,
   `<MemberTooltip>`, `memberPath`). Per the prompt's own "call it out for a
   human decision" tenet, this was flagged; the chosen fix was to **extract the
   pure scatter into `charts/ScatterPlot`** (and the delegation row list into
   `charts/SwarmRows`) and make the member and committee charts thin wrappers.
   `DelegationChart` keeps its full public API and pair/range/`filterState`
   behaviour — verified unchanged in a browser.

4. **Committee identifier.** The prompt wanted the route
   `/congress/committees/[thomas_id]/…` and data keyed by `thomas_id`. The
   existing `lib/types.ts` stub and DATA_CONVENTIONS §1's "not `thomas`, not a
   synthetic slug-as-key" language both point the other way, so the field and
   route param are **`committee_id`** (holding the THOMAS id value, e.g. `HSJU`).

5. **No `--joint` colour token.** The mockups used one; the real palette
   (`lib/party-palette.ts`) has no joint entry and adding a token means
   re-running `validate_palette.js` (CVD/contrast gate). Joint committees use
   the existing neutral `oth` swatch, same as independents.

6. **Latest-Congress gate, not a hardcoded 119.** The prompt says "119th"
   throughout; the code derives the latest Congress from the data
   (`committeesLatestCongress()` / `getChamberCurrent().latestCongress`) and
   gates the toggle to that, matching the rest of the app.

7. **Committee search is a small sibling component, not a generalisation of
   `SenatorSearch`.** Search isn't one of the shared chart primitives the
   tenet is about, and the member combobox's a11y is delicate;
   `components/committee/CommitteeSearch` mirrors its chrome for committees.

8. **Long committee names.** Real short names run to
   "Homeland Security and Governmental Affairs" — far longer than the mockups'
   one-word examples. `SwarmRows` clamps its label gutter to a fraction of the
   measured width and clips overflow; the aggregate list disambiguates the
   House/Senate duplicates ("Judiciary (H)") by chamber. Two select committees
   (`HSZS`, `HSQJ`) and the Helsinki Commission (`JCSE`) keep long `short_name`s
   the derivation can't shorten — acceptable, they're niche.

9. **Assorted mockup chrome** (a `WEALTH SOON` nav done differently, an
   `← INSIDEGOV` back-link, card titles) was matched to the real `SiteNav` /
   `ProfilePanel` / profile-page components rather than ported from the mockups.

### Still open / not built (deliberately)

Subcommittees (raw data is fetched but not transformed, so the follow-up is
additive), and a per-committee and per-member bills/votes record. (The
committee-membership section on member profile pages this list used to name
as future work is now built — see "Session 3" below.)

---

## Session 2 — reversible Ideology sort, chamber-identity committee colour, header back-link

Built from `committees-round2-session-prompt.md` (superseding that document's
own forward-pointers in the original prompt's §4.2/§4.3/§4.5) plus a follow-up
mockup for the header back-link. Notes on what the prompt didn't (and
couldn't) anticipate:

1. **The sort toggle didn't exist as a shared component before this session**
   — "Widest spread" / "A–Z" were inline buttons duplicated once inside
   `SenateExplorer.tsx` for both charts, styled as separate standalone
   buttons (not the grouped-pill chrome every other toggle on the site uses).
   Per the round-2 prompt's §1.3, this session both added "Ideology" *and*
   restyled the existing two into a real grouped `role="group"` pill
   (`charts/SortToggle.tsx`), matching `ExplorerToolbar`'s chamber/Members-
   Committees toggle and `CommitteeCompassCard`'s All/Nearest-neighbors
   toggle pixel-for-pixel rather than the mockup's rounded-full pill chrome
   (mockups are unstyled-to-spec, not styled-to-ship — see the divergences
   list above).

2. **Chamber-identity committee colours required two new palette tokens, not
   a `chamber` lookup alone.** `chamber` was already a field on
   `CommitteeSummary`, so no pipeline change was needed — but *picking* two
   new colours that pass `validate_palette.js` against the existing
   dem/rep/oth tokens took real search. Green is a bad choice for one of the
   two: under simulated protanopia/deuteranopia it converges toward
   `--rep`'s red-orange almost everywhere in HSL space (confirmed by brute-
   force search, not assumption) — the shipped `--committee-house` is
   therefore a *dark* forest green (`#124912` light / `#7dd175` dark), not
   the lighter green the round-2 mockup's own reference swatch suggested.
   `--committee-senate` is a magenta (`#ad1f8a` light / `#c24799` dark).
   `validate_palette.js` gained `FORCED_PAIRS` + `NEW_KEYS` sections because
   these colours never share a real `party_code`, so the file's existing
   co-occurrence detection (driven by `ideology_scores.json`) can't see them
   automatically — they're checked against dem/rep/oth/each-other explicitly
   instead, with an absolute (not regression-relative) bar, since a
   brand-new token has no prior committed value to regress from.

3. **The header back-link change came from a third, later document**
   (`committee-page-mockup-backlink.html`, sent mid-session), not the
   round-2 prompt above. It's included in this same entry because it's a
   small, related "sub-page chrome" cleanup: the separate "← InsideGov" link
   under the header on member/committee pages was redundant with the
   already-clickable wordmark, so it was removed and folded into the
   wordmark itself (see the "Site-wide header back-link" section above). The
   mockup's own JS comment says the destination must be fixed and always the
   canonical homepage — the shipped version keeps that constraint (never
   `history.back()`) but preserves the real, richer per-page hrefs
   (`?chamber=house&show=committees`, etc.) that already existed in
   `CommitteeProfileView`/`MemberProfileView` before this session, rather
   than flattening them to a bare `/` the way the standalone mockup did —
   flagged here per this project's "flag divergence for review rather than
   silently resolving it" tenet, not silently decided.

---

## Session 3 — committee memberships card on member profile pages

New card at the bottom of every member profile page
(`member-committee-memberships-session-prompt.md` +
`member-committee-memberships-mockup.html`): every committee a member sits
on, role-then-seniority ordered, each row showing an `AlignmentTrack` of the
member's own position against that committee's blend.

- **Data was already shaped for this.** `committee_memberships.json` is
  `bioguide_id`-keyed specifically so a member's own page could look this up
  directly (original session prompt §3) — this session just built the
  lookup: `buildCommitteeIndex()` in `lib/committee-data.ts` now also
  inverts `memberships` into a `byMember` map (role tier, then `rank`,
  pre-sorted once at build time) behind `getMemberCommitteeMemberships()`.
  No pipeline change, no new join step — the member's own profile data
  (`lib/congress-data.ts`) and the committee data (`lib/committee-data.ts`)
  already run in the same server-side build step, reading the same
  committed `pipeline/output/*.json`, so the prompt's §5 concern ("confirm
  these aren't computed in separate passes") didn't apply here.
- **Confirmed, not assumed: the zero-membership case is genuinely rare.**
  22 of the 553 current members (~4%) have no current committee seat —
  spot-checked a few (Pelosi, a mid-Congress resignation, a member who left
  for an executive-branch role) and they're all real, unremarkable
  vacancy/transition cases, not a data bug. `CommitteeMembershipsCard`
  returns `null` for an empty list — the card is simply absent, never an
  empty state.
- **`AlignmentTrack` is a new primitive** (see the shared-components table
  above) — plain positioned `<div>`s, not `ChartFrame`/SVG, since it's one
  small two-point comparison per row rather than a shared-axis chart of many
  rows. Same dot-on-a-line visual language as `SwarmRows` (colour-filled
  primary dot, faint neutral reference dot) so it reads as consistent with
  the rest of the site rather than a new visual idiom, per the mockup's own
  framing.
- **Role tags don't reuse the mockup's literal colours.** The mockup's
  "Chair" pill used a hardcoded gold hex (`#f3ece1`/`#8a6a1f`) with no dark-
  theme variant. Shipped version uses existing tokens instead — Chair is
  `bg-accent text-accent-ink` (this project's one existing "this is the
  active/primary one" treatment), Ranking Member matches the mockup's own
  already-token-based style (`border-line-strong` / `surface-raised` /
  `ink-muted`) — both theme-safe for free, no new colour introduced.
- **Ranking, confirmed against the mockup's own tenet list:** role tier
  first (chair/ranking above plain member), then `rank` ascending — real
  seniority data from the source file, not alphabetical, not by committee
  size, not by ideological-alignment closeness (noted in both the prompt
  and mockup as a plausible *future* sort-toggle lens, not this card's
  default order — left for later, not built here).
- Full committees only (subcommittees were already out of scope for the
  whole committees feature). **Click target: since revised to the whole
  row**, not just the committee name — the mockup/prompt originally
  specified name-only (matching the convention elsewhere committees
  appear), but that was changed on direct request after shipping. The row
  is a single `<Link>`; the committee name is styled via `group-hover`
  rather than nested inside its own anchor.

---

## Net worth track — Sessions 1–7

Built from `net-worth-claude-code-plan.md`, seven sessions. Notes on where
the plan and the shipped code diverge, beyond what's already called out
inline in the tables above:

1. **`/congress/wealth`** shipped at `/wealth` originally; moved to the planned route in the two-tier-structure session (below).
2. **The party wealth chart was built (Session 3) then explicitly removed**
   on direct request, along with tightened list headers — a real, shipped
   feature taken back out, not a divergence in the "prompt vs. code"
   sense. `/congress/wealth` today is: filter bar, scatter, highest/lowest lists.
3. **Session 5 (line-item extraction) ran at full scale, not just the
   session's own investigate-phase sample.** The plan's Session 6 depends on
   Session 5's *output existing*; validating that against only the ~85
   locally cached House PDFs and calling it done would have left Session 6
   built against a near-empty `line-items/` directory. Session 5 fetched the
   ~2,600 remaining House PDFs from the House Clerk's own site (all already
   publicly available, same one-PDF-per-request pattern `build.py` already
   uses) before Session 6 started — 3,507 of 3,515 usable filings
   reconciled. See `docs/NET_WORTH_METHODOLOGY.md`'s "Line items and the
   profile card" section for the numbers and the reconciliation gate.
4. **No click-to-select-driving-a-dropdown pattern existed before Session
   6** — checked `senate/SenatorTrajectoryChart` (no click handler at all)
   and the wealth scatter's own `selectedId` (highlights a marker, doesn't
   drive another control). Built from scratch for `wealth/MemberNetWorthChart`
   + `wealth/MemberWealthItemsPanel`, modeled structurally on
   `SenatorTrajectoryChart`'s `ChartFrame`/`Axis`/zoom-to-data-y-domain shape.
5. **The profile card's chart x-axis and gap labels needed a second pass**
   (reported directly, not found in review): the plan says "one point per
   year covered," which a first cut read as "always plot the full
   2013–2025 window" — for a member who entered Congress well after 2013,
   or whose data starts later, that left a long empty run-up. Fixed to start
   at the member's own first reported year instead. A related bug in that
   same first cut rendered one muted gap label *per missing year* rather
   than one per contiguous run — for a multi-year gap this stacked several
   "no filing" strings on top of each other into unreadable text
   (`"no filing filing filing"`). Both fixed in `MemberNetWorthChart.tsx`.
6. **A real data-quality bug, exposed (not caused) by removing the item
   list's old single-line truncation**: some House PDF vintages' embedded
   fonts map certain glyphs — confirmed on the "L" of "LOCATION:" and the
   "D" of "DESCRIPTION:" continuation labels — to literal NUL/control
   codepoints, which pdfplumber decodes as-is rather than dropping. Hidden
   behind a `truncate` (single-line ellipsis) UI treatment on the shipped-
   then-immediately-revised item list, this only became visible once the
   list was widened and given room to show full descriptions. Fixed at the
   word-collection point in `house_line_items.py` (`_clean_word`), scoped to
   that module rather than `extract_text.py` (shared with the trusted,
   untouched `columns.py` band-counting path).
7. **The item list's remaining known display artifact**: on rare pages with
   several same-band items back-to-back, one item's description can still
   absorb a neighbor's text (the reconciliation gate only guarantees band
   *totals* match, not that every description is paired with its own value
   — documented residual risk since Session 5, see `house_line_items.py`'s
   module docstring). Mitigated in the UI with a 3-line clamp rather than
   chased further at the extraction layer in this pass.
8. **Assets/Liabilities is a toggle, not two stacked sections.** The
   original Session 6 build listed both under sticky "Assets · N items" /
   "Liabilities · N items" headers in one scrollable region — functional,
   but on a member with 300+ assets, liabilities were scrolled out of
   reach. Revised to a two-way pill toggle (same `role="group"` pattern as
   `ChamberSwitch`) that replaces the panel's title, one list shown at a
   time.

---

## Session: two-tier structure (hub, `/congress`, `/congress/wealth`)

`/` is now a hub; the explorer moved to `/congress`, wealth to `/congress/wealth`, with branch → section nav (see Routes and the header section above). Divergences from the session prompt:

- **Explorer query params** are `chamber`, `state`, `show` (only those). Redirects use one `has` rule each; bare `/` stays the hub. Old `/#delegation` links now land on the hub (hash is client-only).
- **No `"/"` tracing entry** (at the time): the hub is a static page reading JSON at build time. The Court session added `"/"` and `"/supreme-court"` keys for `pipeline/output/court/*.json` anyway, per its brief.
- **Supreme Court**: was pipeline-output-only here; the Court landing page shipped in the next session (below).
- **OG images**: a page that sets its own `openGraph` doesn't inherit the root file-based image, so `/congress` and `/congress/wealth` set `images`/`twitter.images` to `/opengraph-image` explicitly.
- **Sticky behavior**: header doesn't stick, so the secondary row scrolls away; toolbars unchanged.
- `/congress`'s title is now "Congress ideology explorer"; the hub keeps the site-level title.

---

## Session: Supreme Court landing page (`/supreme-court`)

Data: `lib/justice-data.ts` (server-only, cached) reads the four `court/*.json` outputs and calls the pure `lib/court-derive.ts` (`buildCourtPayload`) to produce one compact `CourtPayload` (`lib/court-types.ts`, client-safe: per-justice score/interval arrays by term, per-term court record incl. mid-term left/joined, presidents in office order, the fitted score domain). `getCourtHubSummary()` feeds the hub card. Rules (a/b median, domain, turnover, presidents) are in `docs/SCOTUS_DATA_METHODOLOGY.md`.

Components (`components/court/`): `CourtExplorer` (state, cards, `<details>` table fallbacks), `CourtToolbar`, `JusticeSearch` (lives in chart 1's card), `JusticeStrip` (chart 1), `PresidentRows` (chart 2), `JusticeTrajectory` (chart 3), `CourtHubSparkline`.

Which primitive carries which chart:

- **Chart 1** `JusticeStrip`: `ChartFrame` + `Tooltip`; geometry is `lib/court-strip-layout.ts` (deterministic beeswarm dodge + label placement; pure, so `court-strip-layout.test.ts` audits every real term at six widths). `ScatterPlot`/`SwarmRows` don't fit a dodged single-axis strip with placed labels, so the smallest new thing is the layout function, not a parallel chart stack. Fixed pixel height (`STRIP_GEOMETRY`) so the card never resizes while playing; a 12.5px IBM Plex Sans label box is 16.5px tall (measured), and the layout is built on that.
- **Chart 2** `PresidentRows`: `SwarmRows`, extended with optional `domain`, `showAxis`, and per-point `radius`/`opacity`/`ring` and per-row `tinted`/`faded`. All default to the Congress behaviour, so `DelegationChart`/`CommitteeSwarm` are unchanged. Card-height mechanism is `SenateExplorer`'s (grid `md:items-stretch`, list absolutely positioned in a `flex-1` wrapper at md+; below md it expands).
- **Chart 3** `JusticeTrajectory`: `ChartFrame` + `Axis` (years) + `Tooltip`; playhead and click-to-scrub follow `TrendChart`; legend at the bottom.

Reserved heights: the "Mid-term change" line and the selected-justice row always occupy their space so chart 1's card (and chart 2's stretched card) never change height with the term.

Config/plumbing: `lib/verticals.ts` Court `status: 'live'`; `app/sitemap.ts` already emits every live branch, so `/supreme-court` is in it; `next.config.ts` `outputFileTracingIncludes` has `/supreme-court` and `/` keys for `./pipeline/output/court/*.json`.
