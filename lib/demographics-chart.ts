import type { BandTerm } from "../components/charts/TermBand";
import type { TermSegment } from "../components/charts/TermBandSvg";
import { fmtShare } from "./chart-bars";
import type { YearRange } from "./year-range";
import { initialsOf } from "./term-label";
import type { DemoCongress, DemoPresident } from "./demographics-types";

/** The years-shown slider runs 1933 to 2027 (the 119th Congress ends Jan 3, 2027). */
export const SLIDER_BOUNDS: YearRange = [1933, 2027];

/** A Congress is shown when the year it convened is inside the window. */
export function windowRows<T extends { year: number }>(rows: readonly T[], range: YearRange): T[] {
  return rows.filter((r) => r.year >= range[0] && r.year <= range[1]);
}

export function ordinal(n: number): string {
  const v = n % 100;
  const suffix = v >= 11 && v <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${n % 10 > 3 ? "th" : suffix}`;
}

export const presidentById = (presidents: readonly DemoPresident[]) => new Map(presidents.map((p) => [p.id, p]));

/** Term-band runs for the rows shown: one slot per Congress, the president in office on its first day. */
export function termSegmentsFor(rows: readonly DemoCongress[], presidents: readonly DemoPresident[]): TermSegment[] {
  const by = presidentById(presidents);
  const out: TermSegment[] = [];
  rows.forEach((r, i) => {
    const p = by.get(r.termId);
    if (!p) return;
    const prev = out[out.length - 1];
    if (prev && prev.id === p.id && prev.e === i - 1) prev.e = i;
    else out.push({ id: p.id, last: p.last, president: p.president, party: p.party, s: i, e: i });
  });
  return out;
}

/** The slider's term band: each president spans the years of the Congresses they opened (first convening year to its last second year). Presidents who opened none are left out. */
export function bandTerms(rows: readonly DemoCongress[], presidents: readonly DemoPresident[]): BandTerm[] {
  const by = presidentById(presidents);
  const out: BandTerm[] = [];
  for (const r of rows) {
    const p = by.get(r.termId);
    if (!p) continue;
    const prev = out[out.length - 1];
    if (prev && prev.id === p.id) prev.to = r.year + 1;
    else out.push({ id: p.id, label: `${p.president}`, last: p.last, initials: initialsOf(p.president), party: p.party, from: r.year, to: r.year + 1 });
  }
  return out;
}

/** "119th Congress, 2025–2026". */
export const congressSpan = (r: DemoCongress) => `${ordinal(r.congress)} Congress, ${r.year}–${r.year + 1}`;

/** An age or average age with no trailing ".0": 58, 50.5, 52.1. */
export const fmtAge = (v: number | null) => (v === null ? "n/a" : String(Number(v.toFixed(1))));
export const pct = (n: number, d: number) => fmtShare(d ? n / d : 0);

export type AgeMeasure = "median" | "average";
export type WomenMeasure = "share" | "count";

/** The latest row at or before the pin (or the last row shown): what the readout above a chart prints. */
export function readoutRow(rows: readonly DemoCongress[], pin: number | null): DemoCongress | null {
  if (rows.length === 0) return null;
  return rows.find((r) => r.congress === pin) ?? rows[rows.length - 1];
}
