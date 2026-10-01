# Immigration enforcement — source notes (Phase 1 findings)

Written 2026-09-30 during the ICE-removals data session. Everything here was
checked against the live ICE / DHS documents (snapshots in `pipeline/raw/ice/`);
the survey's claims that could not be verified are marked.

## 1. Primary-series gate — inventory of ICE-only removals

**Verdict: the series runs continuously FY2003–FY2025 with no gaps, all from ICE
documents.** FY2026 (the year in progress on 2026-09-30) has no ICE-published
file and is absent. The series does **not** have one definition throughout — see
the definition changes below; they are annotated per row (`note_ids`).

| FY | Removals | Status | Primary source (ICE) | Also printed in |
| --- | ---: | --- | --- | --- |
| 2003 | 157,080 | final | FOIA #16-06761 table, `Removals-AOR-FY2003-2016.xlsx` | — |
| 2004 | 175,106 | final | same table | — |
| 2005 | 180,189 | final | same table | — |
| 2006 | 207,776 | final | same table | — |
| 2007 | 291,060 | final | same table | — |
| 2008 | 369,221 | final | same table | — |
| 2009 | 389,834 | final | same table | — |
| 2010 | 392,862 | final | same table | — |
| 2011 | 396,906 | final | same table | — |
| 2012 | 409,849 | final | same table | — |
| 2013 | 368,644 | final | same table | FY2013 report; FY2014 report |
| 2014 | 315,943 | final | same table | FY2014 report |
| 2015 | 235,413 | final | same table | FY2015 ERO report |
| 2016 | 240,255 | final | same table | FY2016 report page |
| 2017 | 226,119 | final | FY2017 ERO report page | FY2018 report |
| 2018 | 256,085 | final | FY2018 ERO report | FY2019 report |
| 2019 | 267,258 | final | FY2019 ERO report | FY2020 report |
| 2020 | 185,884 | final | FY2020 ERO report | FY2020 report table |
| 2021 | 59,011 | final | FY2024 annual report, Figure 23 (bar label) | — (see below) |
| 2022 | 72,177 | final | ICE 2022 Year in Review page | FY2024 report chart |
| 2023 | 142,580 | final | FY2023 annual-report release | FY2024 report chart |
| 2024 | 271,484 | final | FY2024 annual report | FY2027 budget overview |
| 2025 | 442,637 | **preliminary** | ICE FY2027 budget overview (DHS-hosted) | — |
| 2026 | — | **missing** | no ICE file | — |

- **Earliest year: FY2003.** ICE began operating March 1, 2003, so FY2003 is a
  part-year ICE count (the earlier months were INS/Customs). The FOIA table is the
  only ICE document that covers FY2003–FY2006; ICE publishes no annual report for
  those years. Its title says "For Official Use Only/Pre-decisional" but it is
  published on ice.gov (the FOIA reading room).
- **No gap affects an administration**, so the decision gate did not trigger. The
  only missing year is FY2026 (in progress; Trump's second term already has
  FY2025 as its first attributed year).

### Definition and reporting changes (every one is a note in `enforcement_notes.json`)

1. **Returns excluded before FY2007, included from FY2007.** ICE's FOIA table:
   "Starting in FY2007 Removals data include returns." (Returns = voluntary
   returns, voluntary departures, withdrawals under docket control.) FY2003–06 are
   removals only. **This is a real break in the middle of the series.** ICE's
   current glossary still says "ICE removal data includes returns."
   *Contradicts the survey's framing:* "ICE removals" is not "removals under an
   order" in the strict sense — it never was, from FY2007 on.
2. **October 5 lock and "lag."** Since FY2009 ICE locks totals ~Oct 5; later
   closures count toward the next year. ICE also prints alternate "excluding lag"
   totals (FY2009 387,790 … FY2013 363,144 … FY2016 235,524). We use the headline
   figure only. Two ICE documents therefore print different numbers for some years
   (e.g. FY2013: 368,644 vs 363,144); they are two measures, not a restatement.
3. **FY2010** excludes 76,732 expedited removals ICE closed on behalf of CBP.
4. **June 1, 2013:** voluntary returns / expedited removals not detained by ICE
   are no longer ICE removals (CBP publishes them).
5. **Title 42 (Mar 2020 – May 11, 2023):** expulsions are excluded from the count
   (62,545 in FY2023), depressing FY2020–23.
6. **May 12, 2023:** expedited removals turned over from Border Patrol and flown
   by ICE Air are included.

