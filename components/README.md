# components/

Shared React components.

```
components/
  charts/   chart primitives — ChartFrame, Axis, Tooltip. Every chart is
            built from these. D3 is used only for scale/shape maths; the SVG
            elements are plain JSX.
  senate/   the "Ideology Space" explorer (SenateExplorer + compass, beeswarm,
            trend, delegation, search, table, controls) and the per-member
            profile view (SenatorProfileView, SenatorTrajectoryChart,
            ProfileCompass) used by /congress/{senators,house}/[bioguide_id]/[name_slug].
            Names still say "Senate"/"Senator" — the components were written
            Senate-first and generalized in place; the chamber is a prop/URL param.
  SiteHeader.tsx  the persistent top toolbar (wordmark + StateFilter + chamber
            switcher), rendered once in the root layout on every page.
```

The compass and delegation charts take optional props (`dimUnfocused`,
`filterState`, `highlightId`, `mode`, navigate-on-click) so the profile pages
reuse them rather than duplicating chart logic. The active chamber and state
filter live in the URL (`?chamber=house&state=CA`) via `lib/use-chamber.ts`;
both are driven only from `SiteHeader` — no view has its own copy of either
control. A state filter narrows the explorer's compass panel to that state's
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
