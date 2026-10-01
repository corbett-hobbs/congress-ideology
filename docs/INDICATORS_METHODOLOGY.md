# Economic indicators methodology

How `pipeline/fetch/fred.ts` → `pipeline/transform/indicators.ts` →
`lib/indicator-data.ts` / `lib/indicator-derive.ts` turn FRED series into the
indicators track. Read `docs/DATA_CONVENTIONS.md` §8 for the contract (entity
model, time-axis join convention); this doc is the indicator-specific policy.
Modeled on `docs/NET_WORTH_METHODOLOGY.md`.

## What these numbers are

**Conditions during a period, not attributions of cause.** A gas price, a jobs
count or a deficit during a Congress or a presidency describes what was true
then. Nothing here says that Congress or that president caused it. Any page that
shows these series must say so.

## Series

Actual FRED metadata, fetched 2026-09-30 (first/last = first/last **valid**
observation; counts exclude `.` rows):

| Series | FRED ID | Freq. | First | Last | Obs. | Units / notes |
| --- | --- | --- | --- | --- | --- | --- |
| Regular gas price | `GASREGW` | weekly (Mon) | 1990-08-20 | 2026-09-28 | 1,879 | $/gal, NSA. EIA. 6 missing weeks 1990-12-10..1991-01-14. |
| 30-year mortgage rate | `MORTGAGE30US` | weekly (Thu) | 1971-04-02 | 2026-09-24 | 2,896 | %. Freddie Mac; methodology break 2022-11-17. **Copyrighted.** |
| Nonfarm payrolls | `PAYEMS` | monthly | 1939-01-01 | 2026-08-01 | 1,052 | Thousands of persons, SA. A level. |
| Unemployment rate | `UNRATE` | monthly | 1948-01-01 | 2026-08-01 | 943 | %, SA. 2025-10 missing. |
| Consumer prices | `CPIAUCSL` | monthly | 1947-01-01 | 2026-08-01 | 955 | Index 1982-84=100, SA. 2025-10 missing. |
| Real median household income | `MEHOINUSA672N` | annual | 1984-01-01 | 2025-01-01 | 42 | "2025 C-CPI-U dollars" per units field (notes say 2024). Census. |
| Federal surplus/deficit, % GDP | `FYFSGDA188S` | annual (FY) | 1929-01-01 | 2025-01-01 | 97 | % of GDP, negative = deficit. |
| Debt held by the public, % GDP | `FYGFGDQ188S` | quarterly | **1970-01-01** | 2026-01-01 | 225 | **Headline debt measure** (CBO's). Starts 1970, not 1966. |
| Total public debt, % GDP | `GFDEGDQ188S` | quarterly | 1966-01-01 | 2026-01-01 | 241 | Includes intragovernmental debt; ingested alongside, display decision deferred. |
| NBER recession indicator | `USREC` | monthly | 1854-12-01 | 2026-08-01 | 2,061 | 1/0, context for shading only. |

`indicators_report.json` carries the live counts and last-observation dates.

## How FRED dates each frequency (verified, not assumed)

- **Weekly:** the week-ending day (Monday for gas, Thursday for mortgage).
- **Monthly and quarterly:** the **first day** of the period (`2026-08-01` =
  August; `2026-01-01` = Q1).
- **Annual (calendar year):** January 1 of the year the income was earned.
- **Fiscal-year (`FYFSGDA188S`):** January 1 of the calendar year the fiscal year
  **ends**. Checked against values: the 2020-01-01 observation is −14.5% of GDP,
  which is FY2020 (Oct 2019–Sep 2020), not FY2019.

## Window

`INDICATORS_DISPLAY_START = 1991-01-21` (`lib/indicator-entities.ts`), applied only
in `lib/indicator-data.ts`. The plan specified 1991-01-03 (the 102nd Congress's
start) on the premise that all series are present from there; they are not —
FRED has no gas price for 1990-12-10..1991-01-14, so the first gas observation in
the window is 1991-01-21. The start was moved to 1991-01-21 (a project-owner
decision) rather than allowlisting the gap. It is still inside the 102nd
Congress. Moving it earlier later means changing this one constant and
reviewing framing — nothing is re-pulled and the schema does not change, since
full history is always ingested.

A point is in the window if its **period** ends on or after the start
(`periodEnd` in `lib/indicator-derive.ts`), so the annual value dated 1991-01-01
is in and the 1990 value is out.

## Revisions

Values are the **latest revised as of the fetch** (`fetched_at`, recorded per
series). Earlier vintages (ALFRED) are not used, so a number here can differ
from what was reported when it was first released — payrolls especially, and the
Census real-dollar series, which is re-based on every release.

### Scheduled-refresh materiality rule (proposed — FLAGGED FOR REVIEW)

FRED revises history, so the weekly job (`indicators-freshness.yml`) opens a PR
only when `pipeline/fetch/fred-diff.ts` finds a **material** change:

1. a **new observation** (always material), a **removed** one, or a value that
   flips between missing and present;
2. a **revision** to an existing value larger than the series' tolerance
   (`revision_tolerance` in the catalog, in the series' own units):
   gas $0.01, mortgage 0.01 pp, payrolls 100 (thousand jobs), unemployment 0.1 pp,
   CPI 0.1 index points, income $500, deficit and debt 0.1 pp of GDP, recession
   flag 0.5 (any flip).

Every revision, material or not, is listed in the PR body (largest first, so none
is silently dropped). If nothing is material no PR opens, the working tree is
discarded, and sub-tolerance revisions accumulate until the next material change
carries them in. The tolerances are a first proposal, not tuned against real
refresh history; review them after a few runs.

## Fiscal-year mapping (convention — FLAGGED FOR HUMAN REVIEW)

A fiscal year is mapped to the calendar year it ends in (FY2023 → 2023), then to
the Congress in session on that fiscal year's last day, September 30 (FY2023 →
118th). This is a convention, not a fact: a fiscal year's spending is mostly
shaped by the Congress and president in office *before* it begins. Other
conventions (the Congress at the start, or splitting across two) are defensible.

## Date → Congress and president

See `docs/DATA_CONVENTIONS.md` §8. Congress *n* starts January 3 of 1789 + 2(*n* −
1); valid only from 1935-01-03 (the helper throws earlier). Presidents join
through `term_id` in `administrations.json`.

## Derived measures (never stored in `pipeline/output/`)

In `lib/indicator-derive.ts`, computed over a series' **full history** and then
windowed, so the pre-window lookback exists:

- **Jobs added** = month-over-month change in `PAYEMS` (thousands).
- **Inflation** = year-over-year percent change in `CPIAUCSL`.

Both return `null` — never a longer-span change — when the lookback month is
missing: jobs added is null for 2025-11 (no 2025-10 to subtract), and inflation is null for
2026-10 (no 2025-10 to compare with). 2025-10 itself has no row.

## Sign and unit conventions

FRED's are kept: deficit negative, rates in percent, payrolls in thousands.
Presentation choices (flipping the deficit sign, dollars vs. thousands) belong to
the UI.

## Validation and coverage

Listed in `DATA_CONVENTIONS.md` §8. Last-observation lag (reported by
`indicators_report.json`): weekly/monthly series are within weeks; the Census
income and fiscal-year series end 2025-01-01; the quarterly debt series end
2026-01-01. This tail lag is expected and allowed.

## Verification against published sources (2026-09-30)

Compared our committed values with sources other than FRED:

- BLS public API (`api.bls.gov`): April and May 2020 for unemployment
  (`LNS14000000`: 14.8, 13.2), total nonfarm (`CES0000000001`: 130,426; 133,040)
  and CPI-U SA (`CUSR0000SA0`: 256.032, 255.802) — **all six match exactly**.
- EIA weekly retail gasoline: week of 2022-06-13 = 5.006 — **matches**.
- Census Bureau (P60-282): real median household income 2023 = $80,610 in 2023
  dollars. FRED holds 84,730 for 2023, **re-based to 2025 dollars**, so the two
  are not directly comparable; consistent in direction, not verified in value.
- **Not independently verified:** the mortgage rate (Freddie Mac's site did not
  serve a fetchable table) and the fiscal-year deficit/debt percentages (the
  Treasury page returned no figures). They are checked only for the FRED
  date-convention (FY2020 = −14.5% ≈ the known FY2020 deficit of ~14–15% of GDP).

## Licensing

FRED's API terms permit caching and require the notice in `docs/CREDITS.md`;
they bar mirroring all of FRED or replicating its user experience (ten series
does neither). Third-party-copyrighted series are those with "Copyright" in
their FRED notes — of ours only `MORTGAGE30US` (Freddie Mac). See CREDITS.md for
the decision and the unresolved permission question.
