import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { CATALOG } from "../../lib/indicator-entities";
import { parseRawText } from "./fred-lib";

/**
 * Materiality check for the scheduled FRED refresh (see
 * .github/workflows/indicators-freshness.yml and docs/INDICATORS_METHODOLOGY.md).
 *
 *   tsx pipeline/fetch/fred-diff.ts <previous-dir> <new-dir> [summary.md]
 *
 * Compares observation values series by series:
 *   - a NEW observation (a date absent from the previous snapshot, with a real
 *     value) or a REMOVED one always counts as material;
 *   - a REVISION to an existing value counts only if |change| exceeds that
 *     series' `revision_tolerance` (in the series' own units);
 *   - a value that flips between "." (missing) and a number counts as material.
 * Every revision, material or not, is listed in the summary (largest first) so
 * none is silently dropped. Writes `material=true|false` to $GITHUB_OUTPUT and
 * the summary markdown to the third argument.
 */
const [prevDir, newDir, summaryPath] = process.argv.slice(2);
if (!prevDir || !newDir) throw new Error("usage: fred-diff <previous-dir> <new-dir> [summary.md]");

const load = (dir: string, id: string) => {
  const f = `${dir}/${id}.json`;
  return existsSync(f) ? parseRawText(readFileSync(f, "utf8")) : null;
};

let material = false;
const lines: string[] = [];
for (const { series_id: id, revision_tolerance: tol } of CATALOG) {
  const prev = load(prevDir, id);
  const next = load(newDir, id);
  if (!next) throw new Error(`${newDir}/${id}.json is missing or invalid`);
  if (!prev) {
    material = true;
    lines.push(`- **${id}**: no previous snapshot — new series (${next.observations.length} observations)`);
    continue;
  }
  const p = new Map(prev.observations);
  const n = new Map(next.observations);
  const added: string[] = [];
  const removed: string[] = [];
  const flipped: string[] = [];
  const revisions: { date: string; from: number; to: number; delta: number }[] = [];
  for (const [d, v] of n) {
    if (!p.has(d)) {
      if (v !== ".") added.push(d);
      continue;
    }
    const pv = p.get(d)!;
    if (pv === v) continue;
    if (pv === "." || v === ".") {
      flipped.push(`${d} (${pv} → ${v})`);
      continue;
    }
    revisions.push({ date: d, from: Number(pv), to: Number(v), delta: Number(v) - Number(pv) });
  }
  for (const [d, v] of p) if (!n.has(d) && v !== ".") removed.push(d);

  const big = revisions.filter((r) => Math.abs(r.delta) > tol);
  if (added.length || removed.length || flipped.length || big.length) material = true;

  if (added.length || removed.length || flipped.length || revisions.length) {
    lines.push(`- **${id}** — ${added.length} new, ${removed.length} removed, ${flipped.length} missing↔value, ${revisions.length} revised (${big.length} above tolerance ${tol})`);
    if (added.length) lines.push(`  - new: ${added.slice(-5).join(", ")}${added.length > 5 ? ` … (${added.length} total)` : ""}`);
    if (removed.length) lines.push(`  - removed: ${removed.join(", ")}`);
    if (flipped.length) lines.push(`  - missing↔value: ${flipped.join(", ")}`);
    const top = [...revisions].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 8);
    for (const r of top) lines.push(`  - revised ${r.date}: ${r.from} → ${r.to} (${r.delta >= 0 ? "+" : ""}${+r.delta.toFixed(5)})${Math.abs(r.delta) > tol ? " **above tolerance**" : ""}`);
    if (revisions.length > top.length) lines.push(`  - … and ${revisions.length - top.length} smaller revisions`);
  }
}

const summary = `${lines.length ? lines.join("\n") : "No changes to any series."}\n`;
console.log(summary);
console.log(`material=${material}`);
if (summaryPath) writeFileSync(summaryPath, summary);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `material=${material}\n`);