**Not verified: "ICE began reporting apprehension location in FY2013."** ICE's
FY2012 interim table already splits "Border Removals" as a priority category and
its FY2007 criminal/non-criminal split goes back further. No note was added for
it. The FY2013 interior (133,551) + border (235,093) = 368,644 split is confirmed
and validated at transform time.

### Disagreements and restatements found

- **FY2016 / FY2017 text.** The FY2018 report's prose reads "from 226,119 to
  256,085 in FY2018" for a FY2016–FY2018 figure; 226,119 is FY2017 (confirmed by
  the FY2017 report and the FY2018 table row "Total 226,119 256,085"). FY2016 is
  240,255 in the FY2016 and FY2017 reports and the FOIA table.
- **FY2012:** ICE's mid-year (Aug 2012) tracker showed 366,292 year-to-date; the
  final is 409,849 (FOIA table). Interim documents are not
  used.
- **FY2025:** press figures conflict (442,637 / ~329,000 / ~320,000 / ~340,000
  MPI). Only 442,637 is from ICE (its FY2027 budget overview; measure "returned or
  removed"; FY2024 shown as 271,484, identical to the annual report). The lower
  figures were not traced to ICE files and are not used. No FY2025 annual report
  or locked file exists yet (`iceAnnualReportFY2025.pdf` → 404).
- **FY2021:** ICE's FY2021 annual-report PDF URL (`/doclib/eoy/iceAnnualReportFY2021.pdf`,
  linked from ice.gov) returns 404 (also FY2022, FY2023 PDFs); the number is read
  from the bar label in FY2024's Figure 23 (59,011) and cross-checked by the other
  five bars matching text elsewhere. Flagged `fy2021-read-from-chart`.

## 2. ICE statistics mechanics

- `ice.gov/statistics` hosts four **interactive dashboards** (arrests, detention,
  removals & expulsions, ATD), "updated quarterly" from Dec 31, 2024. They are
  **not downloadable files** (the page offers only a congressionally mandated
  detention spreadsheet, not removals), so no fiscal-year-to-date snapshots are
  fetchable and the survey's "total resets Oct 1 / ~6-week fall gap / early-2026
  stoppage / 356,389 YTD" could **not be verified** — nothing here depends on it.
- Per-year documents live at inconsistent paths (`/removal-statistics/2016`,
  `/doclib/about/offices/ero/pdf/…`, `/sites/default/files/documents/…`,
  `/doclib/eoy/…`); some linked PDFs are dead. URLs are **not stable** → no
  scheduled refresh (see methodology, "Refreshing").
- Historical totals are static once locked ("FY2019–FY2023 data are locked and
  remain static", FY2024 report); FY2024's figure is identical in the annual
  report and the FY2027 budget overview, i.e. it was not revised after year-end.
  How FY2025 will change at lock is unknown → `preliminary`.

## 3. FY2025 and FY2021 administration split

Neither ICE's documents nor the Deportation Data Project give a date-resolved
split we can use. ICE's dashboards chart removals by month, but only as a chart
(FY2024 report Figure 27 is an image; the dashboard is interactive). The
Deportation Data Project (Sep 29, 2025 update) says its late-June release was
wrong (170,000+ FY2024 removals missing, CBP cases wrongly included), recommends
the late-July file, and publishes only weekly charts — no month or Jan-20 totals.
**FY2025 and FY2021 are therefore `blended: true` with no estimated split.**
Only the *calendar-day* share per administration is stored (111 days / 254 days).
(ICE's FY2017 report does split interior removals at Jan 20, 2017 for a part-year
comparison, but not total removals; not used.)

## 4. Presidential terms — reuse

- **Where:** `ADMINISTRATIONS` in `pipeline/transform/administrations.ts`
  (hand-maintained; serialized to `pipeline/output/administrations.json`).
  `termIdForDate` in `lib/indicator-derive.ts` is the existing date→term helper
  (used by the economy page); this track calls it.
- **Shape:** `{term_id (= inauguration date), president, president_slug, party,
  start, end (last day in office, null while serving)}`.
- **Sufficiency check:** covers 1993-01-20 → present, so every fiscal year from
  FY2003 is inside it (the economy page prepends Bush 41 for 1989–93; not needed
  here). Exact start/end dates; Trump's two terms are separate rows
  (`2017-01-20`, `2025-01-20`); party and slug present. Boundaries for Jan 20 of
  2001, 2009, 2017, 2021, 2025 match the inaugurations. A Jan 20 day belongs to the
  incoming president (the table's documented rule).
- **No extension and no discrepancy** — nothing was changed in the table.
