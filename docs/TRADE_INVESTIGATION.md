# Trade data: source investigation (2026-10-01)

Findings from probing the live Census endpoints before building. Every URL
below was fetched on the date above. The build that followed is described in `docs/TRADE_METHODOLOGY.md`.

## Repo patterns to match

- Fetch → validate → transform → `pipeline/output/` (committed), per
  `docs/DATA_CONVENTIONS.md`. Closest precedent is the FRED track (§8):
  `pipeline/fetch/fred.ts` (key from env or git-ignored `.env.local`, retry,
  key never logged), `fred-diff.ts` materiality rule, and
  `.github/workflows/indicators-freshness.yml` (weekly, opens a PR, never
  auto-merged). Zod 4 and `csv-parse` are already dependencies.
- No `.xlsx` parser is installed (`zod`, `csv-parse` only).

## National series

| Source | URL | Covers |
| --- | --- | --- |
| Annual goods and services, BOP basis | `https://www.census.gov/foreign-trade/statistics/historical/gands.xlsx` | 1960 through 2025, balance / exports / imports, total / goods BOP / services, $ millions |
| Annual goods, BOP vs Census basis | `.../historical/goods.xlsx` | 1960 through 2025 |
| Current monthly release | `.../Press-Release/current_press_release/exh1.xlsx` (also `ft900xlsx.zip`, 31 exhibits) | Only the current and prior year of monthly data |

**Monthly goods and services back to 1992: not found at Census.** The only
monthly G&S file located is the rolling press-release exhibit. The lead from
chat (a monthly series from 1992) was not confirmed as a Census download. The
Jan 1991 window therefore has two gaps for national goods and services: no
monthly series, and (if one is found) a likely 1992 start. Annual BOP data
covers 1991.

Monthly **goods only, Census basis**, is available from 1985 (see below).

## Country series (goods, Census basis)

`https://www.census.gov/foreign-trade/balance/country.xlsx` (1.9 MB, no key,
no auth). One sheet, 9,218 rows: `year, CTY_CODE, CTYNAME`, then monthly
imports `IJAN..IDEC`, `IYR`, monthly exports `EJAN..EDEC`, `EYR`. $ millions.

- Years 1985 through 2026. 2026 is partial; months not yet published are `0`,
  so "no data" and "true zero" are not distinguishable in the file. The
  transform needs a last-published-month rule.
- 263 distinct codes. About 81–84 rows per year for 1985–91, then 238–252
  per year from 1992.
- Codes include aggregates: `0003` European Union, `0004` World seasonally
  adjusted, `0005/0006/0021/0022` NAFTA/USMCA, `0007` Advanced Technology
  Products, `0009/0010/0012/0013/0014/0016/0018/0019` regions, `0015` World not
  seasonally adjusted, `0017` CAFTA-DR. Countries use 4-digit codes from `1010`
  upward (Canada `1220`, Mexico `2010`, China `5700`). Note: `0003` is only
  present from 1997.
- **1985–1991 has no World total row** (checked `0015`, `0004`). The national
  goods total for those years must be summed from countries or taken from the
  annual `goods.xlsx`.
- Spot check: `0015` for 1991 gives imports 488,453.1 and exports 421,730.0
  ($M), i.e. a goods deficit of about $66.7B, in line with the published
  figure. The 1985 BOP figure in the plan (−$121,879M) has **not** yet been
  checked against `gands.xlsx`.

The HS-level API (`timeseries/intltrade/{exports,imports}/hs`) is not needed
for country balances because this bulk file covers them without a key.

## Duties by country: the gate (resolved: free and automatable, but only from 2010-01)

- `https://api.census.gov/data/timeseries/intltrade/imports/hs` (free key, `CENSUS_API_KEY`;
  supplied by the project owner 2026-10-01, stored in `.env.local` and the repo secret).
  Variables: `CAL_DUT_MO` (calculated duty), `CON_VAL_MO` (imports for consumption, customs value),
  `CTY_CODE`, `CTY_NAME`. Whole dollars.
- **Country totals need no HS-level pull.** Omitting `COMM_LVL` and the commodity filter returns one
  row per country per month (about 250/month), plus an all-countries row (`CTY_CODE` `-`) and
  aggregates. One request per year (`time=from YYYY-01 to YYYY-12`) returns about 3,000 rows /
  150 KB; the whole history is 17 requests (about 40 s each, slow but small). No rate limit
  reached with a key.
- **Earliest month: 2010-01.** 2009-12 and earlier return HTTP 204 on the `hs`, `enduse`, `sitc`
  and `naics` import endpoints (checked at 1989-01 through 2009-12). Exports (`exports/hs`) also
  start 2010-01. The plan's gate ("a free, automatable source from about 1991") is therefore
  **not met**. Decision (project owner, 2026-10-01): build duties from 2010 only.
- Not probed (need accounts): USITC DataWeb (1989–present; Login.gov MFA, not unattended) and
  USA Trade Online.
- Latest month at fetch time: 2026-07. Spot check: China 2010-01 duties $851.7M on $25.25B.
- The API's aggregate codes use a different numbering than `country.xlsx` (`0021` is a
  different group), so the duties files carry countries only.

## Country codes

Schedule C, `https://www.census.gov/foreign-trade/schedules/c/country.txt` (code, name, ISO
alpha-2; the file is dated 31JAN14 but already lists Eswatini, South Sudan, Curacao, Sint
Maarten). It lacks dissolved codes and the `00xx` aggregates, which are classified by hand in
`trade.ts`. See `docs/TRADE_METHODOLOGY.md` for the full treatment.

## Decisions

1. **Key**: provided and installed (done).
2. **`.xlsx` parsing**: no new dependency; a small zip + XML reader (`pipeline/transform/xlsx.ts`,
   Node's `zlib`). `country.xlsx` is still needed: the API has nothing before 2010.
3. **Window**: starts 1991 (project owner). National monthly goods and services is not available at
   Census beyond the rolling release, so monthly national data is goods only; annual BOP goods and
   services covers 1991 onward.
4. **Duties**: from 2010-01 only.
