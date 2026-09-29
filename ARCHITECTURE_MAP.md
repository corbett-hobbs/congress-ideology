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
| `_report.json`               | run summary / sanity numbers               | —                              | `transform/index.ts`         | humans |
| `financial_disclosures.json` | (legislator, reporting year), band-count grain | `bioguide_id`+`year`       | Python sidecar: `pipeline/financial_disclosures/build.py` / `build_senate_html.py` / `build_ocr.py` | `lib/wealth-data.ts` |
| `line-items/<year>.json`     | (legislator, reporting year) that reconciled, item grain | `bioguide_id`+`year`, sharded by `year` | `pipeline/financial_disclosures/build_line_items.py` | `lib/line-items-data.ts` |

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
| `/`                                                 | static | `SenateExplorer` — the compass / delegation / trend explorer, with a Members ↔ Committees toggle (119th only) |
| `/congress/senators/[bioguide_id]/[name_slug]`      | SSG + dynamic | `MemberProfileView` (stale slug → 308, bad id → 404) |
| `/congress/house/[bioguide_id]/[name_slug]`         | SSG + dynamic | `MemberProfileView` |
| `/congress/committees/[committee_id]/[name_slug]`   | SSG + dynamic | `CommitteeProfileView` — same shape as a member profile minus the trajectory chart |
| `/data/[chamber]`                                   | static JSON | the scrub-through-time payload, fetched on demand |
| `/wealth`                                           | static | `WealthPageClient` — chamber/state filter bar, the net worth scatter ("who outperformed, who lagged"), highest/lowest lists. Plan called this route `/congress/wealth`; shipped at `/wealth` instead since the site already had that top-level vertical wired up (nav entry, `lib/verticals.ts`) — see `app/wealth/page.tsx`'s own doc comment. |
| `/sitemap.xml`, `/robots.txt`, `/opengraph-image`   | static | — |

