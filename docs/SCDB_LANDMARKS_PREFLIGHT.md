# SCDB landmarks preflight — status: COMPLETE for data findings; Justia terms question still open

Session 0 was started on 2026-10-07 and stopped at the first step.

## Summary

- **Access:** scripted requests to Justia get a Cloudflare challenge, which I did not circumvent. You downloaded the 26 topic pages in a normal browser and uploaded them, plus Miranda Rights separately (the first zip had 26 pages and no Miranda page, and the plan names 27 topics). Extraction used only those saved files.
- **Terms: still not read by me.** `www.justia.com` is blocked from the sandbox. I cannot say what the terms allow, and I am not resolving that. You or I need to read https://www.justia.com/terms-of-service/ before the lists are published or committed. The extracted lists are local and gitignored. `docs/justia-permission-request.md` is drafted, not sent.
- **Lists:** 1,260 topic memberships over 27 topics, 1,132 unique cases (937 from 1946 on, 195 earlier).
- **Join:** 1,259 of 1,260 rows match SCDB. Of 1946+ rows (1,040), 1,039 match (99.9%). The one miss is *Goldwater v. Carter* (1979), a summary disposition that SCDB does not carry.
- **Direction:** 99.0% of matched 1946+ rows are liberal or conservative (99.4% of unique cases).
- **Recommendation: go on the data, conditional on the terms.** See the end.

## Item 1 — SCDB files (done)

Raw files are in a scratch directory and not committed. All fetched 2026-10-07 from links read off the release pages. The download is a zip holding a latin-1 CSV.

| File | Download name | zip sha256 | Rows |
|---|---|---|---|
| Modern, case-centered by citation, 2026 Release 01 | `SCDB_2026_01_caseCentered_Citation.csv_.zip` | `4d8f34d56363f8c140917bb556c530ee120aaaed6ed564a27866c0e5155e73f7` | 9,409 |
| Modern, justice-centered by citation | `SCDB_2026_01_justiceCentered_Citation.csv` (zip) | `c2298a2672068ad6edefe0132224e85378d2b35b0729781004bedb14186d8c12` | 84,256 |
| Legacy 07, case-centered by citation | `SCDB_Legacy_07_caseCentered_Citation.csv_.zip` | `ee7759bc96253992d3749f6ba144d00810f63f424b43bf096f9d0b55551da420` | 19,861 |

Release pages: https://scdb.la.psu.edu/data/2026-release-01/ and https://scdb.la.psu.edu/data/scdb-legacy-07/ (the `/data/` page also links Legacy 01–06; I used the latest). The hashed download URLs change, so read them off the pages.

Modern file: decisions run 1946–2026 (term 2025). `usCite` is blank for 533 cases and `docket` for 8, so joins on recent cases need `docket`. `dateDecision` is `m/d/yyyy`.

## Item 2 — Justia terms and access

- **Done:** the access route (you saved the pages in a normal browser at human pace; no bot detection was touched) and the permission-request draft.
- **Not done:** the terms read and `robots.txt`. They are unreachable from here, so there is no paragraph quoting what is allowed. This is an open question, not a settled one. Things to check in the terms: reproduction and republication of lists, automated access, and commercial versus non-commercial use. Citations and years are facts, but the *selection* of landmarks is Justia's curation, which is the part the terms may cover.
- Sitemap exposure of topic membership (route d) was not checked, for the same reason.

## Item 3 — Extracted lists

Fields kept: topic, case name, year, Justia path. No summaries, author lines or intro text. Output is `pipeline/preflight/scdb-landmarks/out/` (gitignored).

