import { mkdir, writeFile } from "node:fs/promises";
import { DATAWEB_RAW_DIR, dataWebRawPath, parseDataWebRaw, type DataWebRaw } from "./dataweb-duties-lib";

/**
 * ONE-TIME historical pull of calculated duties from USITC DataWeb, into
 * `pipeline/raw/dataweb-duties/<year>.json` (committed). NOT part of `fetch:all`
 * and NOT run by CI: 1993-2009 is frozen history; the Census API pipeline
 * (`census-trade.ts`) owns 2010 onward. See docs/TRADE_METHODOLOGY.md.
 *
 *   pnpm fetch:dataweb-duties            # 1993-2009
 *   pnpm fetch:dataweb-duties 1995 1996  # specific years
 *
 * Needs `DATAWEB_TOKEN` (an API key from a DataWeb account; valid six months),
 * read from the environment or the git-ignored `.env.local`. The token is never
 * logged or written. One query per year per kind (by country; all countries):
 * Imports for Consumption, measures Calculated Duties + Customs Value, all
 * commodities, monthly. Rate limit: DataWeb answers 429 under bursts; requests
 * are spaced and retried.
 */
const BASE = "https://datawebws.usitc.gov/dataweb";
export const FIRST_BRIDGE_YEAR = 1993;
export const LAST_BRIDGE_YEAR = 2009;
const MEASURES = ["CONS_CALC_DUTY", "CONS_CUSTOMS_VALUE"];

try {
  process.loadEnvFile(".env.local");
} catch {
  /* no .env.local */
}

function query(year: number, breakOutCountries: boolean) {
  return {
    savedQueryType: "",
    savedQueryID: "",
    savedQueryName: "",
    savedQueryDesc: "",
    isOwner: true,
    runMonthly: true,
    unitConversion: "0",
    manualConversions: [],
    reportOptions: { tradeType: "Import", classificationSystem: "HTS" },
    searchOptions: {
      MiscGroup: {
        districts: { aggregation: "Aggregate District", districtGroups: { userGroups: [] }, districts: [], districtsExpanded: [], districtsSelectType: "all" },
        importPrograms: { aggregation: null, importPrograms: [], programsSelectType: "all" },
        extImportPrograms: { aggregation: "Aggregate CSC", extImportPrograms: [], extImportProgramsExpanded: [], programsSelectType: "all" },
        provisionCodes: { aggregation: "Aggregate RPCODE", provisionCodesSelectType: "all", rateProvisionCodes: [], rateProvisionCodesExpanded: [], rateProvisionGroups: { systemGroups: [] } },
      },
      commodities: {
        aggregation: "Aggregate Commodities",
        codeDisplayFormat: "YES",
        commodities: [],
        commoditiesExpanded: [],
        commoditiesManual: "",
        commodityGroups: { systemGroups: [], userGroups: [] },
        commoditySelectType: "all",
        granularity: "2",
        groupGranularity: null,
        searchGranularity: null,
        showHTSValidDetails: false,
      },
      componentSettings: {
        dataToReport: MEASURES,
        scale: "1",
        timeframeSelectType: "fullYears",
        years: [String(year)],
        startDate: null,
        endDate: null,
        startMonth: null,
        endMonth: null,
        yearsTimeline: "Monthly",
      },
      countries: {
        aggregation: breakOutCountries ? "Break Out Countries" : "Aggregate Countries",
        countries: [],
        countriesExpanded: [],
        countriesSelectType: "all",
        countryGroups: { systemGroups: [], userGroups: [] },
      },
    },
    sortingAndDataFormat: {
      DataSort: { columnOrder: [], fullColumnOrder: [], sortOrder: [] },
      reportCustomizations: { exportCombineTables: false, totalRecords: "20000", exportRawData: false },
    },
    deletedCountryUserGroups: [],
    deletedCommodityUserGroups: [],
    deletedDistrictUserGroups: [],
  };
}

