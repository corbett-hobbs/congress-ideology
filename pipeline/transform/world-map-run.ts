import { readFile, writeFile } from "node:fs/promises";
import { aidRow } from "../../lib/foreign-aid-entities";
import { buildWorldMap, type AidRecipient, type NeCollection } from "./world-map";

/**
 * Natural Earth admin-0 (pipeline/raw/natural-earth) + foreign_assistance.json -> world_map.json.
 * Runs after foreign-aid-run (it needs the recipient list). Deterministic.
 */
const OUT = "pipeline/output";
const RAW = "pipeline/raw/natural-earth/ne_50m_admin_0_countries.geojson";

export function recipientsOf(rows: readonly ReturnType<typeof aidRow.parse>[]): AidRecipient[] {
  const net = new Map<string, number>(); // `${name}|${fy}` -> net
  const key = new Map<string, string | null>();
  for (const r of rows) {
    if (r.recipient_type !== "country") continue;
    key.set(r.recipient_name, r.country_key);
    const k = `${r.recipient_name}|${r.fiscal_year}`;
    net.set(k, (net.get(k) ?? 0) + r.disbursements_usd);
  }
  const peak = new Map<string, number>();
  for (const [k, v] of net) {
    const name = k.slice(0, k.lastIndexOf("|"));
    peak.set(name, Math.max(peak.get(name) ?? 0, Math.abs(v)));
  }
  return [...key].map(([name, k]) => ({ name, key: k, peak: peak.get(name) ?? 0 }));
}

async function main() {
  console.log("transform:world-map");
  const geo = JSON.parse(await readFile(RAW, "utf8")) as NeCollection;
  const rows = (JSON.parse(await readFile(`${OUT}/foreign_assistance.json`, "utf8")) as unknown[]).map((r) => aidRow.parse(r));
  const map = buildWorldMap(geo, recipientsOf(rows));
  const json = JSON.stringify(map);
  await writeFile(`${OUT}/world_map.json`, json + "\n");
  console.log(`  ${map.features.length} outlines, ${map.recipients.length} recipients drawn (${map.recipients.filter((r) => r.marker).length} with markers), ${map.undrawn.length} undrawn; ${json.length} bytes`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