- 27 topics, 1,260 rows, 1,132 unique cases. 195 unique cases are pre-1946.
- Page counts match the number of entry anchors on every page.
- Per-topic counts are in the table below (1946+) plus the pre-1946 column.
- Decade distribution of unique 1946+ cases (by SCDB decision date): 1940s 15, 1950s 44, 1960s 71, 1970s 115, 1980s 178, 1990s 121, 2000s 147, 2010s 138, 2020s 102.
- Overlap: 1,013 cases are in one topic, 111 in two, 7 in three, 1 in four (*Buckley v. Valeo*, 424 U.S. 1: Free Speech, Government Agencies, Separation of Powers, Voting & Elections).
- Two quirks: entries like "Whitney v. California (Brandeis concurrence)" carry a parenthetical between the link and the year (fixed in the extractor), and Antitrust uses absolute URLs.

## Items 4 and 5 — Join and direction coverage

Match order: volume/page, then docket (case-insensitive; within one year, or the only candidate), then name plus year. 1946+ cases are tried against the modern file first, pre-1946 against Legacy first.

Join methods over all 1,260 rows: citation 1,073 (847 modern, 226 legacy), docket 186, name+year 0 after the docket fixes. Early passes also surfaced these, which are now matched:
- *Trump v. CASA* (docket `24a884` vs SCDB `24A884`): case-sensitivity.
- *Espinoza v. Montana Dept. of Revenue*: Justia says 2018, decided 2020 (see item 6).
- Recent cases such as *Trump v. Cook* and *Ohio v. EPA* have `a`-docket paths with no usable citation.

Unmatched: 1 row, *Goldwater v. Carter* (444 U.S. 996, 1979), a summary disposition not in SCDB. Five 1946 decisions (*Commissioner v. Flowers*, *Girouard*, *Lavender v. Kurn*, *Marsh v. Alabama*, *U.S. v. Causby*) are in the Legacy file because they belong to term 1945.

Match rate by decade (1946+ topic rows): 1940s 100%, 1950s 100%, 1960s 100%, 1970s 99.2% (Goldwater), 1980s 100%, 1990s 100%, 2000s 100%, 2010s 100%, 2020s 100%.

| Topic | 1946+ cases | Matched | Cons / Lib / Unspec | Specifiable | Pre-1946 (listed / matched) |
|---|---|---|---|---|---|
| Abortion & Reproductive Rights | 16 | 16 (100.0%) | 7/9/0/0 | 16 (100.0%) | 0/0 |
| Antitrust | 37 | 37 (100.0%) | 19/18/0/0 | 37 (100.0%) | 11/11 |
| Climate Change & Environment | 32 | 32 (100.0%) | 20/12/0/0 | 32 (100.0%) | 2/2 |
| Copyrights | 21 | 21 (100.0%) | 8/13/0/0 | 21 (100.0%) | 8/8 |
| Criminal Trials & Prosecutions | 47 | 47 (100.0%) | 20/27/0/0 | 47 (100.0%) | 7/7 |
| Death Penalty & Criminal Sentencing | 28 | 28 (100.0%) | 15/13/0/0 | 28 (100.0%) | 1/1 |
| Due Process | 30 | 30 (100.0%) | 12/18/0/0 | 30 (100.0%) | 17/17 |
| Equal Protection | 37 | 37 (100.0%) | 14/23/0/0 | 37 (100.0%) | 11/11 |
| Free Speech | 65 | 65 (100.0%) | 33/32/0/0 | 65 (100.0%) | 10/10 |
| Government Agencies | 63 | 63 (100.0%) | 32/28/3/0 | 60 (95.2%) | 13/13 |
| Gun Rights / Gun Control | 10 | 10 (100.0%) | 7/3/0/0 | 10 (100.0%) | 3/3 | **← thin**
| Health Care | 29 | 29 (100.0%) | 12/17/0/0 | 29 (100.0%) | 3/3 |
| Immigration & National Security | 48 | 48 (100.0%) | 27/20/1/0 | 47 (97.9%) | 14/14 |
| LGBTQ+ Rights | 14 | 14 (100.0%) | 7/7/0/0 | 14 (100.0%) | 0/0 | **← thin**
| Labor & Employment | 79 | 79 (100.0%) | 38/41/0/0 | 79 (100.0%) | 9/9 |
| Lawsuits & Legal Procedures | 62 | 62 (100.0%) | 26/36/0/0 | 62 (100.0%) | 10/10 |
| Miranda Rights | 34 | 34 (100.0%) | 22/12/0/0 | 34 (100.0%) | 0/0 |
| Patents | 37 | 37 (100.0%) | 10/27/0/0 | 37 (100.0%) | 9/9 |
| Powers of Congress | 25 | 25 (100.0%) | 8/17/0/0 | 25 (100.0%) | 18/18 |
| Property Rights & Land Use | 33 | 33 (100.0%) | 15/18/0/0 | 33 (100.0%) | 11/11 |
| Religion | 50 | 50 (100.0%) | 25/25/0/0 | 50 (100.0%) | 3/3 |
| Role of Courts | 27 | 26 (96.3%) | 15/11/0/0 | 26 (100.0%) | 20/20 |
| Search & Seizure | 107 | 107 (100.0%) | 71/36/0/0 | 107 (100.0%) | 5/5 |
| Separation of Powers | 23 | 23 (100.0%) | 4/13/6/0 | 17 (73.9%) | 8/8 |
| Taxes | 39 | 39 (100.0%) | 10/29/0/0 | 39 (100.0%) | 21/21 |
| Trademarks | 17 | 17 (100.0%) | 7/10/0/0 | 17 (100.0%) | 1/1 |
| Voting & Elections | 30 | 30 (100.0%) | 15/15/0/0 | 30 (100.0%) | 5/5 |

