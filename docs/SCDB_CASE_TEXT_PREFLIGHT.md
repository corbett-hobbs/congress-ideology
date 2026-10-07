# Supreme Court case text — Session 0 pre-flight

Run 2026-10-06. Evidence only: nothing under `pipeline/output/`, no schema, transform, crosswalk, classifier, page, nav or `ARCHITECTURE_MAP.md`
was touched; no model was called; no full-text fetch was run. Throwaway scripts: `pipeline/preflight/scdb-text/` (not in `fetch:all`, CI or
`package.json`). Raw files lived in a scratch directory and are not committed. The sample list is `docs/scdb-text-preflight/sample.csv`.

## 1. Summary and recommendation

**Recommendation: conditional GO, in this order. Do not build the API route.**

1. **Start with SCDB's own party codes (free).** For the 193 issue-90120 cases, **181 (94%)** name a federal agency in `petitioner`, `respondent` or
   `adminAction`. That alone re-homes most agency-review cases to a subject.
2. **Text from public bulk, not the CourtListener REST API.** The API is token-only and documents **125 requests/day** by default
   (9,409 single calls ≈ 75 days). Use (a) the Harvard Caselaw Access Project static files for U.S. Reports volumes 2–572 (≈ terms through 2013;
   public, no token, tested on 166 sample cases) and (b) CourtListener's quarterly bulk CSV for 2014+ (public domain, no token; the 55 GB opinions file is
   one streaming pass, hours not days).
3. **Oyez only as a modern-era supplement.** Facts/question/conclusion exist for about 85–100% of 1990–2025 cases but under 10% before 1990. It is
   CC BY-NC 4.0, so do not store it.
4. **Divergence from the prompt: there is no official syllabus.** CourtListener's `syllabus` field is **empty for all 9,054 joined clusters**, and the
   CAP `head_matter` is a caption plus counsel list (the word "syllabus" appears in 0 of 161 sample cases). The usable text is the **opinion body**
   (median ≈ 9k–50k characters by decade). The excerpt would be the opening of the lead opinion, not a syllabus.

