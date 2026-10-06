import aliasJson from "./troops-location-aliases.json";
import {
  BRANCH_FIELDS,
  TroopsDataError,
  aliasTable,
  periodMeta,
  troopsMeta,
  troopsRow,
  type AliasEntry,
  type BranchField,
  type PeriodMeta,
  type TroopsMeta,
  type TroopsRow,
} from "../../lib/troops-entities";
import type { Cell, Cells, ParsedFile, ParsedRow } from "./troops-location-parse";

export const ALIASES: AliasEntry[] = aliasTable.parse(aliasJson);

/** G2: U.S. territories sit inside DMDC's overseas section but are not hosts. Explicit and tested; not inferred. */
export const TERRITORY_SOURCES = ["AMERICAN SAMOA", "GUAM", "NORTHERN MARIANA ISLANDS", "PUERTO RICO", "VIRGIN ISLANDS, U.S."] as const;

/**
 * Gate 2: Σ overseas row totals − printed OVERSEAS TOTAL is 0 or exactly this. A period listed here must show exactly
 * this gap (not 0, not another number). Reasons are from docs/TROOPS_PREFLIGHT.md §2 A7.
 */
export const OVERSEAS_EXCEPTIONS: Record<string, { gap: number; reason: string }> = {
  "2013-09": { gap: 8, reason: "ZIMBABWE is printed twice (8 troops each); the printed total counts one." },
  "2017-12": { gap: 612, reason: "Rows exceed the printed total; not explained by the file (branch columns differ by up to -998 Army / +1,191 Navy)." },
  "2020-12": { gap: -534, reason: "Printed total exceeds the rows: blank starred rows are still counted in it (almost all Marine Corps)." },
  "2021-03": { gap: -495, reason: "Printed total exceeds the rows: blank starred rows are still counted in it (almost all Marine Corps)." },
  "2021-06": { gap: -427, reason: "Printed total exceeds the rows: blank starred rows are still counted in it (almost all Marine Corps)." },
  "2021-09": { gap: -189, reason: "Printed total exceeds the rows: blank starred rows are still counted in it (almost all Marine Corps)." },
  "2022-06": { gap: -329, reason: "Rows' TOTAL column differs from their branch sum for many hosts; the branch columns reconcile." },
  "2024-09": { gap: -11, reason: "Printed total exceeds the rows (Army -3, Marine Corps -8); unexplained by the file." },
};

/** Periods whose Army column (and so every Total column) is N/A: "Army did not provide military personnel data". */
export const ARMY_NOT_REPORTED = ["2022-12", "2023-03", "2023-06"] as const;

/**
 * Gate 3 exception: printed GRAND TOTAL − (printed U.S. + printed overseas). Mar 2017's grand total is a stale copy of
 * Dec 2016's. Documented, not fixed. `gap` is checked exactly when this entry exists.
 */
export const GRAND_EXCEPTIONS: Record<string, { gap: number; reason: string }> = {
  "2017-03": { gap: -3062, reason: "Printed GRAND TOTAL (1,315,609) is a stale copy of Dec 2016's, not U.S. + overseas." },
};

/** First period with permanently-assigned-only counting (the Dec 2017 break). */
export const BREAK_FIRST_PERIOD = "2017-12";
const CONTINGENCY_HOSTS = ["AFGHANISTAN", "IRAQ", "SYRIA"] as const;
/** Gate 5: the first period in which each contingency host's row is gone for good. Afghanistan goes at Sep 2023; Iraq and Syria print 0 in Sep 2023 and go after it. */
const EXPECTED_FIRST_PERIOD_WITHOUT_ROW: Record<(typeof CONTINGENCY_HOSTS)[number], string> = { AFGHANISTAN: "2023-09", IRAQ: "2023-12", SYRIA: "2023-12" };
export const SPACE_FORCE_SEPARATE_FROM = "2023-09";

export interface PeriodInput {
  /** `YYYY-MM`, from the file name. */
  period: string;
  file: string;
  parsed: ParsedFile;
}

const aliasBySource = new Map(ALIASES.map((a) => [a.source, a]));

export function resolveName(source: string): { entry: AliasEntry | null } {
  return { entry: aliasBySource.get(source) ?? null };
}

