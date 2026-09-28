import { partyMedians, SERIES_YEARS, type WealthMember } from "./wealth-derive";

/** One year's point on the party-median chart. `null` medians break the line
 *  (no Democrat/Republican with usable data that year). */
export interface PartyChartPoint {
  year: number;
  dem: number | null;
  demCount: number;
  rep: number | null;
  repCount: number;
}

/** Median net worth by caucus for every year 2013–2025, over `members`. */
export function partyChartSeries(members: WealthMember[]): PartyChartPoint[] {
  return SERIES_YEARS.map((year) => {
    const { dem, rep } = partyMedians(members, year);
    return {
      year,
      dem: dem.median,
      demCount: dem.count,
      rep: rep.median,
      repCount: rep.count,
    };
  });
}

/** `[min, max]` non-zero sample size across every year's series — the
 *  footnote's "Sample per year: N–M". `null` if every year is empty. */
export function sampleRange(
  series: readonly PartyChartPoint[],
  key: "demCount" | "repCount",
): [number, number] | null {
  const counts = series.map((p) => p[key]).filter((n) => n > 0);
  if (counts.length === 0) return null;
  return [Math.min(...counts), Math.max(...counts)];
}
