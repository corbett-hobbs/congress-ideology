import aliasJson from "./troops-history-aliases.json";
import {
  TroopsDataError,
  historyAliasTable,
  historyMeta,
  historyRow,
  type HistoryAliasEntry,
  type HistoryMeta,
  type HistoryRow,
  type HistoryYearMeta,
} from "../../lib/troops-entities";

/**
 * The 1950-2007 backfill of the troops-abroad track. Two sources, each used where it is the better one:
 *
 *  - DMDC's own 309A tables (pipeline/reference/dmdc-309a-sep.csv, extracted from the DMDC M01/M05 PDFs): Sep 1996 and
 *    Sep 1998-2005. Public domain, and the only source with afloat/undistributed and with 2003-04 (troopdata has no
 *    Sep 2003 or Sep 2004 host figures at all).
 *  - troopdata's quarter-format file (GPL-3.0, cited): 1950-1956 (June), 1957-1995, Sep 1997 and Sep 2006-07 (flagged
 *    estimates). Where both sources cover a year, troopdata is a gate, not a source.
 *
 * Pure: no clock, no I/O. Collects every gate failure and throws one `TroopsDataError`.
 */
export const ALIASES: HistoryAliasEntry[] = historyAliasTable.parse(aliasJson);
const aliasKey = (system: string, source: string) => `${system}|${source}`;
const aliasMap = new Map(ALIASES.map((a) => [aliasKey(a.system, a.source), a]));

export interface TroopdataRow {
  year: number;
  month: string;
  countryname: string;
  source: string;
  troops_ad: number | null;
  army_ad: number | null;
  navy_ad: number | null;
  air_force_ad: number | null;
  marine_corps_ad: number | null;
}
export interface ReferenceRow {
  year: number;
  seq: number;
  name: string;
  total: number;
  army: number;
  navy: number;
  marine_corps: number;
  air_force: number;
}

/** Years with a DMDC 309A Sep 30 table in the reference extract. Sep 1995 (xls) and Sep 1997 (none online) are not in it. */
export const DMDC_YEARS = [1996, 1998, 1999, 2000, 2001, 2002, 2003, 2004, 2005] as const;
/** Years troopdata has no usable host rows for although DMDC has a table; the gate asserts exactly this. */
export const TROOPDATA_EMPTY_YEARS = [2003, 2004] as const;
export const FIRST_YEAR = 1950;
export const LAST_YEAR = 2007;
/** 1951-52 are model-imputed in troopdata (source "Stepwise Imputation"), not reported, so they are left out. */
export const IMPUTED_YEARS = [1951, 1952] as const;
/** Sep 2006-07 are not on DMDC's site; troopdata fills them from compiled and press figures (Iraq 141,100 and 170,000, Kuwait 44,400 and 48,500). */
export const ESTIMATE_YEARS = [2006, 2007] as const;
/** Figures the 309A tables print as unavailable or "see OIF/Deployment table" with a 0. Never emitted as 0. */
const UNAVAILABLE = /\((?:See OIF Table|not available|in\/around not available|See Deployment Section)\)/i;
const NOT_US_DOMESTIC_SKIP = new Set(["Continental United States (CONUS)", "Alaska", "Hawaii", "Transients"]);
const AGGREGATE = /^(Total\b|Ashore$|Afloat$|NATO Countries|Forward Deployment|Northeast Asia Troop)/;
/** Hosts with this many people in a DMDC table must agree exactly with troopdata (the reconciliation gate). */
export const RECONCILE_MIN = 1000;
/**
 * Documented reconciliation exceptions: troopdata has no row (its Yugoslavia row is source NA) for what DMDC prints as
 * "Serbia (includes Kosovo)", the NATO Kosovo force. DMDC's table is the source for these years, so nothing is lost.
 */
export const RECONCILE_EXCEPTIONS: Record<string, readonly number[]> = { Serbia: [1999, 2000, 2001, 2002, 2005] };
const AFLOAT_NAME = "Afloat / unassigned";

export interface HistoryBuild {
  rows: HistoryRow[];
  meta: HistoryMeta;
  notes: { troopdata_unmapped_zero: string[]; reconcile: { year: number; checked: number; exact: number; documented_exceptions: number }[] };
}

const snapshotOf = (year: number): "june" | "september" => (year <= 1956 ? "june" : "september");