Overall 1946+ topic rows: 498 conservative, 530 liberal, 10 unspecifiable. The unspecifiable cases are all separation-of-powers or agency structure cases: *Mistretta*, *Morrison v. Olson*, *Bowsher v. Synar*, *Clinton v. City of New York*, *INS v. Chadha*, and *Youngstown*.

**Topics with fewer than 15 specifiable cases:** Gun Rights / Gun Control (10) and LGBTQ+ Rights (14). **Direction-thin:** Separation of Powers has 23 cases but only 17 specifiable (74%), under the 85% gate on its own.

### Direction review table (1946+, SCDB coding)

`partyWinning`: whether the petitioner or respondent won. Issue labels come from the SCDB online codebook; the three marked "no label found" have six-digit codes that my parse of the codebook page did not return. I did not check why.

| Case | Year | SCDB direction | Issue | Winner | Topics |
|---|---|---|---|---|---|
| Burwell v. Hobby Lobby | 2014 | liberal | 30160 free exercise of religion | respondent | Health Care, Religion |
| Employment Division v. Smith | 1990 | conservative | 30160 free exercise of religion | petitioner | Health Care, Religion |
| NFIB v. Sebelius | 2012 | liberal | 100120 (no label found) | respondent | Health Care, Powers of Congress |
| Citizens United v. FEC | 2010 | conservative | 30140 campaign spending | petitioner | Free Speech, Voting |
| District of Columbia v. Heller | 2008 | conservative | 10600 misc. criminal procedure | respondent | Gun Rights |
| Gonzales v. Raich | 2005 | liberal | 100050 (no label found) | petitioner | Health Care, Powers of Congress |
| Kelo v. New London | 2005 | liberal | 40070 takings clause | respondent | Property Rights |
| Bush v. Gore | 2000 | conservative | 20010 voting | petitioner | Equal Protection, Voting |
| Whalen v. Roe | 1977 | conservative | 50010 privacy | petitioner | Health Care |
| Rust v. Sullivan | 1991 | conservative | 50020 abortion | respondent | Free Speech |
| Medina v. Planned Parenthood | 2025 | conservative | 20410 misc. civil rights | petitioner | Abortion, Health Care |
| Becerra v. Braidwood | 2025 | liberal | 80350 misc. economic regulation | petitioner | Government Agencies, Health Care |
| Skinner v. Railway Labor Exec. | 1989 | conservative | 10050 search and seizure | petitioner | Government Agencies |
| Trump v. Hawaii | 2018 | conservative | 20310 immigration and naturalization | petitioner | Immigration |
| Masterpiece Cakeshop | 2018 | conservative | 20130 sex discrimination | petitioner | LGBTQ+ Rights |
| Mahmoud v. Taylor | 2025 | conservative | 30160 free exercise of religion | petitioner | Religion |
| Zivotofsky v. Kerry | 2015 | liberal | 130015 (no label found) | respondent | Separation of Powers |
| U.S. v. Skrmetti | 2025 | conservative | 20130 sex discrimination | respondent | Equal Protection, LGBTQ+ Rights |
| Massachusetts v. EPA | 2007 | liberal | 90240 standing to sue | petitioner | Climate, Role of Courts |
| Shelby County v. Holder | 2013 | conservative | 20020 Voting Rights Act | petitioner | Voting |

