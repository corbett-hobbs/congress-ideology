# Credits & attribution

Data sources used by this project, and how they must be credited.

The Voteview citation and congress-legislators credit appear in the site
footer (`components/senate/SiteFooter.tsx`) and the README. Keep those in sync
with this file.

---

## Voteview — DW-NOMINATE roll-call data

Ideology scores (`nominate_*`, `nokken_poole_*`) and party aggregates come from
Voteview.

**Required citation:**

> Lewis, Jeffrey B., Keith Poole, Howard Rosenthal, Adam Boche, Aaron Rudkin,
> and Luke Sonnet (2026). *Voteview: Congressional Roll-Call Votes Database.*
> https://voteview.com/

(Voteview asks that the citation year track the year of access; update it when
the data snapshot is refreshed.)

Files used: `HSall_members.csv`, `HSall_parties.csv` from
`https://voteview.com/static/data/out/`. Snapshot committed in
`pipeline/raw/voteview/`.

Voteview is a project of the UCLA Department of Political Science and the UCLA
Social Science Computing. Data is provided free for scholarly and public use;
attribution is expected.

---

## @unitedstates/congress-legislators

Biographical data and the `icpsr` ↔ `bioguide_id` crosswalk come from the
`@unitedstates/congress-legislators` project.

- Repository: https://github.com/unitedstates/congress-legislators
- Files used: `legislators-current.yaml`, `legislators-historical.yaml`
- License: **CC0 / public domain dedication.** No attribution legally required;
  credited here as good practice.

---

## @unitedstates/images — member photos

Official portrait photos for current members come from the
`@unitedstates/images` project (US Government Publishing Office photos,
re-published and resized).

- Repository: https://github.com/unitedstates/images
- Served from: https://unitedstates.github.io/images/congress/[size]/[bioguide].jpg
- Sizes committed: `225x275` (tooltip) and `450x550` (profile page), under
  `public/images/members/`. Fetched by `pipeline/fetch/photos.ts`; the
  bioguide-id ↔ photo availability list is `pipeline/output/member-photos.json`.
- License: **CC0 / public domain.** GPO photographs are U.S. Government works.
  No attribution legally required; credited here and in the site footer as good
  practice.
- Scope: current members only. Members without a source photo fall back to
  `public/images/member-placeholder.svg`.

---

## Wikipedia — member bios

The short bio in each member profile header is the lead of the member's English
Wikipedia article, via the Wikipedia REST summary endpoint
(`https://en.wikipedia.org/api/rest_v1/page/summary/{title}`), where `{title}`
is `id.wikipedia` from `legislators-current.yaml`.

- Fetched by `pipeline/fetch/wikipedia.ts` into
  `pipeline/output/wikipedia_summaries.json` (build-time only; the site never
  calls Wikipedia at request time).
- License: **CC BY-SA 4.0** — https://creativecommons.org/licenses/by-sa/4.0/.
  Attribution is **required** and ShareAlike applies to the text.
- Attribution as shown: under every bio, "From [Wikipedia](article url) (text
  may be abridged), licensed under CC BY-SA 4.0." (links to the article and the
  license), plus a line in the site footer (`components/senate/SiteFooter.tsx`).
- The text is **trimmed only** (first two sentences, ~320 characters, on a
  sentence boundary; `pipeline/wikipedia/trim.ts`) — never rewritten or
  summarized — hence "may be abridged". Article history/authors are linked via
  the article URL and the `revision` recorded per record.
- Requests carry a descriptive `User-Agent` with a contact address, per the
  Wikimedia API etiquette.

---

## U.S. House Clerk — Financial Disclosure filings

House member net-worth estimates (`pipeline/output/financial_disclosures.json`,
parsed by `pipeline/financial/`) are derived from Financial Disclosure reports
published by the **Clerk of the U.S. House of Representatives**, Legislative
Resource Center.

- Source: https://disclosures-clerk.house.gov/
- Files used: the annual bulk index `public_disc/financial-pdfs/<YEAR>FD.zip`
  and the individual report PDFs it points to. Electronic-filing snapshots are
  committed under `pipeline/raw/house-financial-disclosures/` (scanned/paper
  filings are `.gitignore`d — large and non-parseable, re-fetched on demand).
- License: **public domain.** Financial Disclosure reports and the bulk index
  are U.S. Government works and public records under the Ethics in Government
  Act. No attribution legally required; credited here as good practice.

### `disclosure-extractor` — evaluated, not adopted

`freelawproject/disclosure-extractor` (BSD 2-Clause, © 2020 Free Law Project —
https://github.com/freelawproject/disclosure-extractor) was evaluated as a
possible parser for House filings and found to be specific to the federal
**judiciary's** AO-10 form (see `docs/HOUSE_DISCLOSURE_EXTRACTOR_EVAL.md`). No
code from it is used or redistributed. It remains an optional dependency of the
evaluation probe only. Its BSD-2-Clause terms — retain the copyright notice and
disclaimer on redistribution — are noted here for completeness; the notice text
ships in the package's own `LICENSE`.

---

## Biographical Directory of the United States Congress

`bioguide_id` values originate from the Biographical Directory of the United
States Congress — https://bioguide.congress.gov/ — a public-domain U.S.
Government work.
