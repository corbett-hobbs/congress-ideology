import type { RemovalsCountryReport, RemovalsCountryRow } from "./removals-country-entities";
import type { RemovalsCountryPayload, RemovalsCountryRef, RemovalsCountryYear } from "./removals-country-types";

/**
 * Pure shaping for the "Who gets removed" card (no I/O; the reader is `lib/removals-country-data.ts`).
 * Rows and report come from `pipeline/output/removals_by_country*.json`; the change from the prior
 * fiscal year is computed here and is null where the prior year has no ICE country table.
 */

export interface SourceRef {
  id: string;
  title: string;
  url: string;
}

export function buildRemovalsCountryPayload(
  rows: readonly RemovalsCountryRow[],
  report: RemovalsCountryReport,
  sources: readonly SourceRef[],
): RemovalsCountryPayload {
  const fail = (msg: string): never => {
    throw new Error(`removals-by-country invariant: ${msg}`);
  };
  if (rows.length === 0) fail("no rows");
  const names = new Map<string, string>();
  for (const r of rows) {
    const prior = names.get(r.country_key);
    if (prior !== undefined && prior !== r.country_name) fail(`${r.country_key} has two display names: "${prior}" and "${r.country_name}"`);
    names.set(r.country_key, r.country_name);
  }
  const countries: RemovalsCountryRef[] = [...names]
    .map(([key, name]) => ({ key, name }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
  const index = new Map(countries.map((c, i) => [c.key, i]));
  const sourceById = new Map(sources.map((s) => [s.id, s]));

  const byYear = new Map<number, RemovalsCountryRow[]>();
  for (const r of rows) byYear.set(r.fiscal_year, [...(byYear.get(r.fiscal_year) ?? []), r]);
  const fys = [...byYear.keys()].sort((a, b) => a - b);
  fys.forEach((fy, i) => {
    if (fy !== fys[0] + i) fail(`fiscal years not contiguous at FY${fy}`);
  });

  const years: RemovalsCountryYear[] = fys.map((fy) => {
    const list = byYear.get(fy)!;
    const meta = report.fiscal_years.find((y) => y.fiscal_year === fy);
    if (!meta) return fail(`FY${fy} missing from the report`);
    const total = list.reduce((a, r) => a + r.removals, 0);
    if (total !== meta.national_total) fail(`FY${fy} rows sum to ${total}, the national total is ${meta.national_total}`);
    const src = sourceById.get(list[0].source_doc);
    if (!src) return fail(`FY${fy} cites unknown source ${list[0].source_doc}`);
    const prior = byYear.get(fy - 1);
    const priorBy = prior ? new Map(prior.map((r) => [r.country_key, r.removals])) : null;
    return {
      fy,
      total,
      asOf: list[0].as_of,
      source: src.title,
      sourceUrl: src.url,
      rows: [...list]
        .sort((a, b) => b.removals - a.removals || a.country_name.localeCompare(b.country_name))
        .map((r): [number, number, number | null] => [index.get(r.country_key)!, r.removals, priorBy ? r.removals - (priorBy.get(r.country_key) ?? 0) : null]),
    };
  });
  return { countries, years, uncovered: report.uncovered_fiscal_years.map((u) => ({ fy: u.fiscal_year, reason: u.reason })) };
}

export type RemovalsSortKey = "total" | "change" | "name";

/** A first click on a key sorts this way; clicking the active key again reverses it. */
export const DEFAULT_DESC: Record<RemovalsSortKey, boolean> = { total: true, change: true, name: false };

export interface RankedRemoval {
  ci: number;
  removals: number;
  change: number | null;
  /** 1-based rank by removals, ties broken by name (independent of the displayed sort). */
  rank: number;
}

export function rankYear(year: RemovalsCountryYear): RankedRemoval[] {
  return year.rows.map(([ci, removals, change], i) => ({ ci, removals, change, rank: i + 1 }));
}

export function sortRanked(
  ranked: readonly RankedRemoval[],
  names: readonly RemovalsCountryRef[],
  key: RemovalsSortKey,
  reversed: boolean,
): RankedRemoval[] {
  const cmp: Record<RemovalsSortKey, (a: RankedRemoval, b: RankedRemoval) => number> = {
    total: (a, b) => a.removals - b.removals || a.rank - b.rank,
    change: (a, b) => (a.change ?? 0) - (b.change ?? 0) || a.rank - b.rank,
    name: (a, b) => names[a.ci].name.localeCompare(names[b.ci].name),
  };
  const out = [...ranked].sort(cmp[key]);
  return DEFAULT_DESC[key] !== reversed ? out.reverse() : out;
}

/** "▲ 1,204", "▼ 310", or "–" for no change or no comparison. */
export function formatChange(change: number | null): string {
  if (change === null || change === 0) return "–";
  return `${change > 0 ? "▲" : "▼"} ${Math.abs(change).toLocaleString("en-US")}`;
}

/** Fiscal years the FY control offers: the covered years, narrowed to the selected administration's. */
export function selectableYears(payload: RemovalsCountryPayload, termFys: ReadonlySet<number> | null): number[] {
  return payload.years.map((y) => y.fy).filter((fy) => termFys === null || termFys.has(fy));
}

/** "FY2014–FY2024" */
export const coverageLabel = (payload: RemovalsCountryPayload) => `FY${payload.years[0].fy}–FY${payload.years[payload.years.length - 1].fy}`;
