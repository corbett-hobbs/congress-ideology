# components/

Shared React components.

```
components/
  charts/   chart primitives. ChartFrame, Axis, Tooltip are the low-level
            layer; ScatterPlot (the 2-D compass body) and SwarmRows (the
            1-D row list) are the chart bodies every view is built from.
            D3 is used only for scale/shape/force maths; the SVG is plain JSX.
  senate/   the "Ideology" vertical: the explorer (SenateExplorer + toolbar,
            search, table) and the member wrappers over the primitives —
            CompassChart wraps ScatterPlot, DelegationChart wraps SwarmRows,
            BeeswarmChart, SenatorTrajectoryChart, ProfileCompass, CompassPanel,
            Dim2Note, SiteFooter. Names still say "Senate"/"Senator" — written
            Senate-first and generalized in place; the chamber is a prop/URL param.
  committee/ the committee wrappers over the same primitives — CommitteeCompass
            wraps ScatterPlot, CommitteeSwarm wraps SwarmRows — plus the
            committee page shell (CommitteeProfileView, CommitteeHeader,
            CommitteeCompassCard, CommitteeRosterCard, CommitteeNeighborChips)
            and the committees-mode search. Used by SenateExplorer's
            Members/Committees toggle and /congress/committees/[committee_id]/[name_slug].
  profile/  the per-member profile page, split into verticals-agnostic pieces:
            MemberProfileView (the shell), ProfileHeader (identity block),
            ProfilePanel (shared card chrome), and one section per vertical —
            MemberIdeologySection today, others added as siblings. Within it,
            MemberCompassCard adds the "nearest neighbors" toggle over the
            shared compass; NeighborChips is its neighbor-mode chip row. Used
            by /congress/{senators,house}/[bioguide_id]/[name_slug].
  SiteHeader.tsx / SiteNav.tsx  the persistent top bar (wordmark + top-level
            section nav from lib/verticals.ts), rendered once in the root
            layout on every page. The explorer's own controls (chamber /
            members-committees / state / play / slider) live below it in
            senate/ExplorerToolbar.tsx.
```

`ScatterPlot` and `SwarmRows` take accessors and a `renderTooltip` callback
rather than knowing about members: `CompassChart` / `CommitteeCompass` and
`DelegationChart` / `CommitteeSwarm` are thin typed wrappers, so a change to
the scatter or the row list applies to members and committees at once. The
member charts also take optional props (`dimUnfocused`, `filterState`,
`highlightId`, `mode`, navigate-on-click) so the profile pages reuse them.

The active chamber, state filter, and members-vs-committees view live in the
URL (`?chamber=house&state=CA&show=committees`) via `lib/use-chamber.ts`, driven
only from `senate/ExplorerToolbar`. A state filter narrows the explorer's
compass panel to that state's delegation and overlays its trend on the
party-means chart. The committees view is available only at the latest Congress
(reverts to members otherwise) and hides Chart 3 behind a note.

Conventions:

- One component per file, `PascalCase.tsx`. `"use client"` only where a
  component needs state or event handlers.
- Presentational components take plain props. Data reading and joining happen
  in `lib/` (build-time, server-only) — see `lib/congress-data.ts` — and the
  shaped result is passed down as a prop.
- Chart SVGs are styled by the `.chart-*` / `.dot` / `.trend-*` / `.deleg-*`
  rules in `app/globals.css`, which reference the design tokens so they follow
  the light/dark theme. Layout/chrome uses Tailwind utilities backed by the
  same tokens (`bg-surface`, `text-ink-muted`, …).
