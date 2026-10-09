# Credits & attribution

Data sources used by this project, and how they must be credited.

The Voteview citation appears in the site-wide footer (`components/GlobalFooter.tsx`) and, with the
congress-legislators credit, in the Congress page footer (`components/senate/SiteFooter.tsx`) and the README.
Every credit below is also restated on `/methodology` (`lib/methodology-content.ts`). Keep those in sync
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

---

## Martin-Quinn scores — Supreme Court ideal points

Justice ideology estimates (`pipeline/output/court/mq_scores.json`) come from
the Martin-Quinn scores published by Washington University in St. Louis.

**Requested citation:**

> Martin, Andrew D. and Kevin M. Quinn. 2002. "Dynamic Ideal Point Estimation
> via Markov Chain Monte Carlo for the U.S. Supreme Court, 1953–1999."
> *Political Analysis* 10:134–153.

Source: https://mqscores.wustl.edu/measures.php. Release used: **2024 Release 01**
(terms October 1937 – October 2024; the site describes it as built on the 2024
Release 01 of the Supreme Court Database plus SCDB Legacy 07). The label is
taken from the site's description as relayed at session start — the site's
README was not retrievable (bot challenge), so `SOURCE.json` records it as
supplied, not read from the file. Snapshot committed in `pipeline/raw/mq/2024/`
(hand-placed; `retrieved_via: manual`).

## Federal Judicial Center — justice biographies

Full names, birth/death years, appointing president and party, and
nomination / confirmation / service dates come from the Federal Judicial
Center's *Biographical Directory of Article III Federal Judges* (public
domain): https://www.fjc.gov/history/judges. Files used:
`demographics.csv`, `federal-judicial-service.csv` from
`https://www.fjc.gov/sites/default/files/history/`; snapshot committed in
`pipeline/raw/fjc/` (refresh with `pnpm fetch:fjc`).

## Wikipedia — justice bios and portraits

Justice bios (`pipeline/output/court/justice_bios.json`) are Wikipedia article
leads, trimmed to whole sentences and never rewritten, shown with a
"Source: Wikipedia, CC BY-SA 4.0" link to the article. Portraits are included
only when the file's Wikimedia Commons / Wikipedia license metadata says public
domain or CC0 (committed to `public/images/justices/`, source file recorded per
row); everything else is omitted. Refresh with `pnpm fetch:justice-bios`.
Martin-Quinn and FJC attribution for the justice pages is as above.

---

## Federal Register — executive orders

