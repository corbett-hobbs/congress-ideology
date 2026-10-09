# Laws: methodology

Draft wrHow the Congress Laws page (`/congress/laws`) is built and what its numbers mean. Written across Sessions 1–6. Scope and page spec: `docs/CONGRESS_LAWS_SCOPE.md` (its settled items are repeated below); plan: `docs/CONGRESS_LAWS_EXECUTION_PLAN.md`; measured source behaviour: `docs/LAWS_PREFLIGHT.md`. Schemas: `lib/laws-entities.ts`; conventions: `docs/DATA_CONVENTIONS.md` section 15; the page's own conventions: `ARCHITECTURE_MAP.md` "Laws page".t the data is

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


## What the first full run found (Session 1)

12,619 public laws, 93rd–119th (the 119th has 119; law 119-120 is held out until Congress.gov records its enactment). Sources: Congress.gov API for the 93rd–107th, Bill Status for the 108th–119th; the 108th was fetched from both and agrees on all 498 laws across seven fields. Every finished Congress's laws are numbered 1..N and equal the independent count. Files: `laws.json` 4.2 MB, `laws_cosponsors.json` 3.0 MB, `laws_committees.json` 1.3 MB, `laws_counts.json` 47 KB (816 rows); raw `congress-gov/` 36 MB and `govinfo-billstatus/` 15 MB.

- **"Not classified" is a 1973–78 problem, and a bigger one than the pre-flight sample suggested.** 465 laws have no CRS area or a legacy subject term (160 distinct terms, listed in `law-policy-areas.json`): 164 of the 93rd's 651 (25%), 134 of the 94th's 588 (23%), 167 of the 95th's 633 (26%). From the 96th (1979) on every law has a current CRS area or "Commemorations". The pre-flight's sample of 40 per Congress had put it near 9%.
- **Source repairs.** Three Bill Status bills (110th S. 2499, 110th H.R. 6124, 109th H.R. 5441) also list the law under the wrong Congress; read as the bill's own. The API list repeated or omitted 22 laws in the 93rd–102nd (looked up by number). Ten 106th laws and two 99th laws carry two `BecameLaw` dates a day or two apart; the earliest is used.
- **Veto overrides:** 33 laws (93rd 5, 94th 8, 96th 2, 97th 2, 98th 2, 99th 2, 100th 3, 102nd 1, 104th 1, 105th 1, 110th 4, 114th 1, 116th 1). Each has a veto and an "over veto" passage. Checked in Session 6 against the Senate Historical Office's vetoes table (https://www.senate.gov/legislative/vetoes/vetoCounts.htm, read 2026-10-08): overrides by signing president from Ford on are identical (Ford 12, Carter 2, Reagan 9, Bush 41 1, Clinton 2, Bush 43 4, Obama 1, Trump 1, Biden 0), and Nixon's one in range is the War Powers Resolution (his other six are before 1973). Line-item-veto notes on eleven 105th laws are correctly not counted.
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


## Major laws, party control and summaries (Session 3)

