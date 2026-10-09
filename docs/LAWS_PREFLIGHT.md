# Congress → Laws: pre-flight findings

Session 0 of `docs/CONGRESS_LAWS_EXECUTION_PLAN.md`. Run 2026-10-08. Read-only: nothing in app code, `pipeline/output/` or `pipeline/raw/` (committed parts) changed. Scratch scripts are in `pipeline/preflight/laws/` (`01`–`10`, plus `lib.mjs`); every raw response is cached in the gitignored `pipeline/raw/_scratch/laws/`, so a re-run costs no API calls.

## Bottom line

| Question | Answer |
| --- | --- |
| Is the Congress.gov law list complete? | **Not as a list.** Its `count` is right, but 22 laws in 93rd–102nd are missing from the list pages and 25 rows are duplicates standing in for them. Every missing law resolves through `/law/{c}/pub/{n}`. The anchors hold: 93rd = 651, 118th = 274. |
| Is 1973 a safe start? | **Yes for the data** (sponsor, enactment date and summary are 100% in the sample, policy area 98–100%). **No for the topic vocabulary:** the `policyArea` field holds 44 distinct values, not 32 (§2). |
| Bulk or API? | They agree on all 772 laws of the 108th and 118th. Bulk is the better source from the 108th (daily-refreshed for the 119th, no key). The API is the only source before 2003. |
| Can the support card start in 1973? | The parse and join work from the 93rd (§4). What is thin is **how many laws have a recorded vote at all**: 19% of 1970s laws, 17% in the 1980s, 18% in the 1990s, 34%, 29%, 50% after. |
| Back-fill cost | 93rd–107th by API: about 25–32k calls, **1.3–1.6 hours** at the 20,000-an-hour limit. The whole 93rd–119th by API: 1.9–2.4 hours. |

Decisions for you are at the end (§9).

## 1. Counts (plan item 1)

The API's earliest Congress with public laws is the **82nd** (594 laws); 80th and 81st return 0. The structured fields start much later (§2).

`/law/{c}/pub` `pagination.count` equals the number of list **rows**, not the number of laws:

| Congress | API list rows | duplicate rows | laws missing from the list, found by number | laws (numbers 1..N) | private laws | Statutes granules, class `PUBLICLAW` | GovInfo `PLAW` packages |
|---|---|---|---|---|---|---|---|
| 93 | 651 | 3 | 3 | 651 | 123 | 649 | – |
| 94 | 588 | 0 | 0 | 588 | 141 | 591 | – |
| 95 | 633 | 1 | 1 | 633 | 170 | 633 | – |
| 96 | 613 | 7 | 7 | 613 | 123 | 613 | – |
| 97 | 473 | 0 | 0 | 473 | 56 | 473 | – |
| 98 | 623 | 1 | 1 | 623 | 54 | 623 | – |
| 99 | 666 | 4 | 1 | 664 | 24 | 664 | – |
| 100 | 713 | 1 | 1 | 713 | 48 | 713 | – |
| 101 | 650 | 3 | 3 | 650 | 16 | 650 | – |
| 102 | 590 | 5 | 5 | 590 | 20 | 590 | – |
| 103 | 465 | 0 | 0 | 465 | 8 | 465 | – |
| 104 | 333 | 0 | 0 | 333 | 4 | 333 | 333 |
| 105 | 394 | 0 | 0 | 394 | 10 | 394 | 394 |
| 106–107 | 580 · 377 | 0 | 0 | 580 · 377 | 24 · 6 | 580 · 377 | – |
| 108 | 498 | 0 | 0 | 498 | 6 | 498 | 498 |
| 109–117 | 482 · 460 · 383 · 283 · 296 · 329 · 442 · 344 · 362 | 0 | 0 | same | 1 · 0 · 2 · 1 · 0 · 0 · 1 · 0 · 3 | same | – |
| 118 | 274 | 0 | 0 | 274 | 0 | 274 | 274 |
| 119 (partial) | 120 | 0 | 0 | 120 | 2 | – | 118 |

