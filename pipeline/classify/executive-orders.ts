import { readFileSync, existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import {
  EO_TOPICS,
  type EoTopic,
  type EoTopicCacheEntry,
} from "../../lib/executive-orders-entities";
import { CACHE, oneRowPerLine, readCache, readRaw } from "../transform/executive-orders-run";
import { inheritanceParents, normalizeRaw, parseNotes } from "../transform/executive-orders";

/**
 * Maintains the committed classification cache (`pipeline/classification/
 * eo_topics.json`). NOT part of `pnpm transform` / CI — classification is a
 * reviewed, committed artifact, never recomputed at build time.
 *
 *   pnpm classify:eos                       inherit parent topics for new amending/revoking
 *                                           EOs, then list EOs still without a topic
 *   pnpm classify:eos -- --labels FILE...   also record topic labels for the remaining EOs
 *                                           (method "model"). FILE holds whitespace-separated
 *                                           tokens `<eo_number><code>`, e.g. `14431I 14430N`.
 *
 * Codes: G government_operations, E economy_labor, T trade, N energy_environment,
 * H health_education, I immigration_justice, F foreign_policy, S national_security, O other.
 *
 * Existing cache entries are never overwritten. An amending/revoking EO whose
 * parent is outside the data (pre-1994) cannot inherit: it is classified from
 * its own title and flagged `needs_review`.
 */
const CODES: Record<string, EoTopic> = {
  G: "government_operations",
  E: "economy_labor",
  T: "trade",
  N: "energy_environment",
  H: "health_education",
  I: "immigration_justice",
  F: "foreign_policy",
  S: "national_security",
  O: "other",
};
if (Object.values(CODES).join() !== [...EO_TOPICS].join()) throw new Error("CODES out of sync with EO_TOPICS");

function readLabels(files: string[]): Map<number, EoTopic> {
  const labels = new Map<number, EoTopic>();
  for (const file of files) {
    for (const tok of readFileSync(file, "utf8").split(/\s+/).filter(Boolean)) {
      const m = /^(\d{5})([A-Z])$/.exec(tok);
      if (!m || !CODES[m[2]]) throw new Error(`${file}: bad label token ${JSON.stringify(tok)}`);
      labels.set(Number(m[1]), CODES[m[2]]);
    }
  }
  return labels;
}

const args = process.argv.slice(2).filter((a) => a !== "--");
const li = args.indexOf("--labels");
const labels = li >= 0 ? readLabels(args.slice(li + 1)) : new Map<number, EoTopic>();

const cache = existsSync(CACHE) ? await readCache() : new Map<number, EoTopicCacheEntry>();
const { rows } = normalizeRaw(await readRaw());
const byNumber = new Set(rows.map((r) => r.eo_number));
let inherited = 0;
let modelled = 0;
const missing: number[] = [];

for (const r of rows) {
  if (cache.has(r.eo_number)) continue;
  const { amends, revokes } = parseNotes(r.executive_order_notes);
  const parents = inheritanceParents({ title: r.title, amends, revokes }).filter(
    (p) => p < r.eo_number && byNumber.has(p) && cache.has(p),
  );
  if (parents.length > 0) {
    const topics = new Set(parents.map((p) => cache.get(p)!.topic));
    cache.set(r.eo_number, {
      eo_number: r.eo_number,
      topic: cache.get(parents[0])!.topic,
      topic_method: "parent-inherit",
      parent: parents[0],
      needs_review: topics.size > 1,
    });
    inherited++;
    continue;
  }
  const label = labels.get(r.eo_number);
  if (label) {
    const pointer = inheritanceParents({ title: r.title, amends, revokes }).length > 0;
    cache.set(r.eo_number, { eo_number: r.eo_number, topic: label, topic_method: "model", needs_review: pointer });
    modelled++;
    continue;
  }
  missing.push(r.eo_number);
}

const out = [...cache.values()].sort((a, b) => a.eo_number - b.eo_number);
await writeFile(CACHE, oneRowPerLine(out));
console.log(`classify:eos  ${out.length} cached (+${inherited} parent-inherit, +${modelled} model)`);
if (missing.length > 0) {
  console.log(`${missing.length} executive order(s) still need a topic:`);
  const title = new Map(rows.map((r) => [r.eo_number, r.title]));
  for (const n of missing) console.log(`  ${n}  ${title.get(n)}`);
  process.exitCode = 1;
}
