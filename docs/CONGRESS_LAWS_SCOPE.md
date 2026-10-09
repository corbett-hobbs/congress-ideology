# Congress → Laws: scope

Execution plan, session by session: `docs/CONGRESS_LAWS_EXECUTION_PLAN.md`.

Status: **built through Session 6; settled items now live in `docs/LAWS_METHODOLOGY.md`.** (Originally: scoping and mockup only.) Mockup: `docs/mockups/congress-laws/laws-page.html` (open it over any static server, e.g. `python3 -m http.server` in that folder; desktop and phone boards, interactive). Written 2026-10-08.

The page is the Congress sibling of Supreme Court → Decisions: *what Congress enacts*, by policy area, over time, with a trend or two underneath and a list of every law. The long-term goal is per-member pages ("laws this member sponsored, how they voted on laws"), the way the justice pages followed Decisions. Section 6 lists what the data layer must carry now so that step is cheap.

---

## 1. How it maps onto the Decisions page

| Decisions (Supreme Court) | Laws (Congress) |
| --- | --- |
| Term (Oct–Sep), one bar per term | Congress (two years), one bar per Congress, labelled by the year it opens |
| 1946–, SCDB | 1973–, Congress.gov (see decision 1 for going earlier) |
| Issue area (14, SCDB) | Policy area (32, assigned by the Congressional Research Service) |
| Landmark cases (Wikipedia list) | **Major laws** (David Mayhew's lists of important enactments) |
| Dissent bands (0 to 4 dissents) | **Support bands** (no recorded vote / 90%+ yes / 75–90 / 60–75 / under 60) |
| Chief Justice / president band | President who signed most of that Congress's laws |
| "Every case" list, Wikipedia summary sentence | "Every law" list, first sentence of the CRS summary |
| Outcome tag (liberal/conservative) | none; the support band and the party dot on "Signed by" take its place |
| Heatmap by decade, Cases / 5–4 / Unanimous | Heatmap by decade, Laws / Narrow votes / No recorded vote |

Everything else is reused: `charts/StackedBars`, the `DecadeHeatmap` / `StackedRows` pair, `ChartCard`, `RangeSelector` + `TermBand`, `MethodologyNote`, `CaseRow`-style list rows, `lib/term-label.ts`, the `--fuel-*` (area) and `--split-*` (band) colours. **No new colour tokens.**

## 2. Page spec (what the mockup shows)

- **Nav:** Congress → Ideology · **Laws** · Demographics · Wealth (second, next to Ideology, as Decisions sits next to Ideology on the Court). Flip `soon` → `live` in `lib/verticals.ts` plus the `page.tsx`.
- **Pinned bar (rules 3, 5, 5b):** Policy area dropdown, "Major laws" checkbox with a `?` definition, Years-shown slider with the president band under it, Reset only once narrowed. One line on desktop; two on phones.
- **Title:** "What Laws Does Congress Pass?" Intro and "How to read this" as in the mockup; "Browse all N laws ↓" jump link with a live count.
- **Card 1, "How many laws does Congress pass?"** Laws per Congress stacked by policy area (six biggest + "Other areas (26)"), Number / Share toggle, peak and low labels, president band, legend entries are the policy-area filter, partial 119th hatched. Optional "Show which party held the House and Senate" rows (the Economy page's Congress-control option, default off).
- **Card 2, "How broadly are laws supported?"** Same Congresses as a stacked area of the five support bands, Share / Number, band names in the band where thick enough, legend isolates a band (and narrows the list).
- **Card 3, "Which kinds of laws are narrow, and which sail through?"** Decade heatmap (area × decade, counts, one colour scale) and 100% band bars per area; one reversible toggle sets the measure and orders both. A click sets the page's policy area.
- **List, "Every law":** newest first, fixed-height scroll box, rows added on scroll. Columns: Signed (date) · Law (name, Major-law badge, Veto-override badge, Pub. L. number, bill number and sponsor, CRS sentence) · Policy area · Final passage (band swatch + Senate and House tallies) · Signed by (name + party dot). Filters: policy area, Major laws, support band, search; every active filter is a chip that clears itself.
- Data notes under every chart (drafted in the mockup, within the 60–100 word rule), "View as table", one open Source line. Help text says "select".

Rules checked against `ARCHITECTURE_MAP.md`: 1 (full-width intro), 3–5b (bar), 6a (sticky tooltips for bars), 7 (Data notes), 8 (solid colours; the one hatch is the partial Congress), 10a–10j, 11a, 12 (peak/low), 12c (legend isolate), 15.

## 3. Trends under the main chart

Built in the mockup (recommended for v1): **A** laws per Congress by area; **B** breadth of support; **C** area × decade heatmap.

Candidates, in my order of preference, none built:

| # | Trend | Why it earns a card | Data and risk |
| --- | --- | --- | --- |
| D | **Party control rows** (checkbox, shown in the mockup) | Lets a reader see output under unified vs divided government, the classic Mayhew question | `congress-control.json` starts 1991; extend back to 1973 by hand with a citation per row (the mockup's rows are from memory) |
| G | **"Whose bills become law"**: share of laws whose sponsor is in the majority vs the minority party, and by chamber of origin | Cheap, new, and it is the first step toward member pages | Sponsor party from the API, majority from the control table |
| E | **"Fewer, bigger laws"**: pages of law enacted per Congress next to the law count | The omnibus story; counts fall while pages do not | Page counts from GovInfo's Statutes at Large / public-law packages; needs a pre-flight |
| F | **Ceremonial laws**: share that name a post office, mint a medal, set a holiday | A hook, and it explains part of the falling count | Our own title-pattern flag, so it needs an audit sample (as the EO topic audit) |
| H | Vetoes and overrides | Small; already a badge on the list | API action text |
| — | Share of introduced bills that become law | Famous number | Needs all ~600k bills; defer |

## 4. Data

### What I verified (2026-10-08, Congress.gov API with the shared `DEMO_KEY`, which ran out after about eight calls)

- `GET /v3/law/{congress}/pub` lists a Congress's public laws with a `count`: **93rd = 651, 85th = 935, 118th = 274**; private laws for the 118th = 0. Law lists go back at least to the **85th (1957)**; I did not find the earliest.
- A **93rd-Congress** law (S. 3331 → P.L. 93-386) carries `policyArea`, `sponsors` with a **`bioguideId`**, `subjects`, `summaries`, `introducedDate` and the law number.
- An **85th-Congress** law (S. 4208 → P.L. 85-657) carries only `introducedDate` and the law number: **no policy area, no sponsor, no subjects, no summary.** So the structured fields start where Congress.gov's member and subject data start, 1973.
- Congress.gov's own help says terms for the 110th and earlier Congresses came from an older vocabulary, and CRS planned to convert them to the current policy areas "as time and resources permitted". **I have not measured how many 93rd–110th laws actually have a `policyArea`**; that is pre-flight item 2.
- Elsewhere (read, not probed): Voteview's roll-call file documents `congress`, `chamber`, `rollnumber`, `date`, `bill_number`, `vote_result`, `vote_question`, `vote_desc`; I could not confirm a `yea_count` / `nay_count` column from the docs, so confirm it or sum from the member-votes file. Mayhew's lists run **1947–2024** as Word/PDF files with no stated licence (credit and cite). The Comparative Agendas Project's Public Laws set covers 1948–2022 (21,968 laws) with its own 20-topic coding.
- The repo has only `HSall_members.csv` and `HSall_parties.csv` from Voteview; the roll-call and member-vote files are not fetched yet. `congress-control.json` starts 1991-01-03. `.env.local` has no Congress.gov key; a free key from api.data.gov is needed (I can't create accounts).

### Proposed tracks and files (mirrors the Decisions track)

| File | Grain | Notes |
| --- | --- | --- |
| `laws.json` (served as `/data/laws/list`, fetched on mount like `/data/decisions/cases`) | one row per public law, 1973-, ~12.6k | `law_id` (`119-pub-21`), `congress`, `number`, `date`, `title`, bill type/number, origin chamber, `sponsor_bioguide_id`, `policy_area`, CRS first sentence (≤300 chars, none = none), per-chamber passage (`kind` roll / voice / consent, yea, nay, `roll`), `veto_override`, `major`, Wikipedia title. Roughly 4–6 MB raw, ~1.5 MB gzipped (estimate). The signing president is **derived** from the date through `administrations.json`, never stored. |
| `laws_counts.json` | `(congress, policy area)` with the five band counts and the major count | the page's chart payload; shares derived in code, never stored |
| `laws_major.json` | one row per major law | hand-extracted from Mayhew into `pipeline/reference/`, joined by title + year (like `landmarks.ts`), every miss listed in the report |
| `laws_meta.json`, `laws_report.json` | data-through Congress, policy-area catalog, gate results | |
| (later) `law_votes/<id>.json` | one member's `[law_id, vote]` rows | member pages; see section 6 |

Raw, **bulk first**: GovInfo publishes Bill Status XML as one ZIP per bill type per Congress for the **108th (2003) onward** (https://www.govinfo.gov/bulkdata/BILLSTATUS). Per its user guide each file carries policy area, subjects, sponsors with `bioguideId`, cosponsors, summaries, the public law number and `recordedVotes` inside each action. That covers about 12 of the 27 Congresses with file downloads and no per-law calls. I found **no bulk package for 1973–2002 (93rd–107th)**; those Congresses need the Congress.gov API (the `unitedstates/congress` scraper of the retired THOMAS site is another route, unconfirmed). So: `pipeline/raw/govinfo-billstatus/` for 2003– (`pnpm fetch:billstatus`, keyless; zips are large, so download only after approval and keep only the public-law bills' XML, or just the fields the transform reads) and `pipeline/raw/congress-gov/` for 1973–2002 (`pnpm fetch:laws`, needs `CONGRESS_API_KEY`; incremental on `updateDate`). Both are not in `fetch:all`; weekly freshness workflow like the others. Rough API budget for the 15 older Congresses only: about 7.5k laws × (detail + actions + summaries) ≈ 20k calls, roughly four hours once at the documented 5,000-an-hour limit (confirm); the 2003– Congresses need no per-law calls. Newer laws between bulk releases can come from the API's law list. These estimates are unmeasured; Session 0 replaces them. Gate style as elsewhere: the transform fails unless per-Congress counts match the source's own `count`.

### Pre-flight (do before any UI; write `docs/LAWS_PREFLIGHT.md`)

1. **Counts:** per-Congress public-law counts from the API agree with an independent tally (GovInfo's public-law packages or the Statutes at Large). Find the API's earliest Congress.
2. **Policy-area fill rate by Congress, 93–119.** If a stretch is below ~99%, show an explicit "Not classified" series (as Decisions does for unclassified cases) or start later.
3. **Signing date:** the `Became Public Law` action date vs the list's `latestAction.actionDate` (they can differ). Veto overrides use the override date.
4. **Passage votes:** parse `(chamber, roll number)` out of each law's action text; sample 30 laws per decade; join to Voteview for the tally; report the parse rate by decade. A law's band is its **closest** recorded final-passage vote; none in either chamber = "No recorded vote". If pre-1990 action text is too thin, start the support card where it is reliable and say so.
5. **Summaries:** fill rate by decade and first-sentence quality (the case-summary lessons apply: no model-written text unless it is held to the source's words).
6. **Major-law join rate** (Mayhew list → law) and **sponsor join** (every `bioguideId` found in `legislators.json`, which includes historical members).

## 5. Decisions for you

1. **Start year.** *Recommend 1973 for v1* (every structured field exists; the page never shows a fact we did not get from the source). The cost: the 1964 Civil Rights Act, the Voting Rights Act and Medicare fall outside it. *Phase 2 option:* extend to 1947 by classifying pre-1973 laws with the project's existing model-classifier pattern (`classify:eos`), **calibrated on 1973–1980, where CRS's own labels exist**, so the agreement rate is measured before it is shown, with the Mayhew list covering the major ones. Extending with the Comparative Agendas topics instead would mean two taxonomies on one chart.
2. **What "broadly supported" means.** *Recommend* the closest-recorded-vote band for v1 (it needs only roll numbers and tallies). The better measure is **minority-party support** (what share of the other party voted yes), which needs member-level votes; it is the same data member pages need, so it is the natural v1.1.
3. **Slot = Congress, not calendar year.** Recommend Congress (it is how laws are numbered and counted; a calendar year splits the even-year surge). The president under a bar is the one who signed most of its laws; the tooltip shows the split in the two Congresses where it matters.
4. **Public laws only.** Private laws (individual relief, hundreds a Congress in the 1970s, none now) are excluded and said so in Data notes. Joint resolutions that became public laws are in.
5. **Major laws from Mayhew** (hand-extracted, credited), with the Wikipedia article linked from the name where one exists, over using Wikipedia's lists alone. His lists run one per Congress and the latest ends with the 118th (2023–24), so the 119th is unassessed until his 2025–26 list appears. **Settled: bridge it with a provisional flag** (dashed "Provisional major" badge, replaced by his judgment when it arrives), gated on a back-test; until then, and if the back-test fails, a law shows **Not yet assessed**, never a blank that reads as "not major". Plan in section 8, step 3b.
6. **Dropdown shows all 32 policy areas;** the charts show the six biggest by total laws plus "Other areas (26)", fixed so colours do not move (the Decisions rule).
7. **Sponsor on a big package is the bill's sponsor,** often the member whose vehicle carried the text, not its author. Data notes say so (drafted).

## 6. The member-page step (later; nothing to build now)

The Laws data layer should carry, from day one: `sponsor_bioguide_id` on every law, a `cosponsors` list (bioguide ids, kept in a separate file so the list payload stays small), and the roll-call `(chamber, roll)` per law, so a member page can add:

- **"Laws this member sponsored"**: the same list rows filtered by sponsor, with the Major-law badge and band.
- **"How {Name} voted on laws"**: the Justice-votes pattern (`JusticeVotesCard`): a summary strip, All / With the party / Against the party filters, and the same rows plus a "How they voted" column. It needs Voteview's member-vote file reduced to the roll calls that passed laws (order of 3–5 million rows for 1973-, sharded per member and fetched on demand like `/data/justices/[id]/votes`).
- Sponsor names link to a profile only where the member has one (`hasProfilePage`; profiles exist for the current Congress, so most historical sponsors will be plain text; the mockup does this).

## 7. Out of scope for v1

Bills that did not become law; amendments; per-law page; text analysis of the laws; a liberal/conservative rating of laws (no neutral coding source exists; the Court's SCDB direction coding has no counterpart); presidential signing statements; state of the economy overlays.

## 8. Suggested sessions

0. Key + pre-flight probes (section 4) → `docs/LAWS_PREFLIGHT.md`, then decisions 1–2 are settled with real numbers.
1. Data layer: fetch, transform with gates, Zod schemas, tests over the real files, `docs/LAWS_METHODOLOGY.md`, `ARCHITECTURE_MAP.md` rows.
2. Votes: Voteview roll-call join and the bands.
3. Major laws (Mayhew), control table back to 1973, summaries. The flag has three states: Major / Not major / Not yet assessed (the 119th reads "n/a" in counts, never zero; the Major-laws `?` tip and Data notes say "through the 118th Congress").
3b. **Provisional major flag for the in-progress Congress.** (a) Back-test candidate rules over 2013–2024 against Mayhew's lists and record precision and recall: dedicated Wikipedia article; article lead calls it major or landmark; size signals (summary length, page count, reconciliation or omnibus); a model reading the Wikipedia lead under the case-summary verbatim-evidence guard. (b) Ship the best rule only if it agrees well enough (set the bar before running it; it goes in `docs/LAWS_METHODOLOGY.md` with the numbers); otherwise ship "Not yet assessed" alone. (c) Provisional badge is visibly different from Mayhew's, never counted as his, and the freshness job flips each provisional law to his call when a new list is added and reports what changed. (d) Optional, your call: email Mayhew about his update plans and credit wording.
4. UI: filter bar, card 1, card 2, card 3 (reusing the Decisions components).
5. The list, search, jump link, `pnpm check:laws`, sitemap, methodology entry, hub card.
6. Member pages (separate).

Per `AGENTS.md`, read the relevant guide in `node_modules/next/dist/docs/` before writing any Next code in sessions 4–5.
