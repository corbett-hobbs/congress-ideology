# Laws: methodology (draft)

Draft written in Session 1 (data layer). Sessions 2 (passage votes and support bands), 3 (major laws, party control, summaries) and 6 (finalise) extend it. Scope and page spec: `docs/CONGRESS_LAWS_SCOPE.md`; plan: `docs/CONGRESS_LAWS_EXECUTION_PLAN.md`; measured source behaviour: `docs/LAWS_PREFLIGHT.md`. Schemas: `lib/laws-entities.ts`; conventions: `docs/DATA_CONVENTIONS.md` section 15.

## What the data is

Every **public law** from the 93rd Congress (1973) on, one row per law. Private laws (individual relief; hundreds a Congress in the 1970s, none now) are excluded. Joint resolutions that became public laws are in. The unit is the **law**, not the bill: a bill that became two laws (99th H.J.Res. 738) is two rows.

## Sources

| Congresses | Source | Why |
| --- | --- | --- |
| 108th (2003) on | GovInfo **Bill Status** bulk XML, `pnpm fetch:billstatus` | No key; rebuilt daily for the open Congress; carries the same fields as the API |
| 93rd–107th (1973–2002) | **Congress.gov API**, `pnpm fetch:laws` | The only source before 2003 |
| 108th (overlap) | both | A validation overlap: the transform fails if they disagree on the law set, bill, policy area, sponsor, introduced date, signing date, origin chamber or recorded-vote references |

Pre-flight measured the two sources against each other for every law of the 108th and 118th (772 laws): identical on all of those fields.

Both fetchers write the same slimmed record per law (`pipeline/raw/govinfo-billstatus/<congress>.json`, `pipeline/raw/congress-gov/<congress>.json`, one law per line): bill, origin chamber, title, sponsor and cosponsor ids, policy area as the source names it, the enacted CRS summary as HTML, every `BecameLaw` date, and the actions that can carry passage, conference, concurrence, veto or enactment, with their recorded-vote references. Session 2 reads the actions; nothing is fetched twice.

## Rules

- **Slot = Congress**, taken from the law number (`118-90`), never from the date.
- **Signing date** = the earliest `BecameLaw` action. The list endpoint's `latestAction` is not used: in 0.8% of sampled laws something later happened to the bill.
- **A law may be dated up to 20 January after its Congress ends** (3.2% of sampled laws are signed in the first days of the next January). Later is a failure.
- **The signing president is derived, never stored**: from the date through `HISTORICAL_ADMINISTRATIONS` and `administrations.json`. "Signed most" for a Congress is the administration with the most signings; a tie goes to the later one; the split is kept for the tooltip.
- **Veto override**: the actions show a veto and a passage "over veto". (Line-item-veto notes are not overrides.)
- **Cosponsors** are current (not withdrawn) cosponsors, kept in `laws_cosponsors.json` so the list payload stays small.
- **Committees** come from each bill's committee list (Bill Status `committees`, API `/committees`): the committee, its subcommittees and the dated steps. Committee pages exist only for the current Congress, so a law's committee links work where the committee still exists under the same code; the rest show as plain names.
- **Sponsor** is the bill's sponsor, often the member whose vehicle carried the text, not its author.

## Policy areas and topic groups

CRS assigns one policy area per law. The source field holds more than CRS's 32 current areas: the retired label **"Commemorations"** (used up to about 2009) and a few subject terms older laws carry. We keep each law's area exactly as the source names it:

- the 32 current areas and "Commemorations" are the catalog (`pipeline/reference/law-policy-areas.json`);
- legacy subject terms and laws with no area are **"Not classified"** — never mapped to an area by us;
- a name in neither list stops the build.

Thirty-three areas are too many for the page, so the page shows **topic groups** (about ten, to match the rest of InsideGov). The grouping is one field (`group`) in the same reference file; changing it needs a `pnpm transform`, not a re-fetch. "Commemorations" is its own group so the drop after 2009 stays visible.

## Gates (the transform throws)

1. Law numbers run 1..N with none missing or repeated. (The list endpoint repeats rows and omits laws, so its own `count` is not trusted.)
2. N equals the independent count in `pipeline/reference/law-counts-independent.json` (Statutes at Large; GovInfo PLAW for 104+), where there is one. A Congress with no entry is in progress and is flagged partial.
3. Every law is dated 3 January of its first year to 20 January after the Congress ends.
4. Every policy-area name is a catalog area or a listed legacy term.
5. Counts add back to the list, per Congress.
6. Where both sources cover a Congress they agree.

Reported, not fatal: sponsors missing from `legislators.json`, laws with no sponsor, laws with several `BecameLaw` dates.

## Not yet in the data

