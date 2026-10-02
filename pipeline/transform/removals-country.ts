import type { RemovalsCountryReport, RemovalsCountryRow } from "../../lib/removals-country-entities";
import { resolveCountry, type CountryIndex } from "./removals-country-names";
import { RemovalsCountryError, parseCountryTable, type CountrySourceSpec } from "./removals-country-parse";

/**
 * ICE removals by country of citizenship (pure; the runner reads the files). Every country table
 * ICE publishes is read, each fiscal year takes its rows from ONE document (`primary`), and the
 * build fails unless:
 *   1. the rows of each table sum to the "Total" ICE prints in that table;
 *   2. the rows of each year sum to that year's value in `enforcement_series.json` (zero tolerance);
 *   3. every other ICE document that prints the same year agrees country by country.
 * Nothing is borrowed from DHS/OHSS yearbooks or CBP, and a year without an ICE country table is
 * absent (FY2013: top 10 only; FY2025: no document), never filled.
 */

const DATA_RUN = {
  2014: "2014-10-05",
  2015: "2015-10-04",
  2016: "2016-10-04",
  2017: "2017-10-09",
  2018: "2018-10-08",
  2019: "2019-10-06",
  2020: "2020-10-04",
  // FY2021-23 are "locked and remain static" in the FY2024 report, which is current through Sep 30, 2024.
  2021: "2024-09-30",
  2022: "2024-09-30",
  2023: "2024-09-30",
  2024: "2024-09-30",
} as const;
const asOf = (years: readonly number[]) => Object.fromEntries(years.map((y) => [y, DATA_RUN[y as keyof typeof DATA_RUN]]));

export interface CountryTableSpec extends CountrySourceSpec {
  /** Fiscal years whose rows are taken from this document. The rest are cross-checks only. */
  primary: readonly number[];
}

export const COUNTRY_TABLES: readonly CountryTableSpec[] = [
  { source: "ice-immigration-removals-fy2014", start: /III\. Appendix A: FY 2014 Removals by Citizenship/, end: /Appendix B: Methodology/, years: [2014], layout: "columns", primary: [2014], as_of: asOf([2014]) },
  { source: "ice-ero-report-fy2015", start: /Appendix C: FY 2015 Removals by Citizenship/, end: /Appendix D:/, years: [2015], layout: "columns", primary: [2015], as_of: asOf([2015]) },
  { source: "ice-removal-statistics-2017", start: /Appendix B: FY2016 and FY2017 Removals by Country of Citizenship/, end: /Other Year-End Reports/, years: [2016, 2017], layout: "stacked", primary: [2016, 2017], as_of: asOf([2016, 2017]) },
  { source: "ice-ero-report-fy2018", start: /Appendix B: FY2017 and FY2018 Removals by Country of Citizenship/, years: [2017, 2018], layout: "columns", primary: [2018], as_of: asOf([2017, 2018]) },
  { source: "ice-ero-report-fy2019", start: /Table 3: FY 2018 – FY 2019 ICE Removals by Country of Citizenship/, years: [2018, 2019], layout: "columns", primary: [2019], as_of: asOf([2018, 2019]) },
  { source: "ice-ero-report-fy2020", start: /Table X: FY 2018 – FY 2020 ICE Removals by Country of Citizenship/, years: [2018, 2019, 2020], layout: "columns", primary: [2020], as_of: asOf([2018, 2019, 2020]) },
  { source: "ice-annual-report-fy2024", start: /FY 2019 – FY 2024 YTD ICE Removals by Country of Citizenship/, years: [2019, 2020, 2021, 2022, 2023, 2024], layout: "columns", primary: [2021, 2022, 2023, 2024], as_of: asOf([2019, 2020, 2021, 2022, 2023, 2024]) },
];

/** Years in the national series that have no ICE country table, with the reason shown in the report. */
export const UNCOVERED: Readonly<Record<number, string>> = {
  2013: "ICE's FY2013 report prints only the top ten countries.",
  2025: "ICE has published no country table for FY2025 (no annual report; the statistics dashboards have no export).",
};

export interface BuiltRemovalsByCountry {
  rows: RemovalsCountryRow[];
  report: RemovalsCountryReport;
}

interface YearTable {
  source: string;
  fiscal_year: number;
  total: number;
  /** country_key -> removals, names merged. */
  byKey: Map<string, { removals: number; ice_names: string[]; display: string; wrapped: boolean }>;
  zeroDropped: number;
}