Read carefully:
- **Heller** is coded conservative under *criminal procedure* with no gun-specific issue code, so a "gun rights" reading is not in the data.
- **Hobby Lobby** (liberal) and **Smith** (conservative) are both free-exercise cases, as the plan expected. The label follows who won, not the political valence of the claimant.
- **Kelo** reads liberal (government won), **Rust** reads conservative (government won).
- **NFIB**, **Raich** and **Zivotofsky** have issue codes with no label in the codebook page I parsed, so their coding could not be explained from the label.
- The chart's subtitle ("a ruling for a religious claimant counts as liberal") must say the coding follows SCDB's rules, as the prototype footnote already does.

## Item 6 — Dates

Justia year versus SCDB `dateDecision` year differs for 11 matched cases:
- 10 are January–June decisions that Justia files under the term year: *Baker v. Selden*, *Coffin v. Ogden*, *Crandall v. Nevada*, *Gayler v. Wilder*, *Kohl v. U.S.*, *Reynolds v. U.S.*, *U.S. v. Klein*, *U.S. v. Percheman* (all pre-1946), plus *Reid v. Covert* (1956 → 6/10/1957) and *Verizon v. Trinko* (2003 → 1/13/2004).
- *Espinoza v. Montana* is listed as 2018 and was decided 6/30/2020. This one looks like a Justia error rather than a term-year rule.

Plotting by SCDB `dateDecision` is correct. Do not take Justia's year.

## Item 7 — Legacy file 

Decision direction coding (1 = conservative, 2 = liberal, 3 = unspecifiable):

| | Rows | Conservative | Liberal | Unspecifiable | Blank |
|---|---|---|---|---|---|
| Modern (1946+) | 9,409 | 4,503 | 4,697 | 164 (1.7%) | 45 |
| Legacy (1791–1945) | 19,861 | 7,631 | 8,503 | 3,672 (18.5%) | 55 |

Legacy `docket` is blank for 4,894 rows (25%), so docket joins will be weak there; `usCite` is blank for only 1. The legacy unspecifiable share is highest in the early decades (about 40% in the 1800s–1820s) and drops to about 3% by the 1940s. Legacy has a usable direction field, but the codebook warns that legacy issue coding is stretched, and the direction for e.g. 19th-century property or admiralty cases is a weak signal. My view, to be confirmed after seeing which landmarks fall there: **v1 should start at 1946**, with pre-1946 as a later opt-in. 

**Pre-1946 landmarks:** 195 unique listed cases (220 topic rows), all matched in Legacy (by citation). Direction: 110 liberal, 106 conservative, 4 unspecifiable, so coverage is not the problem. The concern is meaning: Legacy issue coding is stretched (per the SCDB codebook), and a liberal/conservative label for a 19th-century property or admiralty ruling is a weak signal. **View: start v1 at 1946.** Offer the earlier cases later, if at all, as a separate "legacy coding" layer with a caveat.