Executive-order text, numbers, dates, issuing agencies and amend/revoke notes
come from the [Federal Register API](https://www.federalregister.gov/developers/documentation/api/v1)
(`federalregister.gov/api/v1`, no key), 1994-present. U.S. government works,
public domain; each order links back to its Federal Register page
(`federalregister.gov/d/<document_number>`). Snapshot committed in
`pipeline/raw/federal-register/`, refreshed weekly by
`.github/workflows/executive-orders-freshness.yml`. The topic labels are this
project's own, classifier-assisted, and are not part of the Federal Register's
data. Cited in the footer of `components/executive-orders/ExecutiveOrdersPageClient.tsx`.

---

## FRED — economic indicators

Economic indicator series (`pipeline/output/indicator_*.json`) come from FRED®,
the Federal Reserve Bank of St. Louis's [API](https://fred.stlouisfed.org/docs/api/fred/).
Snapshots committed in `pipeline/raw/fred/`, refreshed weekly by
`.github/workflows/indicators-freshness.yml`.

**Required notice** (FRED API Terms of Use; show it wherever the data is
displayed):

> This product uses the FRED® API but is not endorsed or certified by the
> Federal Reserve Bank of St. Louis.

Cite the underlying agency per series (also stored in `indicator_series.json`
`attribution`):

| Series | Credit |
| --- | --- |
| `GASREGW`, `GASDESW` | U.S. Energy Information Administration |
| `MORTGAGE30US` | Freddie Mac, Primary Mortgage Market Survey® — **third-party copyright**, "Reprinted with permission" per FRED's notes. FRED's terms require contacting the owner for any use beyond personal use; served here with attribution at the project owner's decision (2026-09-30). Permission from Freddie Mac has **not** been obtained or verified — revisit before launch. |
| `PAYEMS`, `UNRATE`, `CPIAUCSL` | U.S. Bureau of Labor Statistics |
| `MEHOINUSA672N` | U.S. Census Bureau |
| `FYFSGDA188S`, `FYGFGDQ188S`, `GFDEGDQ188S` | U.S. Office of Management and Budget; calculated by the Federal Reserve Bank of St. Louis |
| `USREC` | National Bureau of Economic Research business-cycle dates, as interpreted by the Federal Reserve Bank of St. Louis |

The FRED notice and agency credits are **not yet in the site footer**: no page
shows indicator data yet (data-only session). The first page that does must add
them next to the Voteview citation in `components/senate/SiteFooter.tsx`.

---

## U.S. Immigration and Customs Enforcement — removals

ICE removal counts (`pipeline/output/enforcement_*.json`) are U.S. Government
works published by ICE (and, for FY2025, in ICE's FY2027 budget overview hosted by
DHS); no license restriction applies. Snapshots are committed in `pipeline/raw/ice/`
and each row's `source` / `source_url` names the document. Credit as: *U.S.
Immigration and Customs Enforcement, Enforcement and Removal Operations.* Note the
counts are ICE's own definition (includes returns from FY2007) and must not be
presented as DHS-wide totals. `/presidency/immigration` carries this credit in its page footnote (the same
place Economy and Trade credit their sources).

The Deportation Data Project (UC Berkeley) was **consulted only to assess FY2025
date-resolved data and is not used**; nothing from it is ingested or needs credit.

---

## U.S. Census Bureau — international trade statistics

Trade balances, partner-country goods trade and calculated duties come from the U.S. Census
Bureau, Foreign Trade Division (with the Bureau of Economic Analysis for the balance-of-payments
basis).

> Source: U.S. Census Bureau, Foreign Trade Division, *U.S. International Trade in Goods and
> Services* (`www.census.gov/foreign-trade`) and the Census international trade API
> (`api.census.gov/data/timeseries/intltrade`).

- Files used: `balance/country.xlsx`, `statistics/historical/gands.xlsx`, `schedules/c/country.txt`,
  and API `imports/hs` (calculated duty, imports for consumption). Snapshots in
  `pipeline/raw/census-trade/`; fetched by `pipeline/fetch/census-trade.ts`.
- Federal government statistics, public domain. The API requires a free key (`CENSUS_API_KEY`);
  this product uses the Census Bureau Data API but is not endorsed or certified by the Census Bureau.
- **Calculated duties 1993–2009** come from the U.S. International Trade Commission's DataWeb
  (`dataweb.usitc.gov`; Imports for Consumption, Calculated Duties and Customs Value, compiled from
  Census Bureau data), pulled once on 2026-10-01 into `pipeline/raw/dataweb-duties/` by
  `pipeline/fetch/dataweb-duties.ts`. Federal government statistics, public domain. The page must say
  these earlier years come from USITC DataWeb.
- Methodology: `docs/TRADE_METHODOLOGY.md`.

---

## ForeignAssistance.gov and Natural Earth — foreign aid page

Foreign assistance disbursements come from ForeignAssistance.gov (U.S. Department of State, with USAID's
successor programs and the other reporting agencies), through the site's public data API; U.S. government data,
public domain. Snapshots in `pipeline/raw/foreign-assistance/`; methodology `docs/FOREIGN_AID_METHODOLOGY.md`.

The world map is drawn from Natural Earth 1:50m Admin 0 – Countries (`ne_50m_admin_0_countries.geojson`, from the
`nvkelso/natural-earth-vector` mirror, snapshot in `pipeline/raw/natural-earth/`). Natural Earth is in the public
domain; no credit is required, and this is given as a courtesy ("Made with Natural Earth"). It is projected,
simplified and keyed to our country codes by `pipeline/transform/world-map.ts` (never hand-edited).

---

## Defense Manpower Data Center — troops abroad

Active-duty personnel by place of duty come from the U.S. Department of Defense, Defense Manpower Data Center (DMDC),
*Military and Civilian Personnel by Service/Agency by State/Country (Updated Quarterly)*, the location report, Sep 2008 to
Mar 2026 (`https://dwp.dmdc.osd.mil/dwp/app/dod-data-reports/workforce-reports`). U.S. government data, public domain.
Snapshots in `pipeline/raw/dmdc-location/`; methodology `docs/TROOPS_METHODOLOGY.md`. The page must say the series
changes meaning in Dec 2017 (permanent assignment only) and that Afghanistan, Iraq and Syria are "not reported", not zero,
Dec 2017 to Sep 2021.

---

## troopdata and DMDC historical tables — troops abroad before 2008

Troops abroad for 1950-2007 come from two sources. The **troopdata** quarter-format country file (`pipeline/raw/troopdata/`, pinned to a
commit, GPL-3.0 with its `LICENSE.md` beside the data): Allen, Flynn and Martinez Machain (2022), "Global U.S. military deployment data:
1950-2020," *Conflict Management and Peace Science* 39(3): 351-370, and Kane (2005), "Global U.S. troop deployment, 1950-2003," Heritage
Foundation technical report (the original compilation from DMDC). Package: https://github.com/meflynn/troopdata. The **DMDC 309A tables**
(Sep 1996, Sep 1998-2005; "Active Duty Military Personnel Strengths by Regional Area and by Country", Worldwide Manpower Distribution by
Geographical Area) are U.S. Department of Defense publications, public domain, extracted into `pipeline/reference/dmdc-309a-sep.csv`.
Methodology: `docs/TROOPS_METHODOLOGY.md` ("History"). The page must say 2006-07 are estimates and that earlier years are not like-for-like
with DMDC's 2008+ tables (no afloat/unassigned rows before 1996).

## Vine's base lists (via troopdata) — known overseas installations

The optional "Known installations" layer on the national security page uses `basedata.csv` from the **troopdata** package (Michael Flynn, GPL-3.0, pinned commit beside
the troop file), which packages David Vine's lists of U.S. military bases abroad (American University; "Lists of U.S. Military Bases Abroad, 1776-2020"). One
undated snapshot, documented through 2018. The page must say it is a snapshot with no headcounts and that newer, classified and unacknowledged sites are missing.
Methodology: `docs/TROOPS_METHODOLOGY.md` ("Bases"); defects: `docs/BASES_SOURCE_NOTES.md`.

## Wikipedia — landmark cases on the Decisions page

The "Landmark cases" filter uses the list "List of landmark court decisions in the United States" (Wikipedia contributors, CC BY-SA 4.0; revision recorded in `pipeline/raw/wikipedia-landmarks/manifest.json`). Only the cases it names, its headings and article links are used; the page credits it in its Source line and links each landmark to its article.

## Supreme Court Database — decisions counts

The Supreme Court decisions page counts orally argued cases by term, issue area and size of the majority from the Supreme Court Database (Washington University in St. Louis),
licensed CC BY-NC 3.0 US. Release used: **Version 2026 Release 01** (terms 1946–2025). Requested citation:

> Harold J. Spaeth, Lee Epstein, Andrew D. Martin, Jeffrey A. Segal, Theodore J. Ruger, Sara C. Benesh, and Michael J. Nelson. 2026 Supreme Court Database, Version 2026 Release 01. URL: http://supremecourtdatabase.org

Source: http://scdb.wustl.edu/data.php. Snapshot committed in `pipeline/raw/scdb/`.


## Congress.gov and GovInfo — public laws

The Laws page counts every public law from the 93rd Congress (1973) on. The laws, their sponsors, cosponsors, policy areas, committees, actions and the Congressional Research Service summaries come from the Library of Congress's Congress.gov API (93rd–107th Congresses) and GPO's GovInfo Bill Status bulk data (108th on). Both are U.S. government works in the public domain. Credit line: "Source: Congress.gov (Library of Congress) and GovInfo (U.S. Government Publishing Office); summaries by the Congressional Research Service." Raw snapshots are committed in `pipeline/raw/congress-gov/` and `pipeline/raw/govinfo-billstatus/`.

## Voteview — roll calls checked against passage tallies

The Laws page's support bands take each chamber's final-passage tally from the Congressional Record action text kept by Congress.gov and check it against Voteview's roll-call file (`HSall_rollcalls.csv`, 93rd Congress on, kept in `pipeline/raw/voteview/rollcalls_93on.json`). Cite as in the Voteview section above.

## David R. Mayhew — important enactments

The "Major laws" filter is David R. Mayhew's judgment of which laws were important, from the lists in *Divided We Govern: Party Control, Lawmaking, and Investigations, 1946–2002* (Yale University Press, 2nd ed. 2005), Table 4.1, and his updates of the lists for later Congresses (the 102nd through the 118th), published at https://campuspress.yale.edu/davidmayhew/datasets-divided-we-govern/. Requested citation:

> David R. Mayhew, *Divided We Govern: Party Control, Lawmaking, and Investigations, 1946–2002*, 2nd ed. (New Haven: Yale University Press, 2005), and "Important Laws Enacted" lists for the 102nd–118th Congresses, https://campuspress.yale.edu/davidmayhew/datasets-divided-we-govern/.

The lists run through the 118th Congress (2023–24); laws of later Congresses read "not yet assessed". The page states no licence and the lists were hand-extracted (his entries give a title and a year, never a law number) and matched to laws by this site, so any error in the matching is ours; each matched entry keeps a verbatim quotation of his wording in `pipeline/reference/mayhew-major-laws.json`. Files read 2026-10-08.

## U.S. Senate Historical Office and the Clerk of the House — party control

The "which party held the House and Senate" rows come from the Senate Historical Office's *Party Division in the Senate, 1789–Present* (https://www.senate.gov/history/partydiv.htm) and the House History, Art & Archives *Party Divisions of the House of Representatives* (https://history.house.gov/Institution/Party-Divisions/Party-Divisions/), recorded in `pipeline/reference/congress-control.json` from the 93rd Congress (1973). U.S. government pages in the public domain. The Senate Historical Office's table of presidential vetoes (https://www.senate.gov/legislative/vetoes/vetoCounts.htm) was used once, as a cross-check of the page's veto-override laws (see `docs/LAWS_METHODOLOGY.md`); nothing from it is shown.

## GovInfo Bill Status — committee legislation

The legislation section of each committee page lists every bill and joint resolution referred to the committee in the Congress in progress, with its sponsor, cosponsors, policy area and the committee steps recorded for it (referral, hearing, markup, report, discharge). They come from GPO's GovInfo Bill Status bulk data, which carries the Library of Congress's and the Congressional Research Service's bill records; U.S. government works in the public domain. Credit line: "Source: GovInfo Bill Status (U.S. Government Publishing Office, with the Library of Congress and the Congressional Research Service)." Raw digest committed in `pipeline/raw/govinfo-bills/`.

