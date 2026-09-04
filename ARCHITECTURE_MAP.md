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
| `lib/committee-data.ts`| `CommitteeSummary` / `CommitteeProfile` — joins the roster to each member's latest-Congress score and **blends each committee to a `(dim1, dim2)` point** (unweighted mean) + `spread` (`max−min` dim1). Client-safe shapes in `lib/committee-types.ts`. |
| `lib/neighbors.ts`    | `nearestNeighbors` — generic over any `{dim1, dim2}` entity (members *and* committees), with `ideologicalDistance` |

---

## Routes (`app/`)

| Route                                               | Kind | Renders |
| --------------------------------------------------- | ---- | ------- |
| `/`                                                 | static | `SenateExplorer` — the compass / delegation / trend explorer, with a Members ↔ Committees toggle (119th only) |
| `/congress/senators/[bioguide_id]/[name_slug]`      | SSG + dynamic | `MemberProfileView` (stale slug → 308, bad id → 404) |
| `/congress/house/[bioguide_id]/[name_slug]`         | SSG + dynamic | `MemberProfileView` |
| `/congress/committees/[committee_id]/[name_slug]`   | SSG + dynamic | `CommitteeProfileView` — same shape as a member profile minus the trajectory chart |
| `/data/[chamber]`                                   | static JSON | the scrub-through-time payload, fetched on demand |
| `/wealth`                                           | static | placeholder (`upcoming` vertical) |
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
| committee wrapper| `committee/CommitteeCompass`     | `ScatterPlot` + committee accessors (`groupFillClass`, joint→neutral, `CommitteeDotTooltip`, `committeePath`) |
| committee wrapper| `committee/CommitteeSwarm`       | `SwarmRows` + one row per committee, party-split meta, chamber-disambiguated labels |

`components/senate/BeeswarmChart` (d3-force collision layout) is still its own
chart — the profile-page single-state delegation and, potentially, a future
committee roster swarm. Not yet folded into a primitive.

### Committee page shell (`components/committee/`)

`CommitteeProfileView` → `CommitteeHeader` (monogram seal, control + split,
Chair / Ranking Member) + `CommitteeCompassCard` (compass fed committees, "All
committees" / "Nearest neighbors" toggle, `CommitteeNeighborChips` in neighbour
mode) + `CommitteeRosterCard` (single-row swarm + scrollable roster list, no
trajectory chart).

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
additive), a per-committee and per-member bills/votes record, and a
committee-membership section on member profile pages (the inverted
`committee_memberships.json` supports it when wanted).
