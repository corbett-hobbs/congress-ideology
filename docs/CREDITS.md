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

## Biographical Directory of the United States Congress

`bioguide_id` values originate from the Biographical Directory of the United
States Congress — https://bioguide.congress.gov/ — a public-domain U.S.
Government work.