const val = (c: Cell | undefined): number | null => (c?.kind === "value" ? c.n : null);
const isNum = (c: Cell | undefined): c is { kind: "value"; n: number } => c?.kind === "value";

function printedRecord(c: Cells): PeriodMeta["printed"]["overseas_total"] {
  return Object.fromEntries(BRANCH_FIELDS.filter((f) => c[f]).map((f) => [f, val(c[f])])) as PeriodMeta["printed"]["overseas_total"];
}

const lastDayOk = (asOf: string, period: string) => asOf.slice(0, 7) === period;

function toRow(period: string, r: ParsedRow, entry: AliasEntry | null, sourceName: string): TroopsRow {
  const total = r.cells.total;
  const state = r.starred || total?.kind === "suppressed" ? "suppressed" : total?.kind === "na" ? "null" : "value";
  const pick = (f: BranchField) => (state === "suppressed" ? null : val(r.cells[f]));
  return {
    period,
    name: entry?.name ?? sourceName,
    source_name: sourceName,
    class: entry?.class ?? "host",
    iso3: entry?.iso3 ?? null,
    state,
    army: pick("army"),
    navy: pick("navy"),
    marine_corps: pick("marine_corps"),
    air_force: pick("air_force"),
    space_force: pick("space_force"),
    coast_guard: pick("coast_guard"),
    total: pick("total"),
  };
}

export interface BuildResult {
  rows: TroopsRow[];
  meta: TroopsMeta;
  /** Anything worth a human glance that is not a failure. */
  notes: { unmapped_zero_troop: { period: string; source_name: string }[]; branch_gaps_when_total_unreadable: { period: string; gaps: Partial<Record<BranchField, number>> }[] };
}

/**
 * Build the flat series and run every gate. Collects all gate failures and throws one `TroopsDataError` listing them.
 * Pure: no clock, no I/O, so two runs over the same inputs are byte-identical.
 */