Mayhew's major-law flag, party control back to 1973 and CRS summaries (Session 3).

## What the first full run found (Session 1)

12,619 public laws, 93rd–119th (the 119th has 119; law 119-120 is held out until Congress.gov records its enactment). Sources: Congress.gov API for the 93rd–107th, Bill Status for the 108th–119th; the 108th was fetched from both and agrees on all 498 laws across seven fields. Every finished Congress's laws are numbered 1..N and equal the independent count. Files: `laws.json` 4.2 MB, `laws_cosponsors.json` 3.0 MB, `laws_committees.json` 1.3 MB, `laws_counts.json` 47 KB (816 rows); raw `congress-gov/` 36 MB and `govinfo-billstatus/` 15 MB.

- **"Not classified" is a 1973–78 problem, and a bigger one than the pre-flight sample suggested.** 465 laws have no CRS area or a legacy subject term (160 distinct terms, listed in `law-policy-areas.json`): 164 of the 93rd's 651 (25%), 134 of the 94th's 588 (23%), 167 of the 95th's 633 (26%). From the 96th (1979) on every law has a current CRS area or "Commemorations". The pre-flight's sample of 40 per Congress had put it near 9%.
- **Source repairs.** Three Bill Status bills (110th S. 2499, 110th H.R. 6124, 109th H.R. 5441) also list the law under the wrong Congress; read as the bill's own. The API list repeated or omitted 22 laws in the 93rd–102nd (looked up by number). Ten 106th laws and two 99th laws carry two `BecameLaw` dates a day or two apart; the earliest is used.
- **Veto overrides:** 33 laws (93rd 5, 94th 8, 96th 2, 97th 2, 98th 2, 99th 2, 100th 3, 102nd 1, 104th 1, 105th 1, 110th 4, 114th 1, 116th 1). Each has a veto and an "over veto" passage. They have not been compared with the Senate Historical Office's list yet (Session 6). Line-item-veto notes on eleven 105th laws are correctly not counted.
- **Sponsors:** all 12,604 sponsor ids resolve in `legislators.json`; 15 laws have no sponsor in the source (96th 2, 97th 4, 98th 2, 99th 1, 100th 1, 101st 1, 108th 1, 109th 1, 110th 1, 111th 1, listed in `laws_report.json`).
- **Committees:** 12,150 laws carry at least one committee; 386 distinct committee and subcommittee ids, 156 of them with a page today. Of a decade's committee entries, the share that link to a page: 1970s 89%, 1980s 79%, 1990s 92%, 2000s–2020s 100%. The API maps old committees to their successors' codes (a 1979 Science and Technology bill carries `hssy00`), which is why the 1970s are not lower. Nine ids changed name over time; the most common name is kept.


## Passage votes and support bands (Session 2)

Each law carries its two chambers' final-passage votes (`house`, `senate`: `[kind, yea, nay, roll]`, kind 0 roll call / 1 voice / 2 unanimous consent / 3 method not stated) and a **band**: the yes share of the narrowest recorded final-passage vote in either chamber, yes ÷ (yes + no). Bands: 0 no recorded vote in either chamber, 1 under 60%, 2 60–75% (60.0% counts here), 3 75–90%, 4 90% and over. Display order is a UI constant. The counts file carries the five band counts per Congress and policy area. Minority-party support is v1.1.