## Item 8 — Per-case detail (feasibility: yes)

- The justice-centered file is 84,256 rows × 61 columns, about 30 MB as CSV (about 2 MB zipped). It has `justiceName`, `vote`, `opinion`, `direction` and `majority`. It is a build-time input only; the site would ship a small per-landmark extract.
- Case-centered file: `splitVote`, `majVotes` and `minVotes` are populated for every row. `majOpinWriter` is blank for 1,775 modern rows (19%), mostly per curiam and unsigned decisions, so "who wrote the majority" needs a fallback for those. The justice-centered `opinion` field is the place to check that.
- Verified on *Burwell v. Hobby Lobby*: the justice-centered file gives all nine justices with vote and opinion, and the case file gives the 5–4 split. Of the 931 unique 1946+ matched landmarks, 20 (2%) have no `majOpinWriter`. The writer is stored as a justice code, so a code-to-name lookup is needed.

## Item 9 — Fallback lists: Wikipedia (evaluated)

Source: https://en.wikipedia.org/wiki/List_of_landmark_court_decisions_in_the_United_States, fetched once through the MediaWiki API with a descriptive user agent. A second page, the same list by year, was not fetched. Extractor: `extract_wikipedia.py`; the rows go through the same `join_scdb.py` and `report.py`. Output is local in `out/` (gitignored for now, though this source can be committed with attribution).

**License.** Wikipedia text is CC BY-SA 4.0 (standard for the site; I did not re-read the reuse page in this session, so confirm). Citations and names are facts. Reusing the list needs attribution and a link to the page and history, and any adapted *text* would carry share-alike. We would not copy Wikipedia's descriptions.

**Structure.** A legal-doctrine taxonomy, not Justia's 27 topics: 12 top-level sections and about 40 subsections (Individual rights, Criminal law, First Amendment rights, Federalism, Native American law, Separation of powers, Executive power, and so on). It mixes in lower-court and state cases.

**Coverage (U.S. Supreme Court only, via `{{ussc}}` citation templates):**
- 513 bullet entries; 475 have a U.S. citation (466 unique). The other 38 are lower-court, state, or administrative decisions with no U.S. Reports citation, so they cannot join SCDB.
- 341 unique cases from 1946 on, against 937 from Justia. 125 earlier cases.
- By decade (1946+ unique): 1940s 8, 1950s 18, 1960s 53, 1970s 64, 1980s 53, 1990s 37, 2000s 39, 2010s 41, 2020s 21. Thinner than Justia in the 1980s onward and in the 2020s.
- **Overlap with Justia (1946+):** 214 cases are in both, 120 are Wikipedia-only (for example *Adarand*, *Bivens*, *Blakely v. Washington*, *Apodaca*), and 722 are Justia-only. Wikipedia is a smaller, differently curated list. It is not a subset of Justia.

**Join to SCDB (same method):** of 345 topic rows from 1946 on, all but 7 unique cases match, so roughly 98%. The 7:
- *Bostock*, *Bristol-Myers Squibb* and *Trump v. Hawaii* are in SCDB. Wikipedia has no docket, and the name+year match fails on case-name differences (for example "Bostock v. Clayton County" against "…, Georgia"), so a looser name match would fix these.
- *Ford Motor Co.* and *Lucas v. South Carolina Coastal Council* did not match on name+year and I did not find them by hand, so I can't say why.
- *Manual Enterprises v. Day*: Wikipedia cites 370 U.S. 348; SCDB has it at 370 U.S. 478, so Wikipedia's page number looks wrong.
- *One, Inc. v. Olesen* (1958): not found in SCDB, a short per curiam.

Wikipedia sometimes cites a case by `date=` and a named-parameter template rather than year; the extractor handles both after a fix, but entries in other formats would need review.

