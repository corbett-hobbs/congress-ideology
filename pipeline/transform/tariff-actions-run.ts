import { mkdir, readFile, writeFile } from "node:fs/promises";
import { MAX_PRIORITY_1, TARIFF_ACTIONS_STALE_DAYS } from "../../lib/tariff-actions-entities";
import { validateTariffActions } from "./tariff-actions";

/**
 * Tariff-actions track: the hand-curated `pipeline/reference/tariff-actions.json` ->
 * `pipeline/output/tariff_actions.json` (+ `tariff_actions_report.json`). Editorial data,
 * nothing fetched. Cross-checks country codes against countries.json and EO numbers against
 * executive_orders.json, so run it after the trade and executive-orders transforms.
 * Curation rules: docs/TARIFF_ACTIONS_CURATION.md.
 */
const SRC = "pipeline/reference/tariff-actions.json";
const OUT = "pipeline/output";

const readJson = async (p: string) => JSON.parse(await readFile(p, "utf8")) as unknown;

async function main() {
  console.log("transform:tariff-actions");
  const countries = (await readJson(`${OUT}/countries.json`)) as { country_code: string; is_aggregate: boolean }[];
  const eos = (await readJson(`${OUT}/executive_orders.json`)) as { eo_number: number }[];
  const file = validateTariffActions(await readJson(SRC), {
    countryCodes: new Set(countries.filter((c) => !c.is_aggregate).map((c) => c.country_code)),
    eoNumbers: new Set(eos.map((e) => e.eo_number)),
    today: new Date().toISOString().slice(0, 10),
  });

  await mkdir(OUT, { recursive: true });
  const rows = file.actions.map((a) => JSON.stringify(a)).join(",\n");
  await writeFile(`${OUT}/tariff_actions.json`, `{"last_reviewed":${JSON.stringify(file.last_reviewed)},"actions":[\n${rows}\n]}\n`);
  const report = {
    rows: file.actions.length,
    first_date: file.actions[0]?.date ?? null,
    last_date: file.actions[file.actions.length - 1]?.date ?? null,
    priority_1: file.actions.filter((a) => a.flag_priority === 1).length,
    priority_1_cap: MAX_PRIORITY_1,
    cutover: file.actions.find((a) => a.is_cutover)?.action_id ?? null,
    last_reviewed: file.last_reviewed,
    stale_after_days: TARIFF_ACTIONS_STALE_DAYS,
  };
  await writeFile(`${OUT}/tariff_actions_report.json`, JSON.stringify(report, null, 2) + "\n");
  console.log(`  ${report.rows} actions ${report.first_date}..${report.last_date}; priority 1: ${report.priority_1}; cut-over ${report.cutover}; last reviewed ${report.last_reviewed}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? `${e.name}: ${e.message}` : e);
  process.exit(1);
});