Gate scorecard (my gates are the prompt's, with two notes):

| Gate | Result | Verdict |
| --- | --- | --- |
| Join ≥ 95% | **96.2%** overall (9,054 / 9,409) by bulk `scdb_id` + U.S. cite. But **2020s = 24.9%**, 2010s = 90.8% | Passes overall, fails per-decade until the 2019+ join is fixed (see Q2) |
| Usable text ≥ 500 chars, ≥ 90% overall, ≥ 80% every decade | CAP, terms ≤ 2013: **145/161 = 90%** of found cases. By decade 1950s = 77%, 1960s = 82% of all sampled (short per-curiam/memorandum cases and 3 page mismatches). 2014+ not measured (no token, no opinions-file scan) | **Not yet demonstrable** — fails as measured; the misses are short orders and join gaps, not missing sources |
| Full fetch ≈ a day or less | Bulk: yes (download ≈ 30 min, decompress ≈ hours, parallelisable). API: no | Pass via bulk only |
| Licence permits storing excerpts + publishing derived labels | CourtListener data and CAP are public domain / CC0; Oyez is CC BY-NC | See Q6 — one ambiguity flagged |

I would add one gate of my own: **hand-check 25 classifier outputs on the five thin topics** before any page is built, because the SCDB issue code, not the text, is what misfiled the sanity cases (Q9).

## 2. Findings by question

### Q1 — SCDB 2026 Release 01 (Confirmed)

- Release page: `https://scdb.la.psu.edu/data/2026-release-01/`. The case-centered CSV "Organized by Supreme Court Citation" link is the first
  `?jet_download=` link on the page (hash `69e2a3e7…`; read off the page, not hardcoded in any script). It returns
  `SCDB_2026_01_caseCentered_Citation.csv_.zip`, `last-modified: 2026-09-09`.
- Retrieved 2026-10-06. zip sha256 `4d8f34d56363f8c140917bb556c530ee120aaaed6ed564a27866c0e5155e73f7` (714,240 bytes); CSV 3,035,019 bytes, latin-1.
- **9,409 rows**, 52 columns including `caseId`, `usCite`, `lexisCite`, `docket`, `term`, `issue`, `issueArea`, `decisionDirection`, `caseName`.
- **533 rows have no `usCite`** (279 in the 2010s, 254 in the 2020s): the most recent decisions are not yet in a U.S. Reports volume.

### Q2 — Join key (Confirmed, with a gap)

- CourtListener's cluster record carries **`scdb_id`** (also `scdb_decision_direction`, `scdb_votes_majority/minority`). Docs: REST v4 (`wiki.free.law/c/courtlistener/help/api/rest/v4/…`).
- **Every `/api/rest/v4/clusters/` call returned HTTP 401 without a token**; `/courts/` and `/search/` answered anonymously.
- Full-population join from the bulk files (no API): **8,856 matched on `scdb_id`**, 198 on U.S. citation, **355 unmatched**. By decade:

| Decade | SCDB cases | Joined | % |
| --- | --- | --- | --- |
| 1940s | 487 | 487 | 100% |
| 1950s | 1,173 | 1,172 | 99.9% |
| 1960s | 1,498 | 1,498 | 100% |
| 1970s | 1,669 | 1,669 | 100% |
| 1980s | 1,605 | 1,605 | 100% |
| 1990s | 1,023 | 1,023 | 100% |
| 2000s | 827 | 825 | 99.8% |
| 2010s | 750 | 681 | 90.8% |
| 2020s | 377 | 94 | **24.9%** |

- The 2019+ cases lack both a U.S. cite in SCDB and an `scdb_id` in CourtListener. They *do* exist in CourtListener: matching by **decision date + docket
  number** found the cluster in 5 of 6 tried (e.g. *Wooden v. United States*, 595 U.S. 360), so the join is fixable, but I did not run it across all 355.
- 30-case join-key check (`join30` in the CSV), anonymous `/search/?citation=…`: 20 of 30 returned a cluster, 15 of them with a non-empty `scdb_id`; the
  other 10 requests failed, which I read as anonymous throttling (not confirmed). The bulk join above is the stronger evidence.
- CAP's per-volume metadata also embeds the SCDB id as a vendor citation (`"SCDB 1946-001"`), a second independent join key for terms ≤ 2013.
- When several clusters share one U.S. cite (181 cases: companion cases, cert-order dockets), I chose by name similarity; those would need review.

### Q3 — Coverage on the stratified sample (198 cases, 22 per decade bucket, round-robin over `issueArea`; 5 sanity cases extra)

"CL" = CourtListener bulk cluster. "CAP" = Harvard Caselaw Access Project static JSON. "Text ≥ 500" = CL `headmatter` ≥ 500 chars **or** CAP opinion ≥ 500 chars.

| Decade | n | CL joined | CAP found | CAP opinion ≥ 500 | Text ≥ 500 (either) | Median CAP opinion chars | Oyez facts+question+conclusion |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1940s | 22 | 22 | 22 | 20 | 20 | 23,079 | 0 |
| 1950s | 22 | 22 | 22 | 17 | 18 | 13,157 | 0–1 |
| 1960s | 22 | 22 | 20 | 18 | 20 | 9,479 | 2 |
| 1970s | 22 | 22 | 22 | 20 | 20 | 40,605 | 1 |
| 1980s | 22 | 22 | 22 | 20 | 20 | 50,560 | 4 |
| 1990s | 22 | 22 | 22 | 20 | 20 | 50,032 | 15 |
| 2000s | 22 | 21 | 21 | 20 | 20 | 40,088 | 20 |
| 2010s | 22 | 19 | 10 | 10 | 15 | 34,520 | 19 |
| 2020s | 22 | 5 | 0 | 0 | 0 | — | 18 |
| **All** | **198** | **177** | **161** | **145** | **153 (77%)** | | **79 (40%)** |

- **What the "syllabus" is:** neither. CL `syllabus` is empty for all 9,054 joined clusters; CL `headmatter` and CAP `head_matter` are the caption, argument
  dates, and counsel lists (median 0.8k chars in the 1940s–60s, 2–3k by the 2000s). No official Reporter's syllabus survives in either source. Official
  syllabi exist in the U.S. Reports PDFs (Q11) and in Supreme Court slip opinions.
- The 16 CAP "found but < 500" cases are mostly short per-curiam/memorandum dispositions (p10 of opinion length is 94–752 chars before 1990). A classifier can use
  case name + SCDB issue label for those. Three more (1963 ×2, 2007) matched no case at the cited first page.
- CAP stops at U.S. volume 572 (checked: volumes 573+ return 404). That is why 2014+ is the hard region.
- **Not measured:** CL opinion-text length for 2014–2025. The text is there (anonymous search returned `combined-opinion` snippets for the recent cases tried), but
  measuring it needs a token or a scan of the 55 GB opinions file, which I did not run (out of scope).

### Q4 — Bulk vs API (Confirmed)

- Bulk, public, no token: `https://storage.courtlistener.com/bulk-data/<name>-<YYYY-MM-DD>.csv.bz2`, Postgres `COPY` CSV, regenerated **quarterly (Mar/Jun/Sep/Dec 31)**,
  "snapshots, not deltas". Latest: 2026-09-30. Sizes: `opinion-clusters` 2.47 GB, `citations` 127 MB, `dockets` 5.1 GB, **`opinions` 55.3 GB** (all courts; no per-court file).
- Parsing gotcha (cost me a run): quotes are **backslash-escaped**, so Python's `csv` needs `escapechar="\\"`; without it ~93% of rows mis-split.
- I downloaded the clusters and citations files, scanned 10.17 M clusters in about 7 minutes (single core), and kept the 9,855 that match SCDB.
- Versus the API: bulk gives all SCOTUS clusters in one pass; the opinions file is the only way to get CL text without per-call limits, at the cost of one
  streaming pass over 55 GB (a few hours single-threaded; I did not run it).

### Q5 — Auth and limits (Confirmed from docs; token not tested — none supplied)

- Token required for clusters/opinions (`Authorization: Token …`). Documented default for authenticated users: **5/minute, 50/hour, 125/day**, rolling windows,
  all applied at once; more via a Free Law Project membership or a commercial agreement. Multiple accounts or credential rotation to exceed limits are prohibited.
- 9,409 single-case calls ≈ **75 days**; even at 20 results/page (default page size; batch filters unverified) ≈ 470 calls ≈ 4 days. The 200-case sample alone would
  take 2 days, which is why I used bulk files instead. I have **not** observed the live limit headers; confirming the number needs a token.
- If a token is ever needed it goes in `.env.local` / a repo secret like `FRED_API_KEY`; none was created or used here.

### Q6 — Terms and licensing (read, not decided)

- **CourtListener** — Terms: `https://www.courtlistener.com/terms/` (→ `wiki.free.law/c/terms/courtlistener/courtlistenercom-terms-of-service-and-policies`, last modified 2026-08-05).
  Restrictions are about lawful use, no FCRA uses, no credential sharing or limit evasion, and "do not present it in a way that suggests Free Law Project produced,
  endorsed, or verified an AI-generated analysis". No prohibition on redistribution or on model input is stated. Bulk data: "public domain… free of known copyright
  restrictions" (`wiki.free.law/c/courtlistener/help/api/bulk-data/bulk-legal-data`).
- **Harvard CAP** (`static.case.law`) — CC0; commercial restrictions ended March 2024 (per press coverage: `lawnext.com/2024/03/event-tomorrow-marks-the-end-of-commercial-restrictions-on-the-caselaw-access-project…`).
  I could not read `case.law`'s own terms page from a script (it serves a bot challenge, which I did not work around); confirm it in a browser before relying on this.
- **Oyez** — `https://www.oyez.org/license` says verbatim that all content "is released under the Creative Commons Attribution-NonCommercial 4.0 International License"
  (the third-party note is right on BY-NC; it is **not** ShareAlike). Contact `comments@oyez.org` for other terms. The JSON at `api.oyez.org` is **undocumented**; I found no
  published API terms.
- **One-paragraph read:** the court-opinion text itself is a U.S. government work in a public-domain compilation, and both CL bulk and CAP say public domain/CC0, so
  storing trimmed excerpts in the public repo and feeding them to a model looks permitted, and publishing only derived topic labels is the lowest-risk option. Oyez
  is the exception: BY-NC means attribution is required and non-commercial only, and whether this site counts as "non-commercial" (ads, sponsorship, a paid tier) is
  **ambiguous and yours to decide**. Using Oyez as transient model input without storing it is a grayer area I would ask Oyez about. CourtListener's terms add an attribution caution for AI-generated analysis.

### Q7 — Oyez as supplement (measured, no content stored)

Oyez's per-term listing (`api.oyez.org/cases?per_page=0&filter=term:T`, 7,392 cases across the 73 terms touched) was matched to the sample by U.S. cite. Looking
up by term/docket is wrong for old terms (it returns an unrelated listing), so the first attempt in `05-…py` undercounted; `05b` is the one to trust.

| Decade | Listed on Oyez | Has facts + question + conclusion |
| --- | --- | --- |
| 1940s | 0 / 22 | 0 |
| 1950s | 7 / 22 | 0–1 |
| 1960s | 16 / 22 | 2 |
| 1970s | 20 / 22 | 1 |
| 1980s | 20 / 22 | 4 |
| 1990s | 21 / 22 | 15 |
| 2000s | 20 / 22 | 20 |
| 2010s | 19 / 22 | 19 |
| 2020s | 18 / 22 | 18 |
| **All** | **141 / 198** | **79 / 198 (40%)** |

Oyez lists many older cases but only writes the three summary fields from roughly 1990 on. "Reportedly 5,000 cases / from about 1955" is right for listing, not for summaries.

### Q8 — SCDB party codes (the free first step)

`petitioner`/`respondent` use one codebook of ~311 values: 1–28 generic government, 100–260 private party types (environmental organisation 150, railroad 231,
school board 22, private school 232…), and **301–422 individually named federal agencies** (EPA 333, FDA 340, FERC 344, FPC 352, NRC 385, Defense 324, Interior 326, HHS 363…).
`adminAction` is a separate list that equals the agency code minus 300 for federal agencies (44 = FERC, 52 = FPC); `lawType` is only a category of legal provision, not an agency.
Of the **193 issue-90120 cases**:

- 117 (61%) name an agency as a party; **181 (94%)** name one in party **or** `adminAction`; 12 name none.
- Coarse family, sizing only (`02-party-codes.py` FAMILY map, **not** a crosswalk): energy/environment 27, health/education 23, trade/foreign 9, national security 4,
  immigration/justice 3, labour/economic regulators 33, other agencies 82 (ICC, FTC, FCC, SEC, Postal Service…), no agency 12.
- Most frequent: NLRB 23, ICC 11, HHS 10, FTC 8, Interior 6, Agriculture 5, FCC 5, HEW 5, FPC 4.
- So party codes alone can assign a subject to roughly **60–70 of the 193** with the thin-topic agencies (27 + 23 + 9 + 4), and a regulator family to most of the rest. Full-text
  is only needed for the 12 with no agency and for ambiguous departments (Interior, HHS).

### Q9 — Sanity cases (what sources return; my pick of what a human would choose)

| Case | SCDB issue (area) | Party codes | CL / CAP | Oyez | Human topic |
| --- | --- | --- | --- | --- | --- |
| *Hamdan v. Rumsfeld* (2005-086) | 10020 (area 1, criminal procedure) | pet. "alien…", resp. Defense Secretary | joined; head-matter 8.1k chars; CAP N/A (2006) | facts/question/conclusion present (about Guantánamo detention and military commissions) | **National security & defense** |
| *Rostker v. Goldberg* (1980-136) | 20130 (area 2, civil rights) | pet. Selective Service System | joined; CAP found | present | **National security & defense** (draft registration) |
| *Udall v. FPC* (1966-113) | 90120 judicial review of agency action (area 9) | pet. Interior, resp. Federal Power Commission; adminAction = FPC | joined; head-matter 2.5k chars | listed, **no summary** | **Energy & environment** (hydroelectric licensing) |
| *Mobil Oil Exploration v. United Distribution* (1990-020) | 90120 (area 9) | pet. oil company, resp. pipeline company; adminAction = FERC | joined; head-matter 3.7k chars | listed, **no summary** | **Energy & environment** (natural-gas pipeline rates) |
| *Moore v. Charlotte-Mecklenburg Bd. of Ed.* (1970-086) | 90210 (area 9) | pet. minority, resp. local school board | joined; head-matter 0.9k chars | present | **Health & education** (school desegregation) |

Takeaway: for all five, a party-code agency (Defense, Selective Service, FPC/FERC, school board) points to the human's answer. The two energy cases have no Oyez summary, so
Oyez would not have helped where help is needed most.

### Q10 — Projected repo size (all 9,409 cases)

Measured on 161 CAP-found sample cases, excerpt = first N chars of the lead opinion (cases shorter than N are not padded; 14% are shorter than 2,000 and 19% shorter than 4,000):

| Excerpt cap | Mean excerpt | Raw text | JSON with ids/fields (+~120 B/case) | Approx. in git (gzip ≈ 0.47) |
| --- | --- | --- | --- | --- |
| 2,000 chars | 1,789 | 16.8 MB | **≈ 18 MB** | ≈ 8–9 MB |
| 4,000 chars | 3,459 | 32.5 MB | **≈ 34 MB** | ≈ 16 MB |

Either fits in the repo, but a classifier input file would be better as a build artifact than a committed one if it is re-generated.

### Q11 — Fallback primary source (not built)

- **govinfo** (`govinfo.gov/app/collection/usreports`, help `govinfo.gov/help/usreports`): U.S. Reports volumes 2–585 (to 2017) as per-volume and per-section PDFs, plus a text file per
  volume, predictable `USREPORTS-<vol>-<page>` package/granule IDs; volumes 586+ are on supremecourt.gov. The only route to the **official syllabus** at scale. Needs PDF/text parsing and
  per-case splitting; public domain as a government publication.
- **Library of Congress** (`loc.gov/collections/united-states-reports`): historic volumes as PDF; its JSON endpoint answered my scripted request with a Cloudflare challenge (HTTP 403), which I did not bypass.
- **supremecourt.gov** slip opinions (`supremecourt.gov/opinions/slipopinion/<yy>`, HTTP 200) carry the syllabus for recent terms.
- One paragraph on use: if the syllabus turns out to matter more than the opinion's opening, govinfo + slip opinions are the path; it is a parsing project, not a drop-in.

## 3. Proposed gates for the build session (adjust freely)

1. **Join**: ≥ 95% overall **and ≥ 90% in every decade**, after adding the date+docket join for 2019+. (Overall is already 96.2%; the 2020s are the blocker.)
2. **Usable text**: ≥ 90% of cases have ≥ 500 chars of lead-opinion text **or** a named agency from party codes; per-curiam/memorandum cases are labelled from caption + issue code and counted separately.
3. **No-syllabus acceptance**: the build must say plainly that excerpts are the opinion's opening, not the syllabus.
4. **Full fetch**: one bulk pass (clusters + citations + the 2014+ opinions) in a day or less; **no per-case CourtListener API calls** unless a membership raises the limit.
5. **Licensing**: no Oyez content stored; if Oyez is used at all, record the BY-NC decision and attribution wording first.
6. **Quality**: hand-check 25 outputs on each thin topic, and re-run the five sanity cases.

## 4. Reproduce

```bash
S=/path/to/scratch            # raw files stay here, never committed
# SCDB zip → $S/SCDB_2026_01_caseCentered_Citation.csv ; petitioner codebook text → $S/petitioner.txt
# CourtListener bulk → $S/cl/citations-2026-09-30.csv.bz2, $S/cl/opinion-clusters-2026-09-30.csv.bz2
python3 pipeline/preflight/scdb-text/01-extract-clusters.py $S   # ~7 min
python3 pipeline/preflight/scdb-text/02-party-codes.py $S
python3 pipeline/preflight/scdb-text/03-join-coverage.py $S
python3 pipeline/preflight/scdb-text/04-sample.py $S
python3 pipeline/preflight/scdb-text/05-oyez-and-search.py $S    # its search half is used; its Oyez half is superseded by 05b
python3 pipeline/preflight/scdb-text/05b-oyez-by-citation.py $S
python3 pipeline/preflight/scdb-text/06-cap-coverage.py $S
python3 pipeline/preflight/scdb-text/07-report.py $S
```

## 5. Divergences from the prompt

- **No syllabus** in CourtListener or CAP (prompt assumed one).
- **Rate limits** are far lower than the "~9.4k API calls" framing implies (125/day), so the API route is out; bulk is the plan.
- **Oyez licence** is BY-NC 4.0, **not** BY-NC-SA.
- **I did not measure CL opinion-text length for 2014–2025** and did not exercise a token, since none was provided and the 55 GB scan was out of scope.
- The first Oyez pass (`05`) looked cases up by term/docket and undercounted; `05b` replaces it, and `07-report.py` reads the `05b` output.