interface Report {
  dto?: { tables: { tableInfo: { dataToReportDesc: string }; row_groups: { rowsNew: { rowEntries: { value: string }[] }[] }[] }[] };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runReport(year: number, breakOut: boolean): Promise<string[][][]> {
  const token = process.env.DATAWEB_TOKEN;
  if (!token) throw new Error("DATAWEB_TOKEN is not set (put it in the environment or .env.local)");
  for (let attempt = 1; ; attempt++) {
    await sleep(8000);
    const res = await fetch(`${BASE}/api/v2/report2/runReport`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(query(year, breakOut)),
    });
    if (res.ok) {
      const body = (await res.json()) as Report;
      if (body.dto) {
        // One table per measure, in the order requested: [duties, customs value].
        const byDesc = new Map(body.dto.tables.map((t) => [t.tableInfo.dataToReportDesc, t]));
        const out = ["Calculated Duties", "Customs Value"].map((d) => {
          const t = byDesc.get(d);
          if (!t) throw new Error(`DataWeb ${year}: missing table "${d}" (got ${[...byDesc.keys()].join(", ")})`);
          return t.row_groups[0].rowsNew.map((r) => r.rowEntries.map((e) => e.value));
        });
        return out;
      }
    }
    // Never include the request or headers in the message: the token is in them.
    if (attempt >= 8 || (res.status < 500 && res.status !== 429 && res.status !== 307)) {
      throw new Error(`DataWeb runReport ${year} -> ${res.status} ${res.statusText}`);
    }
    await sleep(15000 * attempt);
  }
}

/** Census's name for each DataWeb country name whose spelling differs; filled from the unmatched report. */
const NAME_OVERRIDES: Record<string, string> = {};

async function nameToCode(): Promise<Map<string, string>> {
  const res = await fetch(`${BASE}/api/v2/country/getAllCountries`);
  if (!res.ok) throw new Error(`DataWeb getAllCountries -> ${res.status}`);
  const { options } = (await res.json()) as { options: { name: string; value: string }[] };
  return new Map(options.map((o) => [o.name.split(" - ")[0], o.value]));
}

const num = (s: string) => {
  const n = Number(s.replace(/,/g, ""));
  if (!Number.isInteger(n)) throw new Error(`non-integer DataWeb value "${s}"`);
  return String(n);
};

async function main() {
  const years = process.argv.slice(2).map(Number);
  if (!years.length) for (let y = FIRST_BRIDGE_YEAR; y <= LAST_BRIDGE_YEAR; y++) years.push(y);
  const codes = await nameToCode();
  await mkdir(DATAWEB_RAW_DIR, { recursive: true });
  const unmatched = new Set<string>();
  for (const year of years) {
    const [perD, perV] = await runReport(year, true);
    const [totD, totV] = await runReport(year, false);
    const valueOf = new Map(perV.map((r) => [r[0], r]));
    const rows: DataWebRaw["rows"] = [];
    // Per country: [Country, Year, Jan..Dec]; all-countries: [Year, Jan..Dec].
    for (const r of perD) {
      const name = r[0];
      const code = codes.get(NAME_OVERRIDES[name] ?? name);
      const v = valueOf.get(name);
      if (!v) throw new Error(`DataWeb ${year}: ${name} has duties but no customs value`);
      if (!code) {
        unmatched.add(name);
        continue;
      }
      for (let m = 0; m < 12; m++) rows.push([`${year}-${String(m + 1).padStart(2, "0")}`, code, name, num(r[2 + m]), num(v[2 + m])]);
    }
    for (let m = 0; m < 12; m++) rows.push([`${year}-${String(m + 1).padStart(2, "0")}`, "-", "TOTAL FOR ALL COUNTRIES", num(totD[0][1 + m]), num(totV[0][1 + m])]);
    if (unmatched.size) {
      console.log(`  ${year}: unmatched DataWeb names so far: ${[...unmatched].join(" | ")}`);
      continue; // do not write a half-mapped year
    }
    const raw = parseDataWebRaw({
      fetched_at: new Date().toISOString(),
      year,
      source: "usitc_dataweb",
      source_url: "https://dataweb.usitc.gov/",
      api: `${BASE}/api/v2/report2/runReport`,
      query: {
        trade_flow: "Imports for Consumption",
        measures: ["Calculated Duties", "Customs Value"],
        commodities: "all, aggregated",
        timeframe: `${year} monthly`,
        country_views: ["Break Out Countries", "Aggregate Countries (all)"],
        scale: "actual dollars",
      },
      run_by: "pipeline/fetch/dataweb-duties.ts (Claude Code session, project-owner API token)",
      rows,
    });
    await writeFile(dataWebRawPath(year), JSON.stringify(raw) + "\n");
    console.log(`  dataweb duties ${year}: ${rows.length} rows`);
  }
  if (unmatched.size) {
    console.error(`\nUnmatched DataWeb country names (add to NAME_OVERRIDES): ${[...unmatched].join(" | ")}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
