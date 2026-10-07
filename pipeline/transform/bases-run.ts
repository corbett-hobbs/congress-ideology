import { readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { baseRow } from "../../lib/bases-entities";
import { countryRow } from "../../lib/trade-entities";
import { troopsRow } from "../../lib/troops-entities";
import { buildBases } from "./bases";
import type { NeCollection } from "./world-map";

/**
 * troopdata basedata.csv -> bases.json + bases_report.json. Runs after world-map-run (it projects with the same
 * projection and checks the points against the map's bounds) and after trade-run (countries.json). Deterministic.
 * The source file is Latin-1, not UTF-8.
 */
const OUT = "pipeline/output";
const RAW = "pipeline/raw/troopdata/basedata.csv";
const GEO = "pipeline/raw/natural-earth/ne_50m_admin_0_countries.geojson";

async function main() {
  console.log("transform:bases");
  const csv = (await readFile(RAW)).toString("latin1");
  const geo = JSON.parse(await readFile(GEO, "utf8")) as NeCollection;
  const countries = (JSON.parse(await readFile(`${OUT}/countries.json`, "utf8")) as unknown[]).map((r) => countryRow.parse(r));
  const map = JSON.parse(await readFile(`${OUT}/world_map.json`, "utf8")) as { width: number; height: number };
  const troops = (JSON.parse(await readFile(`${OUT}/troops_location.json`, "utf8")) as unknown[]).map((r) => troopsRow.parse(r));
  const latest = troops.reduce((m, r) => (r.period > m ? r.period : m), "");
  const hosts = new Set(troops.filter((r) => r.period === latest && r.class === "host" && r.iso3 && (r.total ?? 0) > 0).map((r) => r.iso3!));

  const { rows, report, failures } = buildBases({
    csv,
    geo,
    countryCodes: new Set(countries.filter((c) => !c.is_aggregate).map((c) => c.country_code)),
    troopHostIso3: hosts,
    mapSize: map,
  });
  if (failures.length) throw new Error(`bases gates failed:\n  ${failures.join("\n  ")}`);
  rows.forEach((r) => baseRow.parse(r));
  const json = JSON.stringify(rows);
  report.bytes = json.length;
  await writeFile(`${OUT}/bases.json`, json + "\n");
  await writeFile(`${OUT}/bases_report.json`, JSON.stringify({ ...report, gzip_bytes: gzipSync(json).length, latest_troop_period: latest }, null, 2) + "\n");
  console.log(`  ${rows.length} installations in ${Object.keys(report.by_country).length} countries (${report.excluded.length} excluded, ${report.needs_review} to review); ${json.length} bytes, ${gzipSync(json).length} gzipped`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
