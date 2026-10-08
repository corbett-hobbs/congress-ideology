# Supreme Court decisions methodology (SCDB counts)

How `pipeline/fetch/scdb.ts` and `pipeline/transform/decisions{,-run}.ts` turn the Supreme Court Database into
`pipeline/output/decisions_counts.json`, `decisions_meta.json` and `decisions_report.json`. Schemas: `lib/decisions-entities.ts`.
Pre-flight evidence: `docs/SCDB_PREFLIGHT.md`. Page: `/supreme-court/decisions`.

## Source

Supreme Court Database (Washington University in St. Louis), **case-centered by citation**, CSV, latin-1. The pinned release is in
`pipeline/raw/scdb/manifest.json` (currently Version 2026 Release 01, terms 1946–2025, 9,409 rows). Licence CC BY-NC 3.0 US. Citation
(also in `decisions_meta.json`, printed in the page's Source line):

> Harold J. Spaeth, Lee Epstein, Andrew D. Martin, Jeffrey A. Segal, Theodore J. Ruger, Sara C. Benesh, and Michael J. Nelson. 2026 Supreme Court Database, Version 2026 Release 01. URL: http://supremecourtdatabase.org

## Unit of analysis

A **case** is one row of the case-centered file with `decisionType` in {1, 5, 6, 7} (orally argued: opinion of the Court, equally divided, per curiam, judgment of the Court)
and `voteUnclear` not 1. For 2026_01 that is **8,251 cases**: 9,409 rows minus 1,010 summary dispositions (type 2) minus 66 decrees (type 4) minus 82 unclear votes.

- **Type 2 is excluded** (summary per curiams, decided without argument). Including them inflates the 1960s–70s docket and muddies the shrinking-docket story. The docket here is cases *decided after argument*, not filed or granted.
- A case counts once, in its **decision term** (`term`). Consolidated cases are one row in the case-centered file.
- Terms are labelled by their starting year. A term runs October to June, so "2025" is October 2025 to June 2026.

## Dissent buckets

`bucket = min(minVotes, 4)`: 0 unanimous (9–0), 1 = 8–1, 2 = 7–2, 3 = 6–3, 4 = 5–4 (which includes 4–4 ties). Buckets count **dissents, not the full tally**, so with fewer than nine
justices a 5–3 decision lands in "6–3" territory by dissent count (3 dissents) and a 4–3 in the 3-dissent bucket too. This is the eight-justice caveat shown on the page (for example 2016 after Scalia's death).
Some cases are decided by fewer than nine justices (vacancies, recusals); the page says so rather than adjusting.

## Issue areas

SCDB's own 14 `issueArea` categories, behind the catalog `pipeline/reference/decision-issue-areas.json` (`id`, `scdb_code`, `label`). The transform maps code to `id` through that file only and fails on an
unknown code; the UI reads labels from `decisions_meta.json`. Cases with no `issueArea` (67 in 2026_01) are kept with `issue_area_id: null`, count in "All issue areas", and appear in no issue-area row.
Swapping the taxonomy later = a new catalog and `issueAreaId` mapping, no UI change.

## Chief Justices

`chief_spans` in `decisions_meta.json`: the modal SCDB `chief` of each term's cases merged into runs (Vinson 1946–52, Warren 1953–68, Burger 1969–85, Rehnquist 1986–2004, Roberts 2005–). Appointing president and party
come from the hand-maintained `pipeline/reference/chief-justices.json` (Rehnquist is Reagan's appointee *as Chief*), which the transform checks against `court/justices.json` (`chief_justice_appointment`) and the presidents tables.
An unknown `chief` name fails the build; add a row when a new Chief takes the chair.

## Output

- `decisions_counts.json`: one row per `(term, issue_area_id)` that has at least one case, with `n` and `d0..d4`. Counts only, never percentages. Every term 1946–last has rows. `issue_area_id` is `null` for unclassified. ~77 KB.
- `decisions_cases.json`: one row per case in scope, oldest first (~1.6 MB): `case_id`, `term`, `date`, `name`, `cite`, `issue_area_id`, `band`, `maj`, `min`. Names are SCDB's capitals re-cased for reading by `pipeline/transform/case-names.ts` (a word that already has lower-case letters is left as written; a curated acronym lookup of agencies, unions/organisations and company forms; dotted initials, Roman numerals and vowel-less tokens like "CSX" stay capitals unless listed as abbreviations like "Ltd"; small words lower-case; a few newer UTF-8 names repaired). To fix a name, add the acronym to `ACRONYMS` (or `ABBREVIATIONS`) there; the tests list real examples and fail if a listed acronym is ever title-cased in the data; `cite` is the U.S. Reports cite, else Supreme Court Reporter, else Lawyers' Edition, else Lexis.
- `decisions_meta.json`: version, data-through term, exclusions, unclassified count, citation, licence, chief spans, issue-area catalog.
- `decisions_report.json`: totals by bucket, decade and issue area, gate results (humans only).

## Gates (the transform exits non-zero)

The case list aggregates back to the counts exactly (same cases, same cells, unique ids). Output total equals an independent positional recount straight from the CSV (and the raw row count after exclusions); per-term bucket sums and per-term 5–4 counts equal the recount; terms gap-free from 1946;
every row's buckets sum to `n`; unclassified and exclusion counts equal the recount; stable anchors (1946 = 142, 1972 = 156, 2015 five-four = 4) and release anchors (2026_01: total 8,251, 2024 = 61, 2025 = 57); chief spans contiguous and covering all terms.
When a new release legitimately changes an anchor, update `ANCHORS` / `ANCHORS_BY_VERSION` in `pipeline/transform/decisions.ts` in the same PR.

## Landmark cases

The page's "Landmark cases" checkbox uses Wikipedia's [List of landmark court decisions in the United States](https://en.wikipedia.org/wiki/List_of_landmark_court_decisions_in_the_United_States): one request to the MediaWiki API (`pnpm fetch:landmarks`, identified User-Agent), saved as `pipeline/raw/wikipedia-landmarks/list.wikitext` with a manifest (revision id, timestamp, sha256, licence CC BY-SA 4.0). The list is grouped under topical headings, and each case carries a `{{ussc|volume|page|year}}` template (some recent ones use named parameters or a docket number).

- **Join to SCDB**, in order: U.S. Reports cite; docket number (when the list gives one); case name plus decision year (the first significant word on each side of "v."). Every name match is listed in `decisions_report.json` for review.
- **What does not join, and why** (all listed by title in the report): cases decided before SCDB's modern file (1945 term and earlier: 133 entries); cases SCDB holds but the page leaves out because they were not orally argued or the vote is unclear (7, e.g. *Dusky v. United States*); and three entries with no SCDB row: *One, Inc. v. Olesen* (listed twice; a one-line per curiam SCDB does not hold) and *Lucas v. South Carolina Coastal Council*, which the list cites as 503 U.S. 1003 where SCDB has 505 U.S. 1003 (a typo on Wikipedia; not corrected here).
- **Result at the 2026 revision:** 485 list entries, 339 cases on the page (300 by cite, 5 by docket, 34 by name and year).
- **Gate:** every entry is accounted for exactly once; at least 300 matched; no more than 3% of the post-SCDB entries unmatched.
- **Stored:** only which cases it names, the article title (a link back) and the headings, never the list's prose. A case under several headings keeps all of them; the page shows up to two.
- **A judgement call, not a ruling:** "landmark" is Wikipedia editors' classification, not the Court's or SCDB's. It is recent-heavy (the list keeps adding new decisions) and its 339 cases are about four a term, so landmark-only shares are rough; the page says so.

## Not in scope

Liberal/conservative direction, per-justice votes, landmark-case curation, case summaries. The page is institutional counts plus a plain list of the cases behind them (name, cite, date, issue area, vote).
