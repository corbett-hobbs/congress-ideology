# InsideGov

**[insidegov.fyi](https://insidegov.fyi)** ·
the U.S. government, by the numbers: public records from all three branches,
turned into charts you can explore. The presidency, Congress (1789 to today)
and the Supreme Court, without reading the raw files.

![The InsideGov home page, with the presidency, Congress and Supreme Court sections](docs/images/screenshot-home.png)

The site is organised by branch. Each branch has several pages, each built
around one question.

### The presidency (`/presidency/…`)

- **Executive orders** — how many each president has signed since 1994, and on
  what topics.
- **Economy** — jobs, inflation, mortgage rates and more, laid against
  administrations.
- **Energy** — oil, gas, electricity and the Strategic Petroleum Reserve,
  with the policy actions that touched them.
- **Trade** — U.S. trade with each country, plus tariffs and duties collected.
- **Immigration** — ICE removals by fiscal year and by country of citizenship.
- **National security** — where U.S. troops are stationed abroad, and the
  bases, over time.
- **Foreign aid** — where U.S. foreign assistance goes, on a world map.

### Congress (`/congress/…`)

- **Ideology explorer** — every member's voting record reduced to a point in a
  two-dimensional space (**DW-NOMINATE**), from the 1st Congress (1789) to the
  119th (2025–27). Scrub through 236 years, compare a state's delegation, and
  read any current member's trajectory against their party's mean.
- **Who serves** — age, gender and length of service, for every Congress since
  1933.
- **Net worth** ([`/congress/wealth`](https://insidegov.fyi/congress/wealth))
  — first vs. latest net worth on a shared signed-log scale, highest and
  lowest lists, and the actual assets and liabilities on every current
  member's profile, estimated from their annual financial disclosures.
- **Committees and subcommittees** — every House, Senate and joint committee of
  the 119th Congress blended to a point, with rosters and a page for each.
- **Member profiles** — a page for every current representative and senator.

### The Supreme Court (`/supreme-court/…`)

- **Ideology explorer** — where the Court's middle sits, term by term, from
  Martin–Quinn scores for every justice since 1937.
- **Decisions** — how many argued cases the Court decides each term and how
  often it splits, by issue area, since 1946, with a case list and landmark
  cases.
- **Justice profiles** — a page for every justice, with a bio, a portrait and
  their voting record.

<!--
WHY I BUILT THIS
Corbett — write this section. A few honest sentences: what pulled you to this
data, what you wanted to be able to see that existing tools don't show, and
what you got out of building it. Keep it personal; it's the part a reader
remembers.
-->

![A senator profile page](docs/images/screenshot-profile.png)

## Data

| Branch | Source | Used for |
| --- | --- | --- |
| Congress | [**Voteview**](https://voteview.com/) (Lewis, Poole, Rosenthal, Boche, Rudkin & Sonnet) | DW-NOMINATE ideal points — the static career score and the per-Congress (Nokken–Poole) score |
| Congress | [**@unitedstates/congress-legislators**](https://github.com/unitedstates/congress-legislators) | Names, states, parties, terms, leadership, the `icpsr` ↔ `bioguide_id` crosswalk, and current committees and rosters |
| Congress | [**@unitedstates/images**](https://github.com/unitedstates/images) | Official member portraits (current members only), committed under `public/images/members/` |
| Congress | **House Clerk** ([disclosures-clerk.house.gov](https://disclosures-clerk.house.gov/)) and **Senate eFD** ([efdsearch.senate.gov](https://efdsearch.senate.gov/)) | Annual financial disclosures behind `/congress/wealth` and each profile's net worth card |
| Court | [**Martin–Quinn scores**](https://mqscores.wustl.edu/) | Per-term ideal points for every justice |
| Court | [**Supreme Court Database**](http://scdb.wustl.edu/) (Washington University) | Case counts, dissents, issue areas, outcomes and each justice's vote |
| Court | [**Federal Judicial Center**](https://www.fjc.gov/history/judges) | Justice biographies |
| Presidency | [**Federal Register**](https://www.federalregister.gov/presidential-documents/executive-orders) | Executive orders (topics are classified with the Claude API and the result is committed) |
| Presidency | **FRED**, **BLS**, **Census**, **OMB**, **Freddie Mac** | The economic indicators |
| Presidency | [**U.S. Energy Information Administration**](https://www.eia.gov/) | Energy series |
| Presidency | **U.S. Census Bureau** and [**USITC DataWeb**](https://dataweb.usitc.gov/) | Trade by country; duties collected (DataWeb for 1993–2009) |
| Presidency | [**ICE**](https://www.ice.gov/statistics) | Removals by year and by country of citizenship |
| Presidency | [**ForeignAssistance.gov**](https://foreignassistance.gov/) | Foreign aid obligations and disbursements |
| Presidency | **Defense Manpower Data Center**, [**troopdata**](https://github.com/meflynn/troopdata), David Vine's base lists | Troop locations and overseas bases |
| All | [**Wikipedia**](https://en.wikipedia.org/) (CC BY-SA 4.0) | Short bios on member and justice profiles, and the landmark-case list and case articles, fetched in the pipeline |
| All | [**Natural Earth**](https://www.naturalearthdata.com/) | World map outlines |

The full list, with notes on what each source covers, is on
[`/methodology`](https://insidegov.fyi/methodology).

> Lewis, Jeffrey B., Keith Poole, Howard Rosenthal, Adam Boche, Aaron Rudkin,
> and Luke Sonnet (2026). *Voteview: Congressional Roll-Call Votes Database.*
> voteview.com

Raw snapshots are committed under `pipeline/raw/`, so builds are reproducible
and don't touch the network. Scheduled GitHub Actions
([`.github/workflows/`](.github/workflows/)) re-fetch each source on its own
cadence and open a PR only when something material changed; the PR merges
itself only after the same checks CI runs have passed. Hand-curated data
(tariff and energy actions, ICE figures) has review reminders instead.
Data conventions (why each track has its own join key, why the two
DW-NOMINATE scores must not be conflated) are written down in
[`docs/DATA_CONVENTIONS.md`](docs/DATA_CONVENTIONS.md), with a methodology doc
per topic alongside it.

## How it's built

- **Next.js 16** (App Router) + **React 19** + **TypeScript**, **Tailwind v4**
  themed from a small set of CSS custom properties (light/dark).
- **A build-time data pipeline**, not a database. `pipeline/` fetches the raw
  files, validates every row against a Zod schema, and transforms them into
  normalized JSON, one set of files per track (Congress, the Court, executive
  orders, indicators, energy, trade, immigration, foreign aid, troops, court
  decisions). The app reads those at build time and statically prerenders every page — there is no
  runtime data fetching and nothing to operate. Financial disclosures are a
  separate Python sidecar (`pipeline/financial_disclosures/`, PDF/HTML parsing
  is easier there) producing `financial_disclosures.json` (one row per member
  per reporting year, band-count grain) and `line-items/<year>.json` (the
  verbatim per-asset/per-liability grain, sharded by year) — both validated
  the same way (Zod on the TS side, a dependency-free schema check on the
  Python side) before the app reads them.
- **D3 for the maths only** (`d3-scale`, `d3-shape`, `d3-force`) — scales, path
  strings, and the beeswarm collision layout. Every `<circle>`, `<path>` and
  `<line>` is plain JSX, so React owns the DOM. Low-level primitives
  (`ChartFrame`, `Axis`, `Tooltip`) plus the `ScatterPlot` and `SwarmRows`
  chart bodies back every view — the member and committee compasses are the
  same `ScatterPlot` with different accessors, not separate charts.
- **CI** (`.github/workflows/ci.yml`) type-checks, lints, runs the unit tests,
  re-runs the pipeline and fails if the committed output drifts, then builds.

```
app/          routes — the hub (/), the explorer (/congress/ideology), the Court (/supreme-court/ideology), executive orders (/presidency/executive-orders), foreign aid (/presidency/foreign-aid), member profiles, committee pages, /congress/wealth
components/    charts/ (primitives), senate/ (the ideology views), profile/, committee/, wealth/
lib/           the build-time data layer + shared helpers
pipeline/      fetch → validate → transform → pipeline/output/*.json
                financial_disclosures/ — Python sidecar (PDF/HTML parsing) for
                financial_disclosures.json + line-items/<year>.json
public/        static assets, incl. committed member photos (images/members/)
docs/          DATA_CONVENTIONS.md, CREDITS.md, and a *_METHODOLOGY.md per topic
```

See [`ARCHITECTURE_MAP.md`](ARCHITECTURE_MAP.md) for the data-layer, route, and
shared-component maps.

## Running locally

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

Node ≥ 20.9. Other commands:

```bash
pnpm build          # production build
pnpm typecheck      # next typegen && tsc --noEmit
pnpm test           # vitest
pnpm pipeline       # fetch + validate + transform (re-fetches from source)
pnpm pipeline:check # validate + transform + assert pipeline/output is unchanged
```

## Scope

- **Congress:** the House and the Senate, every Congress from the 1st (1789) to
  the 119th, with a profile for every current member and a page for every
  committee and subcommittee of the 119th. Committee membership is only
  tracked for the current Congress (there is no historical roster file
  upstream), so those views are pinned to the 119th.
- **The Court:** every justice with a Martin–Quinn score (1937 on), and
  decision counts from the Supreme Court Database from 1946.
- **The presidency:** executive orders from 1994; economic and energy series
  with a display window starting in the modern era; trade and duties from
  1991 and 1993; ICE removals FY2003 on; foreign aid, troops and bases over
  their source's span. Each page's "Data notes" give the exact window.

Still future work: a page for the laws Congress passes (the data layer is
built; see [`docs/LAWS_METHODOLOGY.md`](docs/LAWS_METHODOLOGY.md)) and a
per-member bills and votes record.

## Licence

Personal project — the code isn't licensed for reuse yet. The underlying data
belongs to its sources: Voteview data is free for scholarly and public use
with attribution; congress-legislators is public-domain (CC0).