function readYears(spec: CountryTableSpec, text: string, index: CountryIndex): YearTable[] {
  const t = parseCountryTable(text, spec);
  return spec.years.map((fy, col) => {
    const sum = t.rows.reduce((a, r) => a + r.values[col], 0);
    if (sum !== t.total[col]) {
      throw new RemovalsCountryError(`${spec.source} FY${fy}: country rows sum to ${sum.toLocaleString("en-US")} but the table prints a Total of ${t.total[col].toLocaleString("en-US")}`);
    }
    const byKey: YearTable["byKey"] = new Map();
    let zeroDropped = 0;
    for (const r of t.rows) {
      const v = r.values[col];
      if (v === 0) {
        zeroDropped++;
        continue;
      }
      const c = resolveCountry(r.name, index);
      const cur = byKey.get(c.country_key);
      if (cur) {
        cur.removals += v;
        cur.ice_names.push(r.name);
      } else byKey.set(c.country_key, { removals: v, ice_names: [r.name], display: c.display_name, wrapped: false });
      if (r.wrapped) byKey.get(c.country_key)!.wrapped = true;
    }
    return { source: spec.source, fiscal_year: fy, total: t.total[col], byKey, zeroDropped };
  });
}

export function buildRemovalsByCountry(args: {
  /** Text extracts keyed by catalog source id. */
  texts: ReadonlyMap<string, string>;
  index: CountryIndex;
  /** `enforcement_series.json`: fiscal year -> removals. */
  national: ReadonlyMap<number, number>;
}): BuiltRemovalsByCountry {
  const { texts, index, national } = args;
  const years = new Map<number, YearTable[]>();
  const specFor = new Map<string, CountryTableSpec>();
  for (const spec of COUNTRY_TABLES) {
    specFor.set(spec.source, spec);
    const text = texts.get(spec.source);
    if (text === undefined) throw new RemovalsCountryError(`${spec.source}: text extract missing (run pnpm fetch:ice)`);
    for (const yt of readYears(spec, text, index)) years.set(yt.fiscal_year, [...(years.get(yt.fiscal_year) ?? []), yt]);
  }

  const rows: RemovalsCountryRow[] = [];
  const perYear: RemovalsCountryReport["fiscal_years"] = [];
  for (const fy of [...years.keys()].sort((a, b) => a - b)) {
    const tables = years.get(fy)!;
    const primary = tables.find((t) => specFor.get(t.source)!.primary.includes(fy));
    if (!primary) throw new RemovalsCountryError(`FY${fy}: no document is marked primary`);
    const nat = national.get(fy);
    if (nat === undefined) throw new RemovalsCountryError(`FY${fy}: country table exists but enforcement_series.json has no national total`);
    const sum = [...primary.byKey.values()].reduce((a, c) => a + c.removals, 0);
    if (sum !== nat) {
      throw new RemovalsCountryError(`FY${fy}: country rows (${primary.source}) sum to ${sum.toLocaleString("en-US")} but the national ICE series says ${nat.toLocaleString("en-US")}`);
    }
    // Other ICE documents printing the same year must agree country by country (ICE has not restated these).
    for (const other of tables) {
      if (other === primary) continue;
      const diffs: string[] = [];
      for (const k of new Set([...primary.byKey.keys(), ...other.byKey.keys()])) {
        const a = primary.byKey.get(k)?.removals ?? 0;
        const b = other.byKey.get(k)?.removals ?? 0;
        if (a !== b) diffs.push(`${k}: ${a} vs ${b}`);
      }
      if (diffs.length) throw new RemovalsCountryError(`FY${fy}: ${primary.source} and ${other.source} disagree for ${diffs.length} countries (${diffs.slice(0, 5).join("; ")})`);
    }
    const asOfDate = specFor.get(primary.source)!.as_of[fy];
    let review = 0;
    for (const [key, c] of [...primary.byKey].sort((a, b) => b[1].removals - a[1].removals || a[0].localeCompare(b[0]))) {
      const needs = c.wrapped || c.ice_names.length > 1;
      if (needs) review++;
      rows.push({
        fiscal_year: fy,
        country_key: key,
        country_name: c.display,
        ice_name: c.ice_names.join(" + "),
        removals: c.removals,
        source_doc: primary.source,
        as_of: asOfDate,
        parse_confidence: needs ? "review" : "high",
        needs_review: needs,
      });
    }
    perYear.push({
      fiscal_year: fy,
      source_doc: primary.source,
      as_of: asOfDate,
      rows: primary.byKey.size,
      zero_rows_dropped: primary.zeroDropped,
      sum,
      printed_total: primary.total,
      national_total: nat,
      other_documents: tables.filter((t) => t !== primary).map((t) => t.source),
      needs_review_rows: review,
    });
  }

  const fys = perYear.map((p) => p.fiscal_year);
  for (let fy = fys[0]; fy <= fys[fys.length - 1]; fy++) {
    if (!years.has(fy)) throw new RemovalsCountryError(`FY${fy} falls inside the covered range but has no country table`);
  }
  const uncovered = Object.entries(UNCOVERED).map(([fy, reason]) => ({ fiscal_year: Number(fy), reason }));
  for (const u of uncovered) {
    if (years.has(u.fiscal_year)) throw new RemovalsCountryError(`FY${u.fiscal_year} is listed as uncovered but a table now exists: update UNCOVERED`);
  }
  return {
    rows,
    report: { first_fiscal_year: fys[0], last_fiscal_year: fys[fys.length - 1], fiscal_years: perYear, uncovered_fiscal_years: uncovered },
  };
}
