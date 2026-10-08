# Congress → Laws: execution plan for Claude Code

Companion to `docs/CONGRESS_LAWS_SCOPE.md` (what and why) and the mockup `docs/mockups/congress-laws/laws-page.html` (the visual spec). This file is **how, in order**: one session per section, each ending at a gate you review before the next starts. Written 2026-10-08.

## Settled decisions (do not reopen)

- Range **1973–** (93rd Congress on), public laws only, one slot per **Congress**, president under a bar = who signed most of its laws.
- Topics = Congress.gov **policy areas** (32). Dropdown lists all 32; card 1 shows the six biggest by total plus "Other areas (26)", fixed so colours never move.
- Support band = the **closest recorded final-passage vote** in either chamber; no recorded vote in either = its own band. Display order bottom to top: No recorded vote, Under 60%, 60–75%, 75–90%, 90%+. Minority-party support is v1.1, not v1.
- Major laws from **Mayhew** (through the 118th), three states (Major / Not major / Not yet assessed), plus a **provisional flag** for the in-progress Congress that ships only if it passes its back-test (Session 3b).
- Summaries are the first sentence of the CRS summary. **Never model-written text** unless held to the source's own words (the case-summary guard).
- No new colour tokens: policy areas reuse `--fuel-*`, bands reuse `--split-*`.

## Rules for every session