- **Duplicate rows:** the list shows the same bill twice (S.J.Res. 262 as 93-581 twice, and so on) in place of a law that belongs in the slot. `/law/95/pub/135` returns S.J.Res. 89 although the list never shows it. All 22 gaps (93: 317, 401, 553; 95: 135; 96: 7; 98: 162; 99: 220; 100: 302; 101: 3; 102: 5) resolve; none returned 404. H.J.Res. 738 appears four times in the 99th and carries two laws (99-500 and 99-591), so 666 rows make 664 laws.
- **Consequence for Session 1:** the planned gate "per-Congress count equals the source's own `count`" would pass with 22 laws missing. Replace it with: law numbers form 1..N with no gaps, N equals the independent count, and each law number appears once.
- **Total:** 12,618 public laws, 93rd–119th (119th partial, 120 so far).
- **Independent tally:** GovInfo `PLAW` (104th on) matches the API exactly for 104, 105, 108 and 118. The 119th is 118 there against 120 in the API, which is publishing lag. Statutes at Large (volumes 87–138, granule class `PUBLICLAW`) matches the law count in 24 of 27 Congresses. The three differences are explained by numbering: for 93, 94 and 99 I fetched every granule's printed citation, and the numbers are 1..651, 1..588 and 1..664, the same as the API's. Volumes 89–90 print 93-650 and 93-651, plus three stray older-Congress laws, which is why the plain tally says 649 for the 93rd and 591 for the 94th. Private laws also match the Statutes tally (e.g. 123 in the 93rd).
- Spot checks on `/law/{c}/pub/{n}` for the gaps agree with the Statutes citations.

## 2. Field fill rates, 93rd–119th (plan item 2)

40 laws per Congress, drawn at random with a fixed seed from numbers 1..N (1,080 laws). Full calls: bill detail, all action pages, summaries.

| Congress | n | policy area | sponsor `bioguideId` | sponsor in legislators files | summary ≥ 40 chars | `Became Public Law` action | list `latestAction` date = signing date |
|---|---|---|---|---|---|---|---|
| 93 | 40 | 98% | 100% | 100% | 100% | 100% | 100% |
| 94 | 40 | 98% | 100% | 100% | 100% | 100% | 100% |
| 95 | 40 | 98% | 100% | 100% | 100% | 100% | 100% |
| 96–119 | 40 each | 100% | 100% | 100% | 100% | 100% | 98–100% |

By decade: policy area 1970s 98%, everything else 100%. The three laws with no policy area are S. 634 (93rd), H.R. 13585 (94th) and H.R. 9378 (95th). With 3 of 120, the true rate for 93rd–95th is somewhere between about 1% and 7%; Session 1 reports the exact count.

**The policy-area vocabulary is not the 32-term list.** The 1,077 labelled laws carry **44 distinct names**:

- 32 are CRS's current policy areas. The catalog is the 32 listed in the scope doc and all appear.
- **"Commemorations" (91 laws, 8.5% of the sample)** is a 33rd label. It is not in CRS's current list. Counts by decade: 1970s 5, 1980s 25, 1990s 12, 2000s 49, **2010s 0, 2020s 0**. In full bulk data it is **129 of 498 laws (26%) in the 108th and 0 of 274 in the 118th**. It would rank joint third by total in this sample, so it would enter the "six biggest" and its disappearance would draw as a trend.
- **11 legacy subject terms (14 laws, all 1970s, 8.8% of 160):** Public works (2), Independent regulatory commissions (2), Indian lands (2), and one each of Recreation areas, Disaster relief, Awards medals prizes, Pest control, Libraries, International agencies, Government securities, Noise.

Sponsor ids: all 1,080 sponsors resolve in `legislators-current.yaml` + `legislators-historical.yaml` (12,770 `bioguide` ids; item 7 done). Every sampled law has a sponsor.

Summaries exist for 100%, but the text differs by era. The 2000s on use CRS's `<strong>Title</strong><p>This act…` format; before that, text starts with a bracketed stage such as "(Measure passed Senate, amended) Directs…" or a truncated "(Reported to House from the Committee on Armed Services with amendment, H." A crude first-sentence rule (strip the bold title, take to the first full stop, keep 40–300 characters) gives a usable sentence for 68% of 1970s, 71% of 1980s, 56% of 1990s, 88% of 2000s, 82% of 2010s and 82% of 2020s laws. That is a floor, not the Session 3 number: the stage prefix and the "H." truncation both need handling.

## 3. Signing date (plan item 3)

