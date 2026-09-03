# components/

Shared React components.

```
components/
  charts/   chart primitives — ChartFrame, Axis, Tooltip. Every chart is
            built from these. D3 is used only for scale/shape maths; the SVG
            elements are plain JSX.
  senate/   the "Ideology" vertical: the explorer (SenateExplorer + compass,
            beeswarm, trend, delegation, search, table, toolbar) and the
            ideology-specific profile pieces (SenatorTrajectoryChart,
            ProfileCompass, CompassPanel, Dim2Footnote, SiteFooter).
            Names still say "Senate"/"Senator" — written Senate-first and
            generalized in place; the chamber is a prop/URL param.
  profile/  the per-member profile page, split into verticals-agnostic pieces:
            MemberProfileView (the shell), ProfileHeader (identity block),
            ProfilePanel (shared card chrome), and one section per vertical —
            MemberIdeologySection today, others added as siblings. Within it,
            MemberCompassCard adds the "nearest neighbors" toggle over the
            shared compass; NeighborChips is its footnote-strip chip row. Used
            by /congress/{senators,house}/[bioguide_id]/[name_slug].
  SiteHeader.tsx / SiteNav.tsx  the persistent top bar (wordmark + top-level
            section nav from lib/verticals.ts), rendered once in the root
            layout on every page. The explorer's own controls (chamber / state
            / play / slider) live below it in senate/ExplorerToolbar.tsx.
```

The compass and delegation charts take optional props (`dimUnfocused`,
`filterState`, `highlightId`, `mode`, navigate-on-click) so the profile pages
reuse them rather than duplicating chart logic. The active chamber and state
filter live in the URL (`?chamber=house&state=CA`) via `lib/use-chamber.ts`;
both are driven only from `senate/ExplorerToolbar` — no view has its own copy
of either control. A state filter narrows the explorer's compass panel to that state's
delegation and overlays its trend on the party-means chart (as a comparison
line, never a replacement).

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
