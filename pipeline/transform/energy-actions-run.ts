import { mkdir, readFile, writeFile } from "node:fs/promises";
import { ENERGY_ACTIONS_STALE_DAYS, MAX_ENERGY_PRIORITY_1 } from "../../lib/energy-actions-entities";
import { ENERGY_CATALOG } from "../../lib/energy-entities";
import { validateEnergyActions } from "./energy-actions";

/**
 * Energy-actions track: the hand-curated `pipeline/reference/energy-actions.json` ->
 * `pipeline/output/energy_actions.json` (+ `energy_actions_report.json`). Editorial data, nothing
 * fetched. Cross-checks series ids against the energy catalog and EO numbers against
 * executive_orders.json, so run it after the executive-orders transform.
 * Curation rules: docs/ENERGY_ACTIONS_CURATION.md.
 */
const SRC = "pipeline/reference/energy-actions.json";
const OUT = "pipeline/output";

const readJson = async (p: string) => JSON.parse(await readFile(p, "utf8")) as unknown;

async function main() {
  console.log("transform:energy-actions");
  const eos = (await readJson(`${OUT}/executive_orders.json`)) as { eo_number: number }[];
  const file = validateEnergyActions(await readJson(SRC), {
    seriesIds: new Set(ENERGY_CATALOG.map((c) => c.series_id)),
    eoNumbers: new Set(eos.map((e) => e.eo_number)),
    today: new Date().toISOString().slice(0, 10),
  });

  await mkdir(OUT, { recursive: true });
  const rows = file.actions.map((a) => JSON.stringify(a)).join(",\n");
  await writeFile(`${OUT}/energy_actions.json`, `{"last_reviewed":${JSON.stringify(file.last_reviewed)},"actions":[\n${rows}\n]}\n`);
  const count = (f: (a: (typeof file.actions)[number]) => string) =>
    Object.fromEntries([...new Set(file.actions.map(f))].sort().map((k) => [k, file.actions.filter((a) => f(a) === k).length]));
  const report = {
    rows: file.actions.length,
    first_date: file.actions[0]?.date ?? null,
    last_date: file.actions[file.actions.length - 1]?.date ?? null,
    priority_1: file.actions.filter((a) => a.flag_priority === 1).length,
    priority_1_cap: MAX_ENERGY_PRIORITY_1,
    by_authority_type: count((a) => a.authority_type),
    by_area: count((a) => a.area),
    last_reviewed: file.last_reviewed,
    stale_after_days: ENERGY_ACTIONS_STALE_DAYS,
  };
  await writeFile(`${OUT}/energy_actions_report.json`, JSON.stringify(report, null, 2) + "\n");
  console.log(`  ${report.rows} actions ${report.first_date}..${report.last_date}; priority 1: ${report.priority_1}; last reviewed ${report.last_reviewed}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? `${e.name}: ${e.message}` : e);
  process.exit(1);
});
