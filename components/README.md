# components/

Shared React components.

```
components/
  charts/   chart primitives — ChartFrame, Axis, Tooltip. Every chart is
            built from these. D3 is used only for scale/shape maths; the SVG
            elements are plain JSX.
  senate/   the Senate "Ideology Space" explorer (Session 3): SenateExplorer
            plus the compass, trend, delegation, search, table and controls.
```

Conventions:

- One component per file, `PascalCase.tsx`. `"use client"` only where a
  component needs state or event handlers.
- Presentational components take plain props. Data reading and joining happen
  in `lib/` (build-time, server-only) — see `lib/senate-data.ts` — and the
  shaped result is passed down as a prop.
- Chart SVGs are styled by the `.chart-*` / `.dot` / `.trend-*` / `.deleg-*`
  rules in `app/globals.css`, which reference the design tokens so they follow
  the light/dark theme. Layout/chrome uses Tailwind utilities backed by the
  same tokens (`bg-surface`, `text-ink-muted`, …).