export function buildHistory(troopdata: readonly TroopdataRow[], reference: readonly ReferenceRow[], troopdataCommit: string): HistoryBuild {
  const errors: string[] = [];
  const fail = (m: string) => errors.push(m);
  const rows: HistoryRow[] = [];
  const years: HistoryYearMeta[] = [];
  const notes: HistoryBuild["notes"] = { troopdata_unmapped_zero: [], reconcile: [] };
  const dmdc = new Set<number>(DMDC_YEARS);

  const refByYear = new Map<number, ReferenceRow[]>();
  for (const r of reference) (refByYear.get(r.year) ?? refByYear.set(r.year, []).get(r.year)!).push(r);
  for (const y of DMDC_YEARS) if (!refByYear.has(y)) fail(`${y}: no DMDC 309A reference rows`);

  /** Fold same-year rows that share a canonical name (Vietnam/South Vietnam never overlap; Germany/FRG style labels can). */
  const put = (acc: Map<string, HistoryRow>, row: HistoryRow, year: number) => {
    const prev = acc.get(row.name);
    if (!prev) return void acc.set(row.name, row);
    if (prev.source_name === row.source_name || prev.state !== "value" || row.state !== "value") {
      fail(`${year}: duplicate ${row.name} (${prev.source_name} / ${row.source_name})`);
      return;
    }
    const add = (a: number | null, b: number | null) => (a === null && b === null ? null : (a ?? 0) + (b ?? 0));
    acc.set(row.name, { ...prev, source_name: `${prev.source_name} + ${row.source_name}`, army: add(prev.army, row.army), navy: add(prev.navy, row.navy), marine_corps: add(prev.marine_corps, row.marine_corps), air_force: add(prev.air_force, row.air_force), total: add(prev.total, row.total) });
  };

  // ---- DMDC 309A years ---------------------------------------------------------------------------------------------
  const dmdcHostTotals = new Map<number, Map<string, number>>();
  for (const year of DMDC_YEARS) {
    const rs = (refByYear.get(year) ?? []).slice().sort((a, b) => a.seq - b.seq);
    const iUs = rs.findIndex((r) => /^Total - U\. ?S\.|^Total - United States/.test(r.name));
    const iFor = rs.findIndex((r) => /^Total - Foreign Countries/.test(r.name));
    if (iUs < 0 || iFor < 0 || iFor < iUs) {
      fail(`${year}: 309A table structure not found (U.S. total ${iUs}, foreign total ${iFor})`);
      continue;
    }
    const acc = new Map<string, HistoryRow>();
    const mk = (r: ReferenceRow, entry: HistoryAliasEntry): HistoryRow => {
      const missing = UNAVAILABLE.test(r.name);
      return {
        year,
        snapshot: "september",
        name: entry.name,
        source_name: r.name.replace(/^\*+/, ""),
        class: entry.class,
        iso3: entry.iso3,
        state: missing ? "suppressed" : "value",
        army: missing ? null : r.army,
        navy: missing ? null : r.navy,
        marine_corps: missing ? null : r.marine_corps,
        air_force: missing ? null : r.air_force,
        total: missing ? null : r.total,
        source: "dmdc_309a",
        quality: "reported",
      };
    };
    const lookup = (r: ReferenceRow) => aliasMap.get(aliasKey("dmdc_309a", r.name));
    const territoryRows: HistoryRow[] = [];

    // U.S. and territories section: only the territories and the special locations that 2008+ tables treat as places.
    for (const r of rs.slice(0, iUs)) {
      if (NOT_US_DOMESTIC_SKIP.has(r.name) || AGGREGATE.test(r.name)) continue;
      const e = lookup(r);
      if (!e) {
        if (r.total >= 1) fail(`${year}: unmapped name ${JSON.stringify(r.name)} (${r.total}) in the U.S. section`);
        continue;
      }
      const row = mk(r, e);
      if (e.class === "territory") territoryRows.push(row);
      else put(acc, row, year);
    }

    // Foreign section.
    let hostSum = 0;
    let afloat = 0;
    let undist = 0;
    let regionSum = 0;
    let prevName = "";
    for (const r of rs.slice(iUs + 1, iFor)) {
      const n = r.name;
      if (/^Total - Undistributed/.test(n)) undist = r.total;
      else if (/^Total - /.test(n)) regionSum += r.total;
      else if (n === "Ashore") {
        // Undistributed ashore: counted in "Total - Undistributed" below, not a host.
      } else if (n === "Afloat") {
        if (prevName !== "Ashore") afloat += r.total; // an Afloat directly after Ashore belongs to Undistributed
      } else if (AGGREGATE.test(n)) {
        /* NATO / Pacific groupings are overlapping summaries, not places */
      } else {
        const e = lookup(r);
        if (!e) {
          if (r.total >= 1) fail(`${year}: unmapped name ${JSON.stringify(n)} (${r.total})`);
        } else {
          const row = mk(r, e);
          if (e.class === "territory") territoryRows.push(row);
          else {
            put(acc, row, year);
            hostSum += r.total;
          }
        }
      }
      prevName = n;
    }
    const printedForeign = rs[iFor].total;
    // Gate: every printed foreign total is the sum of its host rows, regional afloat and undistributed; the regional totals agree too.
    if (hostSum + afloat + undist !== printedForeign) fail(`${year}: Σ foreign rows ${hostSum + afloat + undist} − printed foreign total ${printedForeign} = ${hostSum + afloat + undist - printedForeign}`);
    if (regionSum + undist !== printedForeign) fail(`${year}: Σ region totals + undistributed ${regionSum + undist} − printed foreign total ${printedForeign}`);
    const afloatTotal = afloat + undist;
    acc.set(AFLOAT_NAME, { year, snapshot: "september", name: AFLOAT_NAME, source_name: "Afloat (by region) + Undistributed", class: "afloat_unassigned", iso3: null, state: "value", army: null, navy: null, marine_corps: null, air_force: null, total: afloatTotal, source: "dmdc_309a", quality: "reported" });
    const hostRows = [...acc.values()];
    for (const t of territoryRows) put(acc, t, year);
    rows.push(...acc.values());
    const hostMap = new Map<string, number>();
    for (const r of hostRows) if (r.class === "host" && r.total !== null) hostMap.set(r.name, r.total);
    dmdcHostTotals.set(year, hostMap);
    const sumHostsOnly = hostRows.filter((r) => r.class === "host").reduce((s, r) => s + (r.total ?? 0), 0);
    const flags: string[] = [];
    const suppressed = hostRows.filter((r) => r.state === "suppressed").map((r) => r.name);
    if (suppressed.length) flags.push("contingency_hosts_not_reported");
    if (year === 2003 || year === 2004) flags.push("printed_total_excludes_oif_deployed");
    years.push({
      year,
      snapshot: "september",
      source: "dmdc_309a",
      quality: "reported",
      hosts: hostRows.filter((r) => r.class === "host" && r.state === "value").length,
      abroad_total: sumHostsOnly + afloatTotal,
      afloat_unassigned_total: afloatTotal,
      territory_total: territoryRows.reduce((s, r) => s + (r.total ?? 0), 0),
      dmdc_foreign_total: printedForeign,
      suppressed,
      flags,
    });
  }

  // ---- troopdata years ----------------------------------------------------------------------------------------------
  const tdByYear = new Map<number, TroopdataRow[]>();
  for (const r of troopdata) {
    const keep = r.year >= FIRST_YEAR && r.year <= LAST_YEAR && r.month === (snapshotOf(r.year) === "june" ? "June" : "September");
    if (!keep) continue;
    (tdByYear.get(r.year) ?? tdByYear.set(r.year, []).get(r.year)!).push(r);
  }
  const imputed = new Set<number>(IMPUTED_YEARS);
  for (const year of [...tdByYear.keys()].sort((a, b) => a - b)) {
    const all = tdByYear.get(year)!;
    // Every row of an imputed year is "Stepwise Imputation": not a report.
    if (imputed.has(year)) {
      if (!all.every((r) => /^Stepwise/i.test(r.source))) fail(`${year}: expected an all-imputed year`);
      continue;
    }
    if (all.some((r) => /^Stepwise/i.test(r.source))) fail(`${year}: unexpected imputed rows outside ${IMPUTED_YEARS.join(", ")}`);
    const acc = new Map<string, HistoryRow>();
    const territoryRows: HistoryRow[] = [];
    const estimate = (ESTIMATE_YEARS as readonly number[]).includes(year);
    const unstamped: string[] = [];
    for (const r of all) {
      if (r.countryname === "United States") continue; // CONUS only
      // source "NA" with 0 troops is a host absent from that year's report. A positive figure with source "NA" is real (the
      // South Vietnam war years, 1957-74: troopdata does not stamp them) and is kept, flagged on the year.
      if (r.source === "NA" && (r.troops_ad ?? 0) === 0) continue;
      if (r.source === "NA") unstamped.push(r.countryname);
      const e = aliasMap.get(aliasKey("troopdata", r.countryname));
      const troops = [r.troops_ad, r.army_ad, r.navy_ad, r.air_force_ad, r.marine_corps_ad].some((v) => (v ?? 0) >= 1);
      if (!e) {
        if (troops) fail(`${year}: unmapped troopdata name ${JSON.stringify(r.countryname)}`);
        else notes.troopdata_unmapped_zero.push(`${year} ${r.countryname}`);
        continue;
      }
      if (r.troops_ad === null) {
        fail(`${year}: ${r.countryname} has a source but no troops_ad`);
        continue;
      }
      const row: HistoryRow = {
        year,
        snapshot: snapshotOf(year),
        name: e.name,
        source_name: r.countryname,
        class: e.class,
        iso3: e.iso3,
        state: "value",
        army: r.army_ad,
        navy: r.navy_ad,
        marine_corps: r.marine_corps_ad,
        air_force: r.air_force_ad,
        total: r.troops_ad,
        source: "troopdata",
        quality: estimate ? "estimate" : "reported",
      };
      if (dmdc.has(year)) {
        // Reconciliation only: remember it, do not emit (DMDC's own table is the source for this year).
        if (e.class === "host") put(acc, row, year);
        continue;
      }
      if (e.class === "territory") territoryRows.push(row);
      else put(acc, row, year);
    }
    if (dmdc.has(year)) {
      // Gate 2: troopdata and DMDC agree exactly on every host DMDC puts at RECONCILE_MIN people or more.
      const ref = dmdcHostTotals.get(year);
      if (!ref) continue;
      if ((TROOPDATA_EMPTY_YEARS as readonly number[]).includes(year)) {
        // troopdata has no Sep 2003 or Sep 2004 figure for any large host (Germany, Japan, Korea, Italy, UK, ... are 0 with source NA).
        // It does carry a Kuwait press estimate (47,000) where DMDC prints the row as "See OIF Table"; DMDC's table is used.
        const present = [...ref].filter(([name, v]) => v >= RECONCILE_MIN && (acc.get(name)?.total ?? 0) > 0).map(([name]) => name);
        if (present.length) fail(`${year}: troopdata was expected to be empty for hosts of ${RECONCILE_MIN}+ but has ${present.join(", ")}`);
        notes.reconcile.push({ year, checked: 0, exact: 0, documented_exceptions: 0 });
        continue;
      }
      let checked = 0;
      let exact = 0;
      let exceptions = 0;
      for (const [name, v] of ref) {
        if (v < RECONCILE_MIN) continue;
        checked++;
        const t = acc.get(name)?.total;
        if (t === v) exact++;
        else if (t === undefined && RECONCILE_EXCEPTIONS[name]?.includes(year)) exceptions++;
        else fail(`${year}: ${name} DMDC ${v} vs troopdata ${t ?? "absent"}`);
      }
      notes.reconcile.push({ year, checked, exact, documented_exceptions: exceptions });
      continue;
    }
    // troopdata-only year.
    const hostRows = [...acc.values()];
    for (const t of territoryRows) put(acc, t, year);
    rows.push(...acc.values());
    const flags = ["no_afloat_or_undistributed_rows"];
    if (estimate) flags.push("estimate_year_not_published_by_dmdc");
    if (year === 1997) flags.push("no_dmdc_table_online");
    if (snapshotOf(year) === "june") flags.push("june_snapshot");
    if (unstamped.length) flags.push(`unstamped_source: ${unstamped.join(", ")}`);
    years.push({
      year,
      snapshot: snapshotOf(year),
      source: "troopdata",
      quality: estimate ? "estimate" : "reported",
      hosts: hostRows.filter((r) => r.class === "host").length,
      abroad_total: hostRows.reduce((s, r) => s + (r.total ?? 0), 0),
      afloat_unassigned_total: null,
      territory_total: territoryRows.reduce((s, r) => s + (r.total ?? 0), 0),
      dmdc_foreign_total: null,
      suppressed: [],
      flags,
    });
  }

  // Spot gates: the big three hosts exist in every year they were large, and the year set is exactly as documented.
  const yearSet = years.map((y) => y.year).sort((a, b) => a - b);
  const expected = [1950, ...range(1953, 2007)];
  if (JSON.stringify(yearSet) !== JSON.stringify(expected)) fail(`years covered ${yearSet.join(",")} differ from the documented set (1950, 1953-2007)`);
  for (const y of years) {
    const present = new Set(rows.filter((r) => r.year === y.year).map((r) => r.name));
    for (const big of ["Germany", "Japan"]) if (!present.has(big)) fail(`${y.year}: ${big} missing`);
  }
  // The 2003-05 contingency hosts must be "not reported" in every DMDC year that prints them as unavailable.
  for (const y of [2003, 2004, 2005]) {
    for (const h of ["Iraq", "Kuwait", "Afghanistan"]) {
      const r = rows.find((x) => x.year === y && x.name === h);
      if (!r || r.state !== "suppressed" || r.total !== null) fail(`${y}: ${h} must be a suppressed (not reported) row`);
    }
  }
  for (const r of rows) {
    if (r.year >= 2006 && r.quality !== "estimate") fail(`${r.year}: ${r.name} is not flagged as an estimate`);
    if (r.year < 2006 && r.quality !== "reported") fail(`${r.year}: ${r.name} is wrongly flagged ${r.quality}`);
  }

  if (errors.length) throw new TroopsDataError(`troops history gates failed:\n  - ${errors.join("\n  - ")}`);

  rows.sort((a, b) => a.year - b.year || a.name.localeCompare(b.name));
  years.sort((a, b) => a.year - b.year);
  for (const r of rows) historyRow.parse(r);

  const meta = historyMeta.parse({
    source:
      "Allen, Flynn and Martinez Machain (2022), troopdata (quarter-format file; compiled from DMDC by Kane 2005), and U.S. Department of Defense, DMDC, Worldwide Manpower Distribution by Geographical Area: Active Duty Military Personnel Strengths by Regional Area and by Country (309A), Sep 30 tables",
    credits: [
      "troopdata: Allen, Flynn and Martinez Machain (2022), Conflict Management and Peace Science 39(3): 351-370. GPL-3.0; LICENSE.md is committed beside the raw file.",
      "Kane (2005), Global U.S. Troop Deployment, 1950-2003, Heritage Foundation technical report (the original compilation from DMDC).",
      "DMDC 309A tables: U.S. Department of Defense publications, public domain.",
    ],
    first_year: FIRST_YEAR,
    last_year: LAST_YEAR,
    handoff: "From Sep 2008 the series is troops_location.json (DMDC location tables). Sep 2008 is the first year there; this file ends at Sep 2007.",
    comparability: [
      "Sep 1996 and Sep 1998-2005 are DMDC's own 309A tables (active duty). Their foreign total includes afloat and undistributed personnel, as the 2008+ location tables' UNKNOWN row does; the rows here are class afloat_unassigned.",
      "1950-1995, Sep 1997 and Sep 2006-07 come from troopdata, which has no afloat or undistributed rows: its abroad_total is lower than a DMDC-style total by that amount (tens of thousands of people in the 1990s-2000s), so do not draw one unbroken line across 1995/1996 or 2007/2008 without saying so.",
      "The DMDC 2003-04 tables exclude personnel deployed to Operation Iraqi Freedom from the country rows (printed 'Less OIF'); Iraq, Kuwait and Afghanistan are not reported (never 0) in 2003, 2004 and 2005. 2001-02 Afghanistan is likewise unavailable where the table says so.",
      "Before 2008 the counts include personnel deployed to contingencies, as the 2008-Sep 2017 location tables do; the Dec 2017 permanent-assignment break is after this series ends.",
      "troopdata's 'United States' row is the continental U.S. only and is not emitted. Territories (Guam, Puerto Rico, U.S. Virgin Islands, American Samoa, Northern Mariana Islands) are class territory, as in the location series.",
      "Branch columns are Army, Navy, Marine Corps and Air Force; the 309A tables have no Coast Guard or Space Force.",
    ],
    gaps: [
      { years: [...IMPUTED_YEARS], reason: "troopdata fills 1951-52 by stepwise imputation, not from a report; left out rather than shipped as data. The series has June 1950 and then June 1953." },
    ],
    substitutions: [
      { year: 1997, note: "DMDC has no Sep 1997 table online (M05 starts Dec 1997); troopdata's Sep 1997 rows are used, flagged no_dmdc_table_online." },
      { year: 1995, note: "DMDC's Sep 1995 309A is an .xls the reference extract does not read; troopdata's Sep 1995 rows (the same DMDC report) are used." },
      { year: 2006, note: "No DMDC table for Sep 2006 or Sep 2007: troopdata's rows are used and every row is flagged estimate (Iraq 141,100 and 170,000, Kuwait 44,400 and 48,500 are press-based)." },
    ],
    dmdc_years: [...DMDC_YEARS],
    troopdata_commit: troopdataCommit,
    years,
  });
  return { rows, meta, notes };
}

function range(a: number, b: number) {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}
