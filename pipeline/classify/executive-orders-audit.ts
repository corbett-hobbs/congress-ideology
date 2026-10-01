import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { EO_TOPIC_LABELS, executiveOrder } from "../../lib/executive-orders-entities";

/**
 * Writes `docs/eo-topic-audit.csv`: a seeded random sample of 100 classified
 * EOs for HUMAN review. The `reviewer_verdict` / `reviewer_topic` columns are
 * blank on purpose — nobody (least of all the classifier) has validated these
 * labels yet. Refuses to overwrite an existing file (a reviewer may have
 * filled it in); pass --force to regenerate.
 *
 *   pnpm classify:audit
 */
const OUT = "docs/eo-topic-audit.csv";
const SAMPLE = 100;
const SEED = 20260930;

if (existsSync(OUT) && !process.argv.includes("--force")) {
  console.error(`${OUT} already exists (it may hold reviewer verdicts). Re-run with --force to regenerate.`);
  process.exit(1);
}

const rows = (JSON.parse(await readFile("pipeline/output/executive_orders.json", "utf8")) as unknown[]).map((r) => executiveOrder.parse(r));

// mulberry32 — deterministic, so the sample is reproducible.
let a = SEED;
const rnd = () => {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pool = [...rows];
for (let i = pool.length - 1; i > 0; i--) {
  const j = Math.floor(rnd() * (i + 1));
  [pool[i], pool[j]] = [pool[j], pool[i]];
}
const sample = pool.slice(0, SAMPLE).sort((x, y) => x.eo_number - y.eo_number);

const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
const header = [
  "eo_number", "signing_date", "title", "agencies", "assigned_topic", "topic_method", "needs_review",
  "federal_register_url", "reviewer_verdict (agree / disagree)", "reviewer_topic (if disagree)", "reviewer_notes",
];
const lines = [header.join(",")];
for (const r of sample) {
  lines.push([
    r.eo_number, r.signing_date, q(r.title), q(r.agencies.join("; ")), q(EO_TOPIC_LABELS[r.topic]), r.topic_method, r.needs_review,
    `https://www.federalregister.gov/d/${r.document_number}`, "", "", "",
  ].join(","));
}
await writeFile(OUT, lines.join("\n") + "\n");
console.log(`${OUT}: ${sample.length} rows, awaiting human review`);
