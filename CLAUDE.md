@AGENTS.md

## Page titles and subtitles

Every top-level page's `<h1>` + intro copy goes through `components/PageHeader.tsx`. It has no max-width on purpose: the header always spans the full width of the page's `<main>`. Never put `max-w-*` on a page header or its intro paragraphs; to narrow text, narrow `<main>`.