Each `*/[.../name_slug]` route also has `opengraph-image.tsx` (rendered on
demand) and `not-found.tsx`. Routes that read `pipeline/output/*.json` via `fs`
are listed in `next.config.ts` `outputFileTracingIncludes`.

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
| identity header  | `profile/ProfileHeader` vs. `committee/CommitteeHeader` | Same structural pattern (eyebrow, serif name, meta line, sub-line) — **deliberately not** a shared component. `ProfileHeader` keeps a `w-[84px]`/`w-28` photo slot (a real, systematically available per-member asset); `CommitteeHeader` has **no photo/seal placeholder at all** (a monogram was tried and dropped — pure decoration, no informational content, unlike the member photo) and reclaims that width, so its header isn't capped at `ProfileHeader`'s photo-driven `max-w-[52rem]` — it runs out to the page's own `max-w-[1180px]` instead. |
| committee wrapper| `committee/CommitteeCompass`     | `ScatterPlot` + committee accessors (dot colour read straight off `CommitteeSummary.compassColorClass`, joint→neutral, `CommitteeDotTooltip`, `committeePath`) |
| committee wrapper| `committee/CommitteeSwarm`       | `SwarmRows` + one row per committee, party-split meta, chamber-disambiguated labels |
| control           | `charts/SortToggle`               | Shared "Widest spread / A–Z / Ideology" pill group behind both "How each state votes" and "How each committee votes" (`SenateExplorer`). "Ideology" is reversible (click again to flip direction) instead of pick-one-of-N; `DelegationChart` and `CommitteeSwarm` both take a `SortState` and sort their own row-level mean-dim1 field on it. |
| primitive        | `charts/AlignmentTrack`           | Small inline two-dot [-1, 1] comparison (a member's own position vs. a reference point) — plain divs, not an SVG `ChartFrame` body, since it's one comparison per profile-card row rather than a shared-axis multi-row chart. Introduced for `profile/CommitteeMembershipsCard`; reusable anywhere a single "this thing vs. that thing" ideology comparison is needed. |

`components/senate/BeeswarmChart` (d3-force collision layout) is still its own
chart — the profile-page single-state delegation and, potentially, a future
committee roster swarm. Not yet folded into a primitive.

### Wealth track (`components/wealth/`, `/wealth` + profile pages)

Built on the same `charts/ChartFrame` + `charts/Axis` + `charts/Tooltip`
primitives as the ideology charts — no parallel chart stack.

| Component | Notes |
| --------- | ----- |
| `wealth/NetWorthScatterCard` | "Who outperformed, who lagged" — annualized rate vs. years of data, `scaleSymlog` y-axis, pinned-outlier triangles beyond ±$15M/yr, member search, `<details>` table fallback |
| `wealth/WealthListsSection`, `wealth/WealthList`, `wealth/Sparkline` | Highest/lowest net worth lists, each row's own min/max-scaled sparkline over the shared 2013–2025 axis |
| `wealth/WealthFilterBar` | Chamber switch (`components/ChamberSwitch`) + state dropdown (`components/senate/StateFilter`) — the same controls the homepage explorer uses, wired to page-level state instead of URL params |
| `profile/MemberWealthSection` | The profile page's full-width "Net worth over time" card (sibling to `MemberIdeologySection`/`CommitteeMembershipsCard` in `MemberProfileView`) — absent (not an empty state) for a member with zero `financial_disclosures.json` rows |
| `wealth/MemberNetWorthChart` | One member's midpoint line + range band, one point per covered year. No existing click-to-select-driving-a-dropdown pattern existed before this — built from scratch, modeled on `senate/SenatorTrajectoryChart`'s zoom-to-data y-domain. Gaps break the band and bridge the midpoint line with a dashed segment (restricted to gaps *between* the member's own first/last data year — labeling every pre-entry year up to the 2013 floor was tried and reverted, it buried the axis). Open-ended bands get one chart-wide top gradient fade rather than a precise per-point effect (documented trade-off in the component). |
| `wealth/MemberWealthItemsPanel` | The chart's year-linked assets/liabilities list — year dropdown (years with a reconciled `line-items` row only), sticky section headers, falls back to the band-count total (no fabricated items) for a year Session 5 didn't reconcile |

`WealthMemberTooltip` (hover-card content, scatter + hover-linked from search)
and `wealth-copy.ts`/`wealth-scatter.ts` (pure label/jitter/standout-picking
helpers, unit-tested) round out the scatter's own supporting files.

### Committee page shell (`components/committee/`)

`CommitteeProfileView` → `CommitteeHeader` (no photo/seal — see the identity
header row in the table above; control + compact `14R·9D` split, shared with
`CommitteeSwarm`'s `partySplit`; Chair / Ranking Member from the real
`title` field, never inferred from roster order) + `CommitteeCompassCard`
(compass fed committees, "All committees" / "Nearest neighbors" toggle,
`CommitteeNeighborChips` in neighbour mode) + `CommitteeRosterCard`
(single-row swarm + scrollable roster list, no
trajectory chart).

### Site-wide header back-link (`components/SiteHeader.tsx`, `components/BackLinkContext.tsx`)

The header wordmark doubles as the "back to InsideGov" affordance: plain
`InsideGov` on the homepage, `← InsideGov` on every sub-page. Since
`SiteHeader` lives in `app/layout.tsx` as a sibling of `{children}` (not an
ancestor of the page content), it can't read a page's own data directly — a
committee page's correct back-href depends on that committee's `chamber`,
which only the page component has. `BackLinkProvider` (wraps the whole body in
`layout.tsx`) plus a page-level `<SetBackLink href={...} />` (used by
`MemberProfileView` and `CommitteeProfileView`) bridge that gap: the page
registers its restore-context href on mount, the header reads it. Always a
fixed href, never `history.back()` — a shared-link/bookmark visitor has no
meaningful history to return to. This replaced a second, separate
"← InsideGov" link that used to sit below the header on both page types and
did the exact same thing as the (already-clickable) wordmark.

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

1. **`/congress/wealth` shipped at `/wealth`.** The plan names the landing
   route `/congress/wealth` throughout; the site already had a top-level
   `wealth` vertical wired up at `/wealth` (nav entry, `lib/verticals.ts`)
   before Session 2, so that session built in place rather than introduce a
   second, competing route — reported in its own summary, restated in
   `app/wealth/page.tsx`'s doc comment.
2. **The party wealth chart was built (Session 3) then explicitly removed**
   on direct request, along with tightened list headers — a real, shipped
   feature taken back out, not a divergence in the "prompt vs. code"
   sense. `/wealth` today is: filter bar, scatter, highest/lowest lists.
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