export function buildTroops(inputs: PeriodInput[]): BuildResult {
  const errors: string[] = [];
  const fail = (m: string) => errors.push(m);
  const sorted = [...inputs].sort((a, b) => a.period.localeCompare(b.period));
  if (new Set(sorted.map((i) => i.period)).size !== sorted.length) throw new TroopsDataError("two inputs for one period");

  const rows: TroopsRow[] = [];
  const periods: PeriodMeta[] = [];
  const notes: BuildResult["notes"] = { unmapped_zero_troop: [], branch_gaps_when_total_unreadable: [] };
  const hostFirstLast = new Map<string, { last: string }>();

  for (const inp of sorted) {
    const { period, parsed: p } = inp;
    // Gate 1: the file's own "As of" date is the filename's period.
    if (!lastDayOk(p.asOf, period)) fail(`${period}: file says "As of ${p.asOf}" but the file name is ${period}`);

    const army = p.printed.overseas.army;
    const armyNa = army?.kind === "na";
    const totalNa = p.printed.overseas.total?.kind === "na";
    const armyDeclared = (ARMY_NOT_REPORTED as readonly string[]).includes(period);
    if (armyDeclared !== (armyNa && totalNa)) fail(`${period}: Army/Total N/A state (${armyNa && totalNa}) disagrees with the documented list (${armyDeclared})`);
    const untestable = armyNa || totalNa;

    const os = p.rows.filter((r) => r.section === "overseas");
    const us = p.rows.filter((r) => r.section === "us");
    const rowTotal = (r: ParsedRow) => (isNum(r.cells.total) ? r.cells.total.n : 0); // suppressed counts as 0 in a sum, but is never emitted as 0

    // Gate 2 (overseas) and gate 3 (U.S., grand).
    let overseasGap: number | null = null;
    let usGap: number | null = null;
    let grandGap: number | null = null;
    let gate: PeriodMeta["overseas_gate"] = "untestable";
    if (!untestable) {
      const printedOs = val(p.printed.overseas.total);
      const printedUs = val(p.printed.us.total);
      const printedGrand = val(p.printed.grand.total);
      if (printedOs === null || printedUs === null || printedGrand === null) fail(`${period}: a printed total is not a number`);
      else {
        overseasGap = os.reduce((s, r) => s + rowTotal(r), 0) - printedOs;
        usGap = us.reduce((s, r) => s + rowTotal(r), 0) - printedUs;
        grandGap = printedGrand - (printedUs + printedOs);
        const ex = OVERSEAS_EXCEPTIONS[period];
        if (ex) {
          gate = "documented_exception";
          if (overseasGap !== ex.gap) fail(`${period}: overseas gap ${overseasGap} but the documented exception is ${ex.gap}`);
        } else {
          gate = "exact";
          if (overseasGap !== 0) fail(`${period}: Σ overseas rows − printed OVERSEAS TOTAL = ${overseasGap} (no documented exception)`);
        }
        if (usGap !== 0) fail(`${period}: Σ U.S. rows − printed UNITED STATES TOTAL = ${usGap}`);
        const gx = GRAND_EXCEPTIONS[period];
        if (grandGap !== (gx ? gx.gap : 0)) fail(`${period}: printed GRAND TOTAL − (U.S. + overseas) = ${grandGap}${gx ? `, documented ${gx.gap}` : ""}`);
      }
    } else {
      if (OVERSEAS_EXCEPTIONS[period]) fail(`${period}: untestable period also listed as an overseas exception`);
      // Army/Total are N/A, but the other branch columns still reconcile (Jun 2023: −2 Marine Corps, −1 Air Force).
      const gaps: Partial<Record<BranchField, number>> = {};
      for (const f of ["navy", "marine_corps", "air_force", "coast_guard"] as const) {
        const pr = val(p.printed.overseas[f]);
        if (pr === null) continue;
        gaps[f] = os.reduce((s, r) => s + (val(r.cells[f]) ?? 0), 0) - pr;
      }
      notes.branch_gaps_when_total_unreadable.push({ period, gaps });
    }

    // Names, classes, duplicates.
    const emitted = new Map<string, TroopsRow>();
    const dups: PeriodMeta["duplicate_rows_dropped"] = [];
    for (const r of os) {
      const { entry } = resolveName(r.name);
      const troops = BRANCH_FIELDS.some((f) => (val(r.cells[f]) ?? 0) >= 1);
      if (!entry && troops) fail(`${period}: unmapped name ${JSON.stringify(r.name)} carries troops and is not in the alias table`);
      if (!entry && !troops) notes.unmapped_zero_troop.push({ period, source_name: r.name });
      // A starred row is emitted as suppressed with every count null; refuse to do that to a real positive count.
      if (r.starred && troops) fail(`${period}: starred row ${r.name} carries a positive count; it would be hidden`);
      const row = toRow(period, r, entry, r.name);
      const key = row.name;
      const prev = emitted.get(key);
      if (prev) {
        if (prev.source_name === row.source_name) {
          dups.push({ source_name: r.name, total: row.total ?? 0 });
          continue;
        }
        // Legacy/successor labels for one place printed side by side (Germany + "Germany, Federal Republic of",
        // Montenegro + "Montenegro (2006 - 2008)"): fold into one row by summing.
        if (prev.state !== row.state || row.state === "suppressed" || prev.class !== row.class || prev.iso3 !== row.iso3) {
          fail(`${period}: "${prev.source_name}" and "${row.source_name}" both fold to "${key}" but cannot be summed`);
          continue;
        }
        const add = (a: number | null, b: number | null) => (a === null && b === null ? null : (a ?? 0) + (b ?? 0));
        emitted.set(key, {
          ...prev,
          source_name: `${prev.source_name} + ${row.source_name}`,
          army: add(prev.army, row.army),
          navy: add(prev.navy, row.navy),
          marine_corps: add(prev.marine_corps, row.marine_corps),
          air_force: add(prev.air_force, row.air_force),
          space_force: add(prev.space_force, row.space_force),
          coast_guard: add(prev.coast_guard, row.coast_guard),
          total: add(prev.total, row.total),
        });
        continue;
      }
      emitted.set(key, row);
    }
    // The only dropped duplicate allowed is the documented Sep 2013 ZIMBABWE row.
    for (const d of dups) if (!(period === "2013-09" && d.source_name === "ZIMBABWE")) fail(`${period}: duplicate row ${d.source_name} is not documented`);
    if (period === "2013-09" && !dups.some((d) => d.source_name === "ZIMBABWE")) fail("2013-09: the documented duplicate ZIMBABWE row is missing");

    // Territories: the explicit list, and nothing else, may carry class territory.
    for (const r of emitted.values()) {
      const isTerr = (TERRITORY_SOURCES as readonly string[]).includes(r.source_name);
      if (isTerr !== (r.class === "territory")) fail(`${period}: ${r.source_name} territory classification disagrees with the explicit territory list`);
    }
    const sumClass = (c: TroopsRow["class"]) => [...emitted.values()].filter((r) => r.class === c).reduce((s, r) => s + (r.total ?? 0), 0);
    const territoryTotal = untestable ? null : sumClass("territory");
    const afloatTotal = untestable ? null : sumClass("afloat_unassigned");
    const printedOs = val(p.printed.overseas.total);
    const abroad = territoryTotal !== null && printedOs !== null ? printedOs - territoryTotal : null;
    if (abroad !== null && abroad < 0) fail(`${period}: abroad total is negative (${abroad})`);

    const suppressed = [...emitted.values()].filter((r) => r.state === "suppressed").map((r) => r.name);
    const flags: string[] = [];
    if (period >= "2021-12" && period <= "2023-06") flags.push("space_force_merged_into_air_force");
    if (untestable) flags.push("army_not_reported", "overseas_gate_untestable", "abroad_total_not_emitted");
    if (period < BREAK_FIRST_PERIOD) flags.push("includes_deployed_forces");
    if (period === BREAK_FIRST_PERIOD) flags.push("series_break_permanent_assignment_only");
    if (suppressed.length) flags.push("suppressed_rows");
    if (dups.length) flags.push("duplicate_row_dropped");
    if (OVERSEAS_EXCEPTIONS[period]) flags.push("overseas_total_exception");
    if (GRAND_EXCEPTIONS[period]) flags.push("grand_total_exception");

    for (const h of CONTINGENCY_HOSTS) if (emitted.has(titleCase(h))) hostFirstLast.set(h, { last: period });
    if (period >= "2023-12") for (const h of CONTINGENCY_HOSTS) if (emitted.has(titleCase(h))) fail(`${period}: ${h} row is back after its documented removal`);

    const spaceForce: PeriodMeta["space_force"] = p.spaceForce;
    periods.push(
      periodMeta.parse({
        period,
        as_of: p.asOf,
        file: inp.file,
        space_force: spaceForce,
        army_not_reported: armyNa,
        basis: period < BREAK_FIRST_PERIOD ? "includes_deployed" : "permanently_assigned",
        printed: { united_states_total: printedRecord(p.printed.us), overseas_total: printedRecord(p.printed.overseas), grand_total: printedRecord(p.printed.grand) },
        overseas_gap: overseasGap,
        overseas_gate: gate,
        us_gap: usGap,
        grand_gap: grandGap,
        duplicate_rows_dropped: dups,
        suppressed_rows: suppressed,
        territory_total: territoryTotal,
        afloat_unassigned_total: afloatTotal,
        abroad_total: untestable ? null : abroad,
        flags,
      }),
    );
    rows.push(...emitted.values());
  }

  // Gate 5: the Dec 2017 break and the Afghanistan/Iraq/Syria removal are explicit, and match the data.
  const notReported = periods
    .filter((pm) => CONTINGENCY_HOSTS.every((h) => rows.some((r) => r.period === pm.period && r.source_name === h && r.state === "suppressed")))
    .map((pm) => pm.period);
  const expectedNotReported = periods.map((pm) => pm.period).filter((p) => p >= BREAK_FIRST_PERIOD && p <= "2021-09");
  if (JSON.stringify(notReported) !== JSON.stringify(expectedNotReported)) fail(`Afghanistan/Iraq/Syria suppressed in [${notReported.join(",")}], expected exactly [${expectedNotReported.join(",")}]`);
  const allPeriods = periods.map((p) => p.period);
  const removalHosts = CONTINGENCY_HOSTS.map((h) => {
    const last = hostFirstLast.get(h)?.last ?? null;
    if (!last) throw new TroopsDataError(`${h} never appears`);
    const next = allPeriods[allPeriods.indexOf(last) + 1] ?? null;
    return { name: titleCase(h), last_row_period: last, first_period_without_rows: next };
  });
  for (const h of removalHosts) {
    const want = EXPECTED_FIRST_PERIOD_WITHOUT_ROW[h.name.toUpperCase() as (typeof CONTINGENCY_HOSTS)[number]];
    if (h.first_period_without_rows !== want) fail(`${h.name}: first period without a row is ${h.first_period_without_rows}, expected ${want}`);
  }

  if (errors.length) throw new TroopsDataError(`troop-location gates failed:\n  - ${errors.join("\n  - ")}`);

  const merged = periods.filter((p) => p.space_force === "merged_into_air_force").map((p) => p.period);
  const abroadOmitted = periods.filter((p) => p.abroad_total === null).map((p) => p.period);
  const latest = periods[periods.length - 1];
  const meta = troopsMeta.parse({
    source: "U.S. Department of Defense, Defense Manpower Data Center (DMDC), Military and Civilian Personnel by Service/Agency by State/Country (Updated Quarterly): location report, active-duty columns only",
    source_url: "https://dwp.dmdc.osd.mil/dwp/app/dod-data-reports/workforce-reports",
    periods_covered: allPeriods,
    first_period: periods[0].period,
    latest_period: latest.period,
    data_through: latest.as_of,
    break: {
      first_period_after: BREAK_FIRST_PERIOD,
      before: "Sep 2008–Sep 2017: counts include personnel deployed in support of contingency operations (the source lists the CTS Deployment File).",
      after: "Dec 2017 onward: permanently assigned personnel only; temporary duty and contingency deployments are not included. Overseas active duty fell 215,249 → 161,927 between Sep and Dec 2017 while the U.S. total rose, a reallocation, not a withdrawal. Series are not like-for-like across this break.",
      evidence: "Dec 2017 table footnote: does not include personnel on temporary duty; Sep 2017 sources list the CTS Deployment File and Dec 2017 does not.",
      contingency_hosts_not_reported: [...CONTINGENCY_HOSTS].map(titleCase),
      not_reported_periods: expectedNotReported,
    },
    removal: {
      hosts: removalHosts,
      note: "Afghanistan has no row from Sep 2023; Iraq and Syria print 0 in Sep 2023 and have no row from Dec 2023. An absent row is not a zero.",
    },
    space_force: {
      merged_periods: merged,
      separate_from: SPACE_FORCE_SEPARATE_FROM,
      note: "Space Force is folded into the Air Force column (header AIR FORCE/SPACE FORCE) Dec 2021–Jun 2023 and has its own column from Sep 2023. Not split; air_force is not comparable across Sep 2023 and space_force is null before it.",
    },
    army_not_reported_periods: [...ARMY_NOT_REPORTED],
    territories: [...TERRITORY_SOURCES],
    exceptions: [
      ...Object.entries(OVERSEAS_EXCEPTIONS).map(([period, e]) => ({ period, gate: "overseas" as const, gap: e.gap, reason: e.reason })),
      ...Object.entries(GRAND_EXCEPTIONS).map(([period, e]) => ({ period, gate: "grand" as const, gap: e.gap, reason: e.reason })),
    ],
    derived: {
      abroad_definition: "abroad_total = printed OVERSEAS TOTAL − Σ territory rows (American Samoa, Guam, Northern Mariana Islands, Puerto Rico, U.S. Virgin Islands). Includes afloat_unassigned rows.",
      abroad_omitted_periods: abroadOmitted,
      abroad_omitted_reason: "Army reported N/A in Dec 2022, Mar 2023 and Jun 2023, so the printed totals are N/A and no like-for-like abroad figure exists.",
    },
    periods,
  });
  for (const r of rows) troopsRow.parse(r);
  rows.sort((a, b) => a.period.localeCompare(b.period) || a.name.localeCompare(b.name));
  return { rows, meta, notes };
}

function titleCase(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}