1. Start by reading `CLAUDE.md`, `ARCHITECTURE_MAP.md` (data layer and "Page-level layout rules"), `docs/DATA_CONVENTIONS.md` §14 (the Decisions track is the template), and the scope doc. Before writing Next code, read the relevant guide in `node_modules/next/dist/docs/` (`AGENTS.md`).
2. Copy the Decisions track's shape rather than inventing one: pure logic in `pipeline/transform/<x>.ts`, a thin `<x>-run.ts`, Zod schemas in `lib/<x>-entities.ts`, a server-only reader `lib/<x>-data.ts`, pure derivations in `lib/<x>-derive.ts` with tests **over the real committed files**, client-safe types in `lib/<x>-types.ts`.
3. Gates fail the build loudly (the transform throws), they do not warn. Every miss and every judgment call is listed in the run's `_report.json`.
4. Do only the session you are given. If a gate fails or a source behaves differently than this plan assumes, **stop and report with numbers**; do not route around it.
5. One branch and one PR per session. Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm pipeline:check` and (UI sessions) `pnpm build` before opening it. Update `ARCHITECTURE_MAP.md` (data table, routes, decisions section) and `docs/DATA_CONVENTIONS.md` (§15 Laws track) in the session that changes them, and correct anything that has drifted.
6. UI follows the mockup and the layout rules in `ARCHITECTURE_MAP.md` (compact pinned bar, Data notes of 60–100 words, "View as table", labels never vanish, solid colours, legend entries are filters, `useStickyTooltip` for bars). New conventions go in the map's rules list.
7. Never hard-code a number that the data can compute (ledes, totals, anchors); tests assert the anchors instead (e.g. 93rd = 651 laws, 118th = 274).

## Needs from you (before the session that uses it)

| Need | For | Notes |
| --- | --- | --- |
| Free Congress.gov key (api.data.gov sign-up), saved as `CONGRESS_API_KEY` in `.env.local` and as a repo secret | Session 0 | Claude cannot create accounts. The shared demo key ran out after about eight calls. |
| Optional: email to David Mayhew (update plans; fine to reproduce flags with credit?) | Session 3 | His page states no licence or schedule. The plan works without a reply but cites him. |
| Review at each gate | every session | Gate summary is in the PR description. |

---

## Session 0 — Pre-flight (read-only; no app code)

**Goal:** replace every "I assume" in the scope doc with a measured number, and settle whether 1973 is a safe start.

**Do** (scratch scripts under `pipeline/preflight/`, as the other tracks did; write `docs/LAWS_PREFLIGHT.md`):
1. Per-Congress public-law counts from `/v3/law/{congress}/pub` for every Congress available; find the API's earliest. Compare 93rd–119th to an independent tally (GovInfo public-law packages or the Statutes at Large). Expected anchors: 93rd = 651, 118th = 274.
2. For a random sample of 40 laws per Congress, 93rd–119th: fill rate of `policyArea`, `sponsors[].bioguideId`, `summaries`, and the `Became Public Law` action date. Report by Congress.
3. Signing date: `Became Public Law` action date vs the list's `latestAction.actionDate`; how often and by how much they differ; how veto overrides appear.
4. Votes: pull the action history of 30 laws per decade; extract recorded-vote references (`chamber`, roll number, voice vote, unanimous consent). Join to Voteview's roll-call file (fetch it; confirm it has `yea_count` / `nay_count`, else derive from the member-votes file) and confirm the tallies equal the action-text tallies where both exist. Report parse and join rate by decade.
5. Actual request cost: calls per law (detail, actions, summaries), measured rate limit, projected hours for the full back-fill.
6. Confirm `legislators.json` / historical YAML contains every sampled sponsor `bioguideId`.
7. Mayhew: confirm the 2023–2024 list is still the latest; list each file's format; estimate extraction effort (law count 1973–2024).

**Gate (stop here):** report fill rates, parse rates and the request budget. You decide: (a) is 1973 still the start; (b) where the support card must start if pre-1990 vote parsing is thin; (c) whether any stretch needs a "Not classified" series.

**Prompt:** "Do Session 0 of `docs/CONGRESS_LAWS_EXECUTION_PLAN.md`. Read the scope doc first. `CONGRESS_API_KEY` is in `.env.local`. Write findings to `docs/LAWS_PREFLIGHT.md` and stop at the gate."

---

## Session 1 — Laws data layer (no votes yet)

**Goal:** every public law 1973– as a validated, committed file, with counts the page will chart.

**Do:**
- `pipeline/fetch/congress-gov.ts` + `congress-gov-lib.ts` (`pnpm fetch:laws`; incremental on `updateDate`; resumable; writes `pipeline/raw/congress-gov/`; honours the measured rate limit; not in `fetch:all`).
- `pipeline/transform/laws.ts` (pure) + `laws-run.ts`; schemas `lib/laws-entities.ts`; add to `pnpm transform`, `pipeline/validate/schemas.ts`. Outputs: `laws.json` (row per law: `law_id`, congress, number, date, title, bill type/number, origin chamber, `sponsor_bioguide_id`, `policy_area`, CRS first sentence, `veto_override`), `laws_counts.json` (congress × policy area, band counts left empty for Session 2), `laws_meta.json` (data-through, policy-area catalog, partial-Congress flag), `laws_report.json`.
- The signing president is **derived** from the date through `administrations.json` (+ `HISTORICAL_ADMINISTRATIONS`), never stored; the per-Congress "signed most" attribution is computed in derive code and tested (also the Congresses where it splits).
- Gates (transform throws): per-Congress count equals the source's own `count`; every sponsor id resolves in the legislators data (or is listed in the report); every law has a date inside its Congress; counts file sums back to the list.
- Tests over the real files (anchors 651 / 274, partial 119th flag, policy-area catalog = 32).
- Docs: `docs/LAWS_METHODOLOGY.md` (draft), DATA_CONVENTIONS §15, ARCHITECTURE_MAP data rows.

**Gate:** report totals, gaps, unmapped sponsors, file sizes. Back-fill is run once by you or in the session (hours); commit the output.

**Prompt:** "Do Session 1 of `docs/CONGRESS_LAWS_EXECUTION_PLAN.md`, using `docs/LAWS_PREFLIGHT.md` for source behaviour. Model it on the Decisions track."

---

## Session 2 — Passage votes and support bands

**Goal:** each law carries its per-chamber final-passage result, and a band.

**Do:**
- `pnpm fetch:voteview` extended (or a sibling) for the roll-call file; raw under `pipeline/raw/voteview/`.
- Parse each law's action history for the final-passage roll number / voice vote / unanimous consent per chamber (rules and edge cases from Session 0: concurrence votes, conference reports, suspension-of-the-rules votes, laws that passed one chamber by voice only).
- Join to Voteview for the tally. Band = yes share of the narrowest recorded final-passage vote (yes ÷ votes cast); no recorded vote in either chamber = band 0; display order in code constants, data order 0–4.
- Fill `laws.json` passage fields and `laws_counts.json` band counts. Gate: for every law with a recorded vote, the tally equals the action-text tally where both exist; report unparsed laws by decade; the parse rate must meet the bar set at the Session 0 gate or the support card starts later (record the start Congress in `laws_meta.json`).
- Tests: known tallies (e.g. 111-148 Senate 60–39, 99-514, 93-148 override votes).

**Gate:** parse/join rates by decade; the band-share chart data printed as a table for you to eyeball.

**Prompt:** "Do Session 2 of `docs/CONGRESS_LAWS_EXECUTION_PLAN.md`. Stop at the gate with per-decade parse rates."

---

## Session 3 — Major laws, party control, summaries

**Goal:** the three enrichments, each with a measured join rate.

**Do:**
- **Major laws:** hand-extract Mayhew's lists (1973–2024) into `pipeline/reference/mayhew-major-laws.json` (title, year, source list, a verbatim quote or line reference) — the same discipline as `energy-actions.json`. `pipeline/transform/laws-major.ts` joins to `laws.json` by Pub. L. number where given, else title + year (like `landmarks.ts`); every name match and every miss goes in `laws_report.json`; gate: ≥ the agreed share joins (propose 97%, as landmarks) and no list entry is unaccounted for. Three states in the schema (`major: true | false | null` where null = Congress not yet covered by a list; coverage boundary in `laws_meta.json`). Credit in `docs/CREDITS.md` and the methodology page.
- **Party control:** extend `pipeline/reference/congress-control.json` back to 1973-01-03 with a primary-source citation per chamber row (Senate Historical Office, Clerk of the House); keep rows contiguous; update `lib/congress-control.ts` tests (the range assumptions there currently start 1991). Note the 107th Senate switch.
- **Summaries:** CRS first sentence, trimmed (name and "This bill…" head cut as the case summaries do), kept only as one finished sentence of 40–300 characters; none otherwise. Report fill rate by decade.

**Gate:** join rate, list of misses, control-table diff, summary fill rates.

**Prompt:** "Do Session 3 of `docs/CONGRESS_LAWS_EXECUTION_PLAN.md`. No model-written summaries."

## Session 3b — Provisional major flag (gated experiment)

**Goal:** decide, with numbers, whether the in-progress Congress gets a provisional flag.

**Do:**
1. **Before running anything**, write the acceptance bar into `docs/LAWS_METHODOLOGY.md` (propose: precision ≥ 70% and recall ≥ 80% against Mayhew over 2013–2024; you confirm or change).
2. Candidate rules, each scored on precision and recall over 2013–2024: (a) law has a dedicated Wikipedia article (reuse the Decisions article-join machinery); (b) article lead calls it major or landmark; (c) size signals (summary length, page count, reconciliation or omnibus); (d) a model reading the Wikipedia lead under the verbatim-evidence guard (`checkAiSummary` style: quote must be verbatim, numbers must appear in the source).
3. Report the table. If one rule clears the bar, implement it as `major_provisional` for Congresses with no Mayhew list, cached like `case_summaries.json` (committed, incremental, never overwrites). If none clears it, **ship nothing** and record the result; the UI keeps "Not yet assessed".
4. The provisional flag is never counted as Mayhew's: separate field, separate badge, separate count in the report.

**Gate:** the score table and your go / no-go.

**Prompt:** "Do Session 3b of `docs/CONGRESS_LAWS_EXECUTION_PLAN.md`. Write the acceptance bar first, run the back-test, and stop at the gate."

---

## Session 4 — Page shell, filter bar, cards 1 and 2

**Goal:** `/congress/laws` live with the first two charts.

**Do:**
- `lib/verticals.ts`: add Laws as the second Congress section (Ideology · Laws · Demographics · Wealth), `status: live` with the `page.tsx`; check `lib/verticals.test.ts`, sitemap, hub blurb.
- `lib/laws-data.ts` (server-only, Zod) → `lib/laws-derive.ts` (pure, tested: window sums, stacks, band stacks, peak/low, signed-most president, majority-party helpers, small-count behaviour) → `lib/laws-types.ts`.
- `components/laws/`: `LawsPageClient`, `LawsState` (one state: years window, policy area, major-only, support band, hovered / pinned Congress; rAF-throttled hover), `LawsFilterBar` (Policy area, Major laws with `?`, `RangeSelector` + `TermBand`, `RangeReset`), `CasesCard`-style card 1 on `charts/StackedBars` (add Congress-slot support rather than forking; president band from the signed-most attribution; hatched partial Congress; Number / Share; legend entries filter), card 2 as a stacked area (reuse `SplitChart`'s approach; Share / Number; band labels in thick bands, legend isolates a band and narrows card 1).
- Party-control checkbox (default off) above the cards, drawing House / Senate rows under the president band using `controlSpans`-style helpers adapted to Congress slots.
- Data notes, View as table, Source line copy from the mockup (check the numbers they cite against the data).
- Page metadata in `app/congress/laws/page.tsx`; `PageHeader`, no `max-w`; "How to read this".

**Gate:** screenshots at 1280 and 390, light and dark, next to the mockup.

**Prompt:** "Do Session 4 of `docs/CONGRESS_LAWS_EXECUTION_PLAN.md`. The mockup is the visual spec; reuse Decisions components, no forks."

---

## Session 5 — Card 3 and the list

**Goal:** the heatmap pair and "Every law".

**Do:**
- Card 3: `DecadeHeatmap` + `StackedRows` reused with the Laws / Narrow votes / No recorded vote toggle (`ReversibleSortToggle`, second click reverses), rows and heatmap rows share the same fixed row height so the two sides match, full list on desktop and a fixed-height scroll box on phones only, band key in the header row, a click sets the page's policy area.
- List: `/data/laws/list` static JSON (compact tuples like `DecisionCase`), fetched once on mount; row component modelled on `CaseRow`: date, name with Major-law / Provisional / Veto-override badges, Pub. L., bill and sponsor line, CRS sentence, policy area, band swatch with both tallies, "Signed by" with party dot. Fixed-height scroll box with rows added on scroll, filter chips that clear themselves, search (name, bill, sponsor, area, summary; every word must match), support-band pills, "Browse all N laws ↓" `JumpToCases`-style link with a live count.
- Sponsor names link to a profile only where one exists (`hasProfilePage`).
- Three-state Major column (Not yet assessed reads in muted text; the Major laws filter's `?` and Data notes say "through the 118th Congress").

**Gate:** screenshots, plus a click-through of every control.

**Prompt:** "Do Session 5 of `docs/CONGRESS_LAWS_EXECUTION_PLAN.md`."

---

## Session 6 — Verification and polish

**Do:**
- `scripts/check-laws.mjs` and `pnpm check:laws` (Playwright, like `check-decisions.mjs`): 1280 / 1024 / 768 / 390, light and dark; no console errors, no horizontal overflow, bar stays pinned; ledes carry the data anchors (93rd and 118th counts); card 3's two sides have equal height and no scrollbar at ≥ lg; peak/low labels re-picked on filter; every band named; the policy area survives a window change; tooltips behave on touch (tap keeps open).
- Methodology page entry (`lib/methodology-content.ts`; test requires `docPath` exists and credits present: Congress.gov, Voteview, Mayhew), `docs/CREDITS.md`, hub card on `/`, OG image, sitemap.
- Finalize `docs/LAWS_METHODOLOGY.md`; move the scope doc's settled items into it; update `ARCHITECTURE_MAP.md` routes + a "Laws page" section (decisions recorded so they are not re-litigated).
- Accessibility pass: legend and toggles keyboard operable, `aria-label`s, tables.

**Prompt:** "Do Session 6 of `docs/CONGRESS_LAWS_EXECUTION_PLAN.md`."

---

## Session 7 — Freshness

**Do:**
- `.github/workflows/laws-freshness.yml` (weekly: incremental fetch, transform, PR only if `pipeline/output` changed, auto-merge only through the shared gate-and-merge action). Reuse the data-refresh pattern in the architecture map.
- Mayhew coverage review (`laws-major-review.yml`, like `energy-actions-review.yml`): warns when a Congress has ended and has no list yet, and when provisional laws exist for a Congress that now has one (it flips them and lists the changes in the PR).
- Voteview roll-call refresh rides the existing `voteview-freshness.yml`; confirm it does not break.
- Rate-limit-safe: a failed run leaves the committed output untouched.

**Prompt:** "Do Session 7 of `docs/CONGRESS_LAWS_EXECUTION_PLAN.md`."

---

## Later (own plans, not started)

- **v1.1 support measure:** minority-party support per law from Voteview member votes (same data member pages need).
- **Extra trend cards** from the scope doc: whose bills become law (sponsor party vs majority), fewer-bigger laws (page counts), ceremonial laws (needs an audit sample).
- **Pre-1973 extension:** classify older laws with the model-classifier pattern, calibrated on 1973–1980 against CRS's own labels; Mayhew covers the major ones.
- **Member pages:** laws sponsored, and "How {Name} voted on laws" (the `JusticeVotesCard` pattern; per-member vote shards at `/data/members/[id]/law-votes`). Data prerequisites are already carried by Sessions 1–2 (`sponsor_bioguide_id`, cosponsors, roll numbers).

## Dependency order at a glance

0 → (your gate) → 1 → 2 → 3 → 3b → 4 → 5 → 6 → 7. Sessions 3b and 4 can overlap if 3b's go / no-go is not yet in (the UI already handles "Not yet assessed"). Session 7 can move earlier if you want the data to stay fresh while the UI is built.