- The list's `latestAction.actionDate` differs from the `BecameLaw` action date for **9 of 1,080** laws (0.8%), by 3–279 days. In every case something later happened to the bill (a hearing printed, a "see also" note). **Use the `BecameLaw` action, never `latestAction`.**
- One law has two `BecameLaw` dates (106th H.R. 3639: 2000-06-20 and 06-21). Rule needed: take the earliest, which is the signing, and list it in the report.
- **35 of 1,080 laws (3.2%) are signed after the next Congress has started**, between 1 and 11 days after January 3 (97th: 1983-01-12; 111th: 2011-01-04; 116th: 2021-01-05; 118th: 2025-01-04 to 01-06, eleven of the 40 sampled). The plan's gate "every law has a date inside its Congress" would fail the build on these. The Congress comes from the law number; the gate should allow dates up to the 20th of the following January and flag only later ones. The signing president must come from the date, so a law signed 2021-01-05 is Trump's even though it belongs to the 116th.
- Veto overrides: in this sample only one law is a true regular override (104th H.R. 1058: House override 12-20, Senate override 12-22; `BecameLaw` is dated 12-22, the override). The action type is `Veto` and the text reads "Passed … over veto". One other law (105th H.R. 2378) carries a "line item veto" note, which is not an override. One example is not enough to fix the rule; Session 1 should search the 93rd–119th details for `Veto`-type actions rather than sampling.

## 4. Passage votes (plan item 4)

Method: for each of the 1,080 laws, take the newest `Passed/agreed to in House|Senate` or `Conference report agreed to in …` action from the Library of Congress source (code 9) per chamber as the chamber's final passage. Vote kind comes from `recordedVotes` on the action (or its House/Senate twin on the same date) and from the text. Joined to Voteview's `HSall_rollcalls.csv` (29.8 MB, fetched to scratch). **Voteview does have `yea_count` and `nay_count`** (populated on every row from the 93rd on); no need to derive them from the member-votes file.

Every sampled law had a final-passage action found in both chambers (1,080 of 1,080, 2,160 events).

| Decade | laws | roll-call events | voice | unanimous consent / without objection | method not stated | roll events joined to Voteview | tally = action text where both exist |
|---|---|---|---|---|---|---|---|
| 1970s | 160 | 34 | 0 | 0 | 286 | 32 (94%) | 29 of 30 |
| 1980s | 200 | 37 | 313 | 42 | 8 | 35 (95%) | 31 of 31 |
| 1990s | 200 | 51 | 188 | 157 | 4 | 51 (100%) | 49 of 49 |
| 2000s | 200 | 79 | 119 | 202 | 0 | 79 (100%) | 78 of 78 |
| 2010s | 200 | 70 | 137 | 191 | 2 | 70 (100%) | 68 of 68 |
| 2020s (to date) | 120 | 79 | 71 | 86 | 4 | 79 (100%) | 77 of 78 |