**Rules.**
- A chamber's final passage is its newest `Passed/agreed to in <chamber>` or `Conference report agreed to in <chamber>` action, or a concurrence or recession recorded under "Resolving differences", or, where only the chamber's own feed has the line (much of 1987–88), its `House Agreed to Senate Amendments…` / `Senate concurred…` text. On a day with two such lines, the one that records a roll call wins. A chamber's last action is taken even when it was a step back to the other chamber; the closest vote over both chambers is what the band uses.
- **Method.** Wording that names a voice vote or consent decides it. Otherwise it is a roll call if the action carries a roll-call reference (or an identically worded twin does), cites a roll number or a yea-nay count. Anything else says nothing about the method ("Measure passed House." in the 1970s) and is read as no recorded vote: in 21,000 non-roll passages Voteview holds a roll call on the same bill, chamber and day for only 122 (0.6%; sample in `laws_report.json`).
- **Tally source.** The action text's tally is primary (it is current for every law). Voteview's `yea_count` / `nay_count` are the check, and fill in the few roll calls whose text has no count (12 of 3,884). Voteview trails the live feed, so `rollcalls_manifest.json` records its last date per chamber and a newer vote is simply not checked (none today: it runs to 2026-09-30).
- **The check.** Exact where the two agree (3,782 of 3,845 compared); *minor* when they differ by at most 2 votes and the band is the same (55); anything else stops the build if the match was by the clerk's roll number, and is reported as *unverified* if it was only by date and bill (6), because on a day with several votes on one bill the date match can land on the wrong vote. A tally above the chamber's seats (441 House, 101 Senate) also stops the build. Two tallies were decided by hand in `pipeline/reference/law-vote-exceptions.json`: 104-229 (the clerk's roll 223 says 339–4 as the text does; Voteview has 345–4) and 95-511 (the text's 266–176 exceeds the House; Voteview's 226–176 is used). A Vice President's tie-break counts the official result (51–50 for 119-21 and five others; Voteview has 50–50, a one-vote difference that leaves the band alone).
- **Override votes** are kept in `override_votes` and do not set the band: the band answers how broadly a bill was supported when Congress passed it, and an override is by definition at least two thirds. Every one of the 33 override laws has both override tallies, which also confirms the override detector.
- **Decade rows** below are binned by the year a Congress opens, so "1970s" is the 93rd–96th (1973–80).

| Decade | chamber passages | roll calls | voice | consent | not stated | tally from text | tally from Voteview | exact | within 2 votes | disagree by date match | no Voteview match | exceptions |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1970s | 4970 | 798 | 0 | 0 | 4172 | 797 | 1 | 758 | 21 | 3 | 15 | 1 |
| 1980s | 6246 | 520 | 4957 | 689 | 80 | 520 | 0 | 486 | 21 | 3 | 10 | 0 |
| 1990s | 4724 | 654 | 2228 | 1810 | 32 | 652 | 2 | 643 | 5 | 0 | 5 | 1 |
| 2000s | 4400 | 835 | 1271 | 2277 | 17 | 829 | 6 | 826 | 3 | 0 | 6 | 0 |
| 2010s | 3388 | 659 | 1131 | 1584 | 14 | 656 | 3 | 653 | 3 | 0 | 3 | 0 |
| 2020s | 1510 | 418 | 470 | 585 | 37 | 418 | 0 | 416 | 2 | 0 | 0 | 0 |

**Share of laws in each band, by Congress** (the support card's data; the 119th is partial):

| Congress | laws | No recorded vote | Under 60% | 60–75% | 75–90% | 90%+ |
|---|---|---|---|---|---|---|
| 93 | 651 | 75% | 2% | 3% | 6% | 15% |
| 94 | 588 | 68% | 3% | 5% | 8% | 16% |
| 95 | 633 | 72% | 3% | 5% | 5% | 15% |
| 96 | 613 | 79% | 3% | 4% | 5% | 8% |
| 97 | 473 | 82% | 3% | 2% | 4% | 9% |
| 98 | 623 | 87% | 1% | 3% | 3% | 7% |
| 99 | 664 | 89% | 1% | 3% | 2% | 5% |
| 100 | 713 | 84% | 1% | 3% | 3% | 10% |
| 101 | 650 | 88% | 1% | 2% | 2% | 6% |
| 102 | 590 | 86% | 1% | 3% | 4% | 6% |
| 103 | 465 | 79% | 3% | 5% | 4% | 9% |
| 104 | 333 | 74% | 1% | 4% | 5% | 15% |
| 105 | 394 | 77% | 1% | 2% | 4% | 16% |
| 106 | 580 | 74% | 1% | 1% | 4% | 21% |
| 107 | 377 | 66% | 1% | 2% | 3% | 28% |
| 108 | 498 | 71% | 1% | 2% | 2% | 23% |
| 109 | 482 | 75% | 2% | 3% | 2% | 18% |
| 110 | 460 | 71% | 0% | 3% | 4% | 21% |
| 111 | 383 | 58% | 5% | 6% | 3% | 27% |
| 112 | 283 | 59% | 1% | 8% | 3% | 30% |
| 113 | 296 | 62% | 1% | 4% | 3% | 29% |
| 114 | 329 | 75% | 0% | 3% | 2% | 20% |
| 115 | 442 | 66% | 5% | 2% | 3% | 25% |
| 116 | 344 | 81% | 0% | 2% | 4% | 12% |
| 117 | 362 | 48% | 5% | 2% | 9% | 35% |
| 118 | 274 | 70% | 1% | 2% | 4% | 23% |
| 119 | 119 | 49% | 24% | 5% | 4% | 18% |

Reading it: before 2000 about four laws in five show as "No recorded vote" (68–89%); from the 107th on it is 48–81%, and the share of laws with a recorded vote above 90% yes grows from about a tenth to a quarter. Checked against well-known votes in the tests: Affordable Care Act (House 219–212, Senate 60–39), Tax Reform Act of 1986 (292–136, 74–23), USA PATRIOT Act (357–66, 98–1), Inflation Reduction Act (220–207, 51–50) and the War Powers Resolution (override votes 284–135 and 75–18).