**Major laws** are David Mayhew's. His lists of "important enactments" cover every Congress up to the 118th, from *Divided We Govern* (Table 4.1, 1947–90) and his updates for the 102nd on; the 119th has none yet. He judges importance from newspaper and magazine "wrapups" at the close of each session (and, for 1947–90, also from retrospective policy studies); he excludes debt-ceiling hikes, routine appropriations and short renewals unless they contain something new. We read 300 entries for the 93rd–118th, matched by hand to the laws they name (`pipeline/reference/mayhew-major-laws.json`).
- **Matching.** His entries give a title and a year or month and never a law number, so every match was made by reading the entry and the law's title and summary. 294 entries name public laws and all 294 are matched (the plan's bar was 97%). Six name a treaty ratified by the Senate (the Panama Canal treaties, INF, START, the Chemical Weapons Convention, NATO expansion, New START) and no public law, so they are listed and not counted. The check that each named law exists in the entry's own Congress runs on every build.
- **Provisions.** 37 entries name a provision or division of a larger law (the 1994 crime act inside the 1984 appropriations resolution, the Affordable Care Act's student-loan overhaul inside the reconciliation act, the TikTok provision inside H.R. 815). The whole law counts as major and the entry is marked a provision (`laws_major.json`). Thirteen laws are named by more than one entry (the 1990 and 1993 budget acts, the Tax Cuts and Jobs Act and others); 307 laws are major in all.
- **Several laws, one entry.** The National Energy Act of 1978 (five laws), the sixteen Congressional Review Act repeals of 2017–18 (Mayhew counts them as one "law"), the 2008 farm bill (enacted twice over a veto), the Sandy aid installments, the Ukraine installments and the 2020 omnibus pair each map to several laws.
- **Three states.** A law is *major*, *not major*, or *not yet assessed* (`major: null`) when its Congress has no list. The 119th reads "not yet assessed" and its major count is never shown as zero.
- **What the flag is not.** It is Mayhew's reading of contemporary coverage, not ours and not a ranking; entries in capitals (`capitals`, 38 of 300) are the ones he judged especially important; his Table 4.1 `*` and `#` marks (newspaper wrapups and retrospective studies) are kept.
- **Not a rule for recent Congresses.** Whether a provisional flag for the 119th is possible is decided separately, by a back-test against his lists (Session 3b).

**Party control** (`pipeline/reference/congress-control.json`) now starts on 3 January 1973, so the Laws page can show who held the House and Senate. House: Democrats throughout the 93rd–103rd. Senate: Democrats 1973–81, Republicans 1981–87, Democrats 1987–95, then the table that already ran from 1991 (including the 107th Congress's two mid-Congress changes of 2001). No majority changed hands mid-Congress between 1973 and 1991. The Economy and Trade charts clip the table to their own 1991-based axis and draw exactly what they drew before.

**Summaries.** `summary` on each law is the first sentence of the CRS summary of the enacted version (else the latest), with the law's name, the "(Measure passed House, amended)" stage note and the "Title I:" or "=Title I=" heading cut off, "This act designates ..." turned into "Designates ...", kept only if it is one finished sentence of 40–300 characters; otherwise the law has none. It is never model-written. The source summaries come in three styles (1970s–90s "Act name - Amends ...", 2000s "(This measure has not been amended ...)", 2010s on "<strong>Title</strong> This act ..."). A summary that opens with a table of contents, or whose first sentence is longer than 300 characters (an omnibus act's first sentence is usually a list), gets none. Fill by decade (decades bin by the year a Congress opens): 1970s 77%, 1980s 84%, 1990s 65%, 2000s 67%, 2010s 67%, 2020s 92%; 9,391 of 12,619 laws in all, median 164 characters.


## Settled decisions (from the scope and the gates)

- **Range and slots.** 1973 on (93rd Congress), public laws only, one slot per Congress; the president under a bar signed most of that Congress's laws, and the tooltip lists every signer when it splits. A Congress is in the years window when its second year is inside it.
- **Topics.** Congress.gov policy areas, shown as about ten topic groups plus a visible **Not classified** band (465 laws, 1973–78); the five largest groups get a colour, the rest share "Other topics", which the dropdown splits. Never mapped by us.
- **Support.** The closest recorded final-passage vote in either chamber; no recorded vote is its own band (about four laws in five before 2000, stated in the card's Data note). Minority-party support is later work.
- **Major laws.** Mayhew only, three states, through the 118th Congress; "Major laws" stops the window at the last assessed Congress and never draws the 119th as zero. No provisional flag ships (Session 3b has no go).
- **Summaries.** The CRS first sentence only; never model-written.
- **Colour.** No new tokens: topic groups reuse `--fuel-*`, support bands `--split-*`.
- **Copy.** Every number in a lede, note or link is computed from the data; tests assert the anchors (93rd 651 laws, 118th 274).

## The page (Sessions 4–6)

Three charts and a list on one state (years, policy area, major only, support band, pinned Congress). Card 1 counts laws per Congress by topic group; card 2 shows the support bands as a stacked area; card 3 compares topic groups (100% band bars over the years shown, beside a decade heatmap measured in laws, narrow-vote laws or no-recorded-vote laws); the list names every law the filters keep, newest first, with its closest vote, sponsor, signer and CRS sentence. A sponsor links to a profile only for members of the current Congress. Every chart has a table view and Data notes. The list is served as `/data/laws/list` and fetched once. Browser acceptance test: `pnpm check:laws`.

## Freshness

Three weekly jobs keep the page current; none edits data without a gate.

- **`laws-freshness.yml`** (Mondays): `pnpm fetch:billstatus` HEAD-checks GovInfo's Bill Status ZIPs and re-reads a Congress only when one of its ZIPs changed size or Last-Modified (in practice the in-progress Congress, about 50 MB). The Laws transform then re-runs; its count, number-sequence and vote gates throw on any miss. A pull request opens only if the raw files or `pipeline/output/laws*.json` changed, and merges only through the shared `gate-and-merge` action. The 93rd–107th (Congress.gov API) are closed history and are refreshed by hand with `pnpm fetch:laws`.
- **`voteview-freshness.yml`** (existing): also re-fetches `rollcalls_93on.json`, the file passage tallies are cross-checked against. The gate re-runs the Laws transform, so a roll call that contradicts a law's tally keeps the PR open for a human.
- **`laws-major-review.yml`** (Mondays): opens one issue when a Congress has ended and Mayhew's lists do not cover it (`pipeline/validate/laws-major-coverage.ts`). No provisional flag ships, so nothing is flipped; the fix is adding his entries by hand.

A failed or interrupted run leaves the committed raw data and output untouched: a Congress's file is written only after all four of its ZIPs were read, and nothing is committed unless every step passed. If govinfo.gov is unreachable the job ends green with a warning.
