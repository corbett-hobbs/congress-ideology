import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { ENERGY_CATALOG, type EnergyCatalogEntry, type RawEnergySeries } from "../../lib/energy-entities";
import { statusFor } from "../transform/energy";
import { parseRawText } from "./eia-lib";

/**
 * Materiality check for the scheduled EIA refresh (see .github/workflows/energy-freshness.yml and
 * docs/ENERGY_METHODOLOGY.md).
 *
 *   tsx pipeline/fetch/energy-diff.ts <previous-dir> <new-dir> [summary.md]
 *
 * Compares observation values series by series:
 *   - a NEW observation (a period absent from the previous snapshot, with a real value) or a
 *     REMOVED one always counts as material;
 *   - a missing<->value flip always counts;
 *   - a revision to a FINAL observation (status per the series' rule, on the new snapshot) always
 *     counts, however small: final values are not supposed to move;
 *   - a revision to a PRELIMINARY observation counts only if |change| exceeds the series'
 *     `revision_tolerance` (about 1%, in the series' own units).
 * Every revision, material or not, is listed in the summary (largest first). Writes
 * `material=true|false` to $GITHUB_OUTPUT and the summary markdown to the third argument.
 */
export interface SeriesDiff {
  material: boolean;
  lines: string[];
}

const isMissing = (v: string | null) => v === null || !/^-?(\d+\.?\d*|\.\d+)$/.test(v.trim());

export function diffSeries(entry: EnergyCatalogEntry, prev: RawEnergySeries | null, next: RawEnergySeries): SeriesDiff {
  const id = entry.series_id;
  if (!prev) return { material: true, lines: [`- **${id}**: no previous snapshot, new series (${next.observations.length} rows)`] };
  const p = new Map(prev.observations);
  const n = new Map(next.observations);
  const real = next.observations.filter((o) => !isMissing(o[1])).map((o) => o[0]);
  const lastPeriod = real[real.length - 1] ?? next.observations[next.observations.length - 1][0];
  const lastDate = lastPeriod.length === 7 ? `${lastPeriod}-01` : lastPeriod;
  const added: string[] = [];
  const removed: string[] = [];
  const flipped: string[] = [];
  const revisions: { period: string; from: number; to: number; delta: number; final: boolean }[] = [];
  for (const [d, v] of n) {
    if (!p.has(d)) {
      if (!isMissing(v)) added.push(d);
      continue;
    }
    const pv = p.get(d)!;
    if (pv === v) continue;
    if (isMissing(pv) !== isMissing(v)) {
      flipped.push(`${d} (${pv} -> ${v})`);
      continue;
    }
    if (isMissing(pv) && isMissing(v)) continue;
    const date = d.length === 7 ? `${d}-01` : d;
    revisions.push({
      period: d,
      from: Number(pv),
      to: Number(v),
      delta: Number(v) - Number(pv),
      final: statusFor(entry.status_rule, date, lastDate, next.fetched_at) === "final",
    });
  }
  for (const [d, v] of p) if (!n.has(d) && !isMissing(v)) removed.push(d);

  const big = revisions.filter((r) => (r.final ? r.delta !== 0 : Math.abs(r.delta) > entry.revision_tolerance));
  const material = added.length > 0 || removed.length > 0 || flipped.length > 0 || big.length > 0;
  const lines: string[] = [];
  if (added.length || removed.length || flipped.length || revisions.length) {
    lines.push(`- **${id}**: ${added.length} new, ${removed.length} removed, ${flipped.length} missing<->value, ${revisions.length} revised (${big.length} material; tolerance ${entry.revision_tolerance} for preliminary values, none for final)`);
    if (added.length) lines.push(`  - new: ${added.slice(-5).join(", ")}${added.length > 5 ? ` ... (${added.length} total)` : ""}`);
    if (removed.length) lines.push(`  - removed: ${removed.join(", ")}`);
    if (flipped.length) lines.push(`  - missing<->value: ${flipped.join(", ")}`);
    const top = [...revisions].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 8);
    for (const r of top) {
      const isBig = big.includes(r);
      lines.push(`  - revised ${r.period} (${r.final ? "final" : "preliminary"}): ${r.from} -> ${r.to} (${r.delta >= 0 ? "+" : ""}${+r.delta.toFixed(5)})${isBig ? " **material**" : ""}`);
    }
    if (revisions.length > top.length) lines.push(`  - ... and ${revisions.length - top.length} smaller revisions`);
  }
  return { material, lines };
}

function main() {
  const [prevDir, newDir, summaryPath] = process.argv.slice(2);
  if (!prevDir || !newDir) throw new Error("usage: energy-diff <previous-dir> <new-dir> [summary.md]");
  const load = (dir: string, id: string) => {
    const f = `${dir}/${id}.json`;
    return existsSync(f) ? parseRawText(readFileSync(f, "utf8")) : null;
  };
  let material = false;
  const lines: string[] = [];
  for (const entry of ENERGY_CATALOG) {
    const next = load(newDir, entry.series_id);
    if (!next) throw new Error(`${newDir}/${entry.series_id}.json is missing or invalid`);
    const d = diffSeries(entry, load(prevDir, entry.series_id), next);
    material ||= d.material;
    lines.push(...d.lines);
  }
  const summary = `${lines.length ? lines.join("\n") : "No changes to any series."}\n`;
  console.log(summary);
  console.log(`material=${material}`);
  if (summaryPath) writeFileSync(summaryPath, summary);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `material=${material}\n`);
}

if (process.argv[1]?.endsWith("energy-diff.ts")) main();
