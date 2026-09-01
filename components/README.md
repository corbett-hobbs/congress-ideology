# components/

Shared, reusable React components live here.

Intentionally empty for now. A component library is deliberately **not** part of
the foundation session — components get extracted once there are real feature
pages to extract them from, not before.

Conventions when this fills in:

- One component per file, `PascalCase.tsx`.
- Presentational components take plain props; data fetching and joining happen
  in `app/` route files or `lib/`, not here.
- Styling via Tailwind utilities backed by the design tokens defined in
  `app/globals.css`.