- **The 1970s say "Measure passed House." and nothing else** for non-roll votes, so voice and consent cannot be told apart there (286 events). That does not matter for the band: the question is whether a recorded vote exists. A check shows it can be read as "none": for 1,810 events with no roll number cited, Voteview holds a vote on the same bill, chamber and day (±1 day) in only **12** (0.7%).
- **Join method:** from the 1990s on the API gives session and clerk roll number and Voteview carries `session` and `clerk_rollnumber`, so the join is exact (all 279 roll events of the 1990s–2020s joined by clerk number). For the 93rd–101st Voteview has no clerk number (blank in 1970s, partly in the 1980s), and its `rollnumber` runs across both sessions, so the join is by chamber + date (±1 day) + bill number, falling back to the action-text tally. A session-offset join was tried and gave wrong matches (13 tally disagreements), so it is only accepted when the tally agrees.
- **4 roll events did not join**: all are motions on amendments (House "disagreed to"/"receded and concurred"), not final passage by the plan's definition. With Voteview's bill numbers they match several votes the same day. Rule for Session 2: a chamber's final passage is its last passage, conference-report or concurrence action; amendment motions that are not the last action do not count.
- **Two tally disagreements:** 93-527 (action text 357–1, Voteview 356–1) and 119-21, the 2025 reconciliation law (Senate 51–50 in the text with the Vice President's tie-break, Voteview 50–50). **Decision (2026-10-08): the action-text tally is the source of the band and Voteview is the cross-check.** Voteview's roll-call file trails the live feed (it held 119th-Congress votes to 2026-09-30 when fetched, but is a hand-maintained academic file), while the action text is current for every law. The text carries a tally for 334 of 350 roll events (95%) and agrees with Voteview in 332 of the 334 where both exist (99.4%). Where the text has a roll number but no tally, read the official roll-call XML linked from `recordedVotes`. A Vice President tie-break counts the official result, so 119-21 reads 51–50 (50.5% yes).
- **Event mix** (all 2,160 events): suspension-of-the-rules 517 (24%, none before the 1980s), concurrence/receded 300 (14%), conference report 140 (6.5%), "disagreed" 7. All are handled by the same rule; the roll-call ones all joined.

**Share of laws by how many chambers have a recorded vote:**

| Decade | laws | both chambers | one chamber | none (band 0) | of the recorded: ≥90% yes | 75–90% | 60–75% | <60% |
|---|---|---|---|---|---|---|---|---|
| 1970s | 160 | 3 | 28 | 129 (81%) | 19 | 5 | 4 | 2 |
| 1980s | 200 | 4 | 29 | 167 (84%) | 20 | 3 | 3 | 5 |
| 1990s | 200 | 16 | 19 | 165 (83%) | 21 | 5 | 4 | 5 |
| 2000s | 200 | 12 | 55 | 133 (67%) | 50 | 4 | 8 | 5 |
| 2010s | 200 | 13 | 44 | 143 (72%) | 45 | 3 | 4 | 5 |
| 2020s | 120 | 19 | 41 | 60 (50%) | 37 | 7 | 3 | 13 |

(Bands use the closest recorded vote per law, yes ÷ votes cast, from the action-text tally.) With 31, 33, 35, 67, 57 and 60 laws in the four upper bands per decade, the sample is thin for a per-Congress share, but the pattern is stable: **before 2000, four laws in five show as "No recorded vote".**

## 5. Bulk versus API (plan item 5)

**GovInfo Bill Status** (`/bulkdata/BILLSTATUS`): 108th–119th, one ZIP per bill type, **one XML per bill inside**. Eight types; hconres, hres, sconres and sres cannot become public law, so four matter. Sizes from HEAD requests (nothing was downloaded to get them):

| | hr | s | hjres | sjres | four types |
|---|---|---|---|---|---|
| 108th | 21.9 MB | 10.3 | 0.6 | 0.1 | 33.0 MB |
| 118th | 35.5 MB | 14.4 | 0.8 | 0.3 | 51.1 MB |
| 108th–119th, all | | | | | **494 MB** (all eight types: 0.58 GB) |

Downloaded with your approval into the gitignored scratch folder: `BILLSTATUS-{108,118}-{hr,s,hjres,sjres}.zip` (84 MB). Public-law bills in them: 108th 330 + 140 + 22 + 6 = **498**; 118th 178 + 91 + 5 + 0 = **274**, exactly the API counts.

**What the XML carries** (checked on all 772 laws): policy area, sponsor `bioguideId`, cosponsors, `laws` with the public law number, summaries (every CRS version), all actions with `type` and `actionDate`, `recordedVotes` per action (chamber, roll number, date), `latestAction`. An average law is 59.5 KB of XML (8.3 KB gzipped); the 4,273 laws of the 108th–119th would be about 254 MB raw, 36 MB gzipped, but the fields the transform reads are about 0.8 KB a law (about 10 MB for the whole range with 400-character summary text).

**Agreement with the API, 108th and 118th, all 772 laws** (detail call per law, 772 calls):

| Check | Result |
|---|---|
| Same set of laws and same bill under each law number | 498 of 498, 274 of 274 |
| Policy area | identical in 772 of 772 |
| Sponsor `bioguideId` | identical in 772 of 772 (one 108th law has no sponsor in either source) |
| `latestAction` date | identical in 772 of 772 |
| `BecameLaw` action date (80 sampled laws) | identical in 80 of 80 |
| Recorded-vote references (same 80 laws) | 70 in both |
| Cosponsor count | differs for 5 (3 in the 108th, 2 in the 118th) |
| Action count | differs for 2 in the 118th |

The last two come from snapshot dates: the 118th ZIPs were last modified 2026-05-15 and have not moved since; the API is live. **Freshness:** the 119th ZIPs were rebuilt today (hr, s: 2026-10-08 20:42 UTC; hjres, sjres: 2026-10-06), so the open Congress comes from bulk, no key needed, with the API only as the gap-filler for laws newer than the last build.

**Where each is better.** Bulk: no key, no rate limit, one file per bill type, the Congress's last build is reproducible, the in-progress Congress is refreshed daily. API: the only route before 2003; per-number lookup repairs list gaps; cosponsors and actions are paginated calls. For 2003 onward they agree to the field, so the choice is operational, not about quality. Using the API throughout is possible (1.9 hours, §6) and would give one parser; bulk saves about 4,300 laws × 3 calls, roughly 40 minutes, and the key in CI.

**Any bulk source for 1973–2002?** None found. GovInfo's Bill Status starts at the 108th (the folder listing offers 108–119). `unitedstates/congress` is the scraper of the retired THOMAS site and ships code, not data (its README says the data is generated into a local `data` directory); I could not find a published archive of its output, and `govtrack.us/data/congress/` returns 404. GovInfo `PLAW` (public-law text) starts at the 104th, and its `STATUTE` collection (Statutes at Large) covers the earlier years only as law text and citations, not as bill status. So 1973–2002 must come from the API.

**Accidental download, deleted:** while checking freshness I ran a `curl` that fetched `BILLSTATUS-119-hr.zip` (32.5 MB) to `/tmp` instead of only reading its headers. That was outside what you approved. I deleted it at once; nothing from it was read, and it was never in the repo.

## 6. Request cost (plan item 6)

- Key works; response headers carry `x-ratelimit-limit: 20000` (per hour; the shared demo key was far lower).
- Measured over the sample: 3,201 calls for 1,080 laws plus the 27 list fetches = **3.0 calls a law** (detail, actions, summaries). Actions needed a second page for 1 law in 1,080 (260 actions). Cosponsors are a fourth call for the 80% of laws that have any (858 of 1,080; 14 need two pages).
- Measured speed: 3,201 calls in 7 min 46 s with 5 workers = 6.9 calls a second, 0.72 s a call, **no 429 or 5xx seen**. That is above the hourly limit (5.5 a second), so a back-fill must pace itself at 20,000 an hour.

| Plan | Laws | Calls (3 / law) | Calls (with cosponsors, 3.8 / law) | Hours at 20,000/h |
|---|---|---|---|---|
| API for 93rd–107th, bulk after | 8,347 | 25.0k | 31.7k | **1.3 – 1.6** |
| API for 93rd–119th | 12,618 | 37.9k | 47.9k | 1.9 – 2.4 |
| Weekly refresh | a handful of laws | < 100 | | seconds |

Add 15 list pages and the gap lookups (22). Resumable and incremental on `updateDate`, as planned. Raw API size: the sample's 4,085 cached responses are 37 MB.

## 7. Legislators coverage (plan item 7)

All 1,080 sampled sponsors are in `legislators-current.yaml` + `legislators-historical.yaml` (12,770 `bioguide` ids). For the 108th and 118th the bulk and API sponsor ids agree for all 772. One 108th law has no sponsor at all (both sources).

## 8. Mayhew (plan item 8)

Source page: `campuspress.yale.edu/davidmayhew/datasets-divided-we-govern/`. The 2023–2024 list is still the latest (file dated April 2026; the document is signed "David R. Mayhew, 1/6/25").

| File | Years | Format |
|---|---|---|
| Table 4.1 of *Divided We Govern* | 1947–1990 | .docx |
| Updates | 1991–2002 | .doc |
| | 2003–04, 2005–06, 2007–08, 2009–10 | .doc ×4 |
| | 2011–12, 2015–16 | .docx |
| | 2013–14, 2017–18, 2019–20, 2021–22 | .pdf ×4 |
| | 2023–24 | .docx |
| Arnold & Wood compilation | 1991–2014 | .pdf |
| (also) | 1921–1931 | .docx |

Measured on the two files I could read (they reached disk through the web-fetch tool, 24 KB and 48 KB, outside the repo; I did not download the others):

- **1973–1990: 104 entries over nine Congresses** (93rd 22, 94th 14, 95th 12, 96th 10, 97th 9, 98th 7, 99th 9, 100th 12, 101st 9; the 97th count may be one short, a multi-line entry). Each has a name or description, usually a year, a `*`/`#` marker for his two sweeps, CAPS for "historically important". **No Public Law numbers.** Entries such as "Social Security increase. Two-step 11% hike. 1973." or "Trans-Alaskan pipeline authorized. 1973." name no law, and some are parts of larger laws (the file itself says so).
- **2023–2024: 8 entries, all in 2024**, none for 2023. Four (Ukraine, Israel, Taiwan aid, TikTok ban) were one bill (H.R. 815, P.L. 118-50), so the 118th has 8 entries for 5 laws (disaster and farm aid are inside one continuing resolution). Entries carry a month, no number. He notes that he lists items "that seem to stand out", based on media coverage.
- **Join effort:** since Public Law numbers are never given, the plan's "by Pub. L. number where given, else title + year" is title + year in every case, and many entries need a person to pick the law (and to split or merge). 1991–2022 not counted; extrapolating from 1973–90 (11.6 a Congress), the whole 1973–2024 range is roughly 300 entries. That is an estimate; the real count needs the other files read. Plan for a hand-built `mayhew-major-laws.json` with a law id per entry, and expect the 97%-join bar to be met only after manual matching.
- Licence: none stated on the page; credit and cite.

## 9. Decisions

**Settled 2026-10-08:** (0) bulk from the 108th, API before; (a) 1973 stays the start; (b) the support card starts at the 93rd with the pre-2000 share stated; (c) "Commemorations" kept as its own area, legacy and missing in "Not classified" (34 dropdown entries); (d) the rule changes below, with the tally from the action text (§4). Recorded in the plan's settled decisions. The text below is the reasoning as put to the decision.

**(0) Source split.** Recommend what the plan assumed: **bulk from the 108th, API for 93rd–107th**, with API-by-number repair and a gate that checks law numbers 1..N. The two sources agree on all 772 laws checked, so the single-parser case for the API throughout (1.9–2.4 hours, no 494 MB download) is real too; choose bulk if the open Congress should refresh without a key.

**(a) Is 1973 still the start?** Yes on completeness and fields. The cost is vocabulary (below), not coverage.

**(b) Where the support card starts.** Parsing and the Voteview join hold from the 93rd (94% of 1970s roll events, 100% from 1990), so there is no technical reason to start later. The reason would be that **81–84% of laws before 2000 would sit in "No recorded vote"**. Options: start at the 93rd and let the band tell that story (honest, but the card is mostly one colour for 27 years); or start the card at the 106th (2000–), where recorded-vote laws reach about a third and the other bands have counts to read. I recommend the first, with the Data note giving the pre-2000 share, because no later start removes the effect and 1973–99 is itself a finding.

**(c) "Not classified" series.** Yes, one is needed, and it is a bigger decision than the plan expected:
1. **"Commemorations" is a CRS label for 1973–2009** (26% of the 108th's laws, none since). Choices: keep it as a 33rd area in the dropdown and catalog (faithful to the source; it then enters the six biggest and the stack shows a visible step down around 2010), or fold it into "Other areas" (cleaner chart, hides a quarter of 2000s laws).
2. **11 legacy subject terms (≈9% of 1970s laws)** and the unlabelled laws (≈2.5% of the 93rd–95th, to be counted in Session 1): show as "Not classified". Mapping them to the 32 areas would be a judgement of ours, so I would not do it in v1.
3. Say in the Data notes that CRS assigned some policy areas retroactively.
My recommendation: keep "Commemorations" as its own listed area and put the legacy and missing ones in "Not classified". The dropdown then has 34 entries, and the plan's "32" and "Other areas (26)" need to change.

**(d) Smaller rule changes to approve for Session 1:** the count gate becomes law numbers 1..N, not `count`; the date gate allows signing up to the 20th of the next January; signing date is the earliest `BecameLaw` action; the support tally comes from the action text, with Voteview as the cross-check (decided; see §4); Mayhew matching is manual by title and year (no Pub. L. numbers).

## What was fetched

| What | Size | Where |
|---|---|---|
| Congress.gov API responses (about 4,100) | 37 MB | `pipeline/raw/_scratch/laws/api/` (gitignored) |
| Voteview `HSall_rollcalls.csv` | 29.8 MB | `pipeline/raw/_scratch/laws/voteview/` |
| GovInfo Bill Status ZIPs, 108th and 118th, hr/s/hjres/sjres | 84 MB | `pipeline/raw/_scratch/laws/bulk/` (approved) |
| GovInfo Statutes granule summaries, 93rd/94th/99th | about 1,900 small calls | `pipeline/raw/_scratch/laws/gran/` |
| Mayhew 1947–1990 and 2023–2024 .docx | 48 KB, 24 KB | via the web-fetch tool, outside the repo |

Nothing under `pipeline/raw/` (committed) or `pipeline/output/` changed.