**Direction (1946+, unique matched):** 201 liberal, 127 conservative, 6 unspecifiable (98.2% specifiable), so it leans liberal (61%) compared with Justia's 51%. That tilt is a curation effect: Wikipedia's list favors rights-expanding rulings. A "landmarks lean liberal" read of the page would be partly an artifact of who curated the list.

**Per-group thickness:** by Wikipedia's own sections, Second Amendment has 4 cases, Administrative law 6, Civil procedure 3, Fourteenth Amendment 6, Separation of powers 8 (1946+ matched rows). Any topic view needs regrouping; the nine-group scheme from Justia does not map cleanly onto these sections.

**Not examined:** WikiProject importance ratings (for example "Top-importance" Supreme Court cases) could give a broader, community-rated list. One quick category search returned nothing, so I did not follow it up.

**Read:** Wikipedia is **usable but a weaker substitute.** It is legitimately reusable with attribution and it joins well, but it is about a third the size, differently curated, tilted liberal, and organized by doctrine instead of topic. It is thin enough that several topics would be too sparse to show alone.

## Item 10 — Design inputs

- **Cases per topic (1946+):** from 10 (Gun Rights) to 107 (Search & Seizure); median 33. Full table above.
- **Too thin to stand alone:** Gun Rights (10) and LGBTQ+ Rights (14). Several others are small but usable: Abortion 16, Trademarks 17, Copyrights 21, Separation of Powers 23 (17 specifiable).
- **"All topics" de-duplication:** 111 cases are in two topics, 7 in three, 1 in four. The rule is to **plot each case once, keyed by Justia path (or SCDB `caseId`), and list all its topics in the tooltip**. Unique 1946+ count is 937 (931 matched).
- **Empty stretches (gap of 15+ years):** 10 topics have one. Gun Rights has two (1946–1980, 1980–2008). The rest: Abortion (to 1965), Climate (to 1976), Copyrights (1954–1973), Death Penalty (1949–1972), Health Care (to 1977), LGBTQ+ (to 1986), Labor (to 1968), Miranda (to 1966), Powers of Congress (to 1964), Separation of Powers (1952–1974), Trademarks (to 1982). Axes should start at 1946 for every topic, as the prototype does.
- **Collisions:** the busiest single-topic cells are 4 dots: Search & Seizure (1984, 1990, 1991, 2004, all conservative), Criminal Trials (1986), Labor (1998, liberal). In "All topics" the busiest cells are 16 dots (1984 and 1990, both conservative), 13 (1986, 1987) and 12 (2009, 2011, 1991). These need a stacking or jitter rule and label priority, as the existing page-level layout rules require.
- **Vote detail:** feasible (item 8).

## Decision gates

| Gate | Result |
|---|---|
| ≥95% of 1946+ landmarks match SCDB | **Pass**: 99.9% (1,039 of 1,040 rows) |
| ≥85% of matched cases have liberal/conservative direction | **Pass**: 99.0% overall; Separation of Powers alone is 74% |
| Access route that does not circumvent protections | **Pass**: you saved the pages in your own browser; nothing was scraped |
| Terms permit citation lists with attribution and links, or permission received | **Open**: terms not read, permission not requested |

## Recommendation

**Go, on Justia lists plus SCDB, starting at 1946, conditional on the terms question.** The data side is strong: nearly every landmark joins and nearly every case has a direction. The only unresolved gate is Justia's terms. Before anything ships: read the terms, and if they are ambiguous, send the permission request. Until then the lists stay local and gitignored. If Justia says no, Wikipedia is a working but weaker fallback (item 9): about a third of the cases, doctrine-based sections, and a liberal tilt.

Product notes to carry forward: plot by SCDB `dateDecision`; check how six-digit issue codes should be labelled; show the "coding follows SCDB rules" note near the chart; treat Gun Rights and LGBTQ+ as thin and consider grouping them.
