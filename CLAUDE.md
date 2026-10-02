@AGENTS.md

## Page titles and subtitles

Every top-level page's `<h1>` + intro copy goes through `components/PageHeader.tsx`. It has no max-width on purpose: the header always spans the full width of the page's `<main>`. Never put `max-w-*` on a page header or its intro paragraphs; to narrow text, narrow `<main>`.

## Architecture map

Before building or changing a page, chart or filter bar, read `ARCHITECTURE_MAP.md`. Its "Page-level layout rules" section holds the standing UI conventions (compact pinned filter bars, tap-to-pin numbered labels, "Data notes" under charts, solid colours, zoom/pan, labels that never vanish, nav overflow hints). Follow them instead of asking for them again, and update that file when a new convention is settled.
