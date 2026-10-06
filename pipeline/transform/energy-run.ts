import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { z } from "zod";
import { ENERGY_CATALOG, ENERGY_DISPLAY_START, energyObservation, energySeries, type RawEnergySeries } from "../../lib/energy-entities";
import { parseRawText, rawPath } from "../fetch/eia-lib";
import { EnergyDataError, buildEnergy, validateEnergy } from "./energy";

/**
 * Energy track transform: raw/eia/*.json -> pipeline/output/{energy_series,energy_observations}.json
 * + energy_report.json. Deterministic (no run timestamp; `fetched_at` comes from the raw snapshot).
 */
const OUT = "pipeline/output";

export async function readRawEnergy(): Promise<Map<string, RawEnergySeries>> {
  const raws = new Map<string, RawEnergySeries>();
  for (const { series_id: id } of ENERGY_CATALOG) {
    let text: string;
    try {
      text = await readFile(rawPath(id), "utf8");
    } catch {
      throw new EnergyDataError(`${rawPath(id)} is missing; run pnpm fetch:eia`);
    }
    const raw = parseRawText(text);
    if (!raw) throw new EnergyDataError(`${rawPath(id)} is not a valid EIA snapshot`);
    raws.set(id, raw);
  }
  return raws;
}

const oneRowPerLine = (rows: readonly unknown[]) =>
  rows.length === 0 ? "[]\n" : `[\n${rows.map((r) => JSON.stringify(r)).join(",\n")}\n]\n`;

async function main() {
  console.log("transform:energy");
  const built = buildEnergy(await readRawEnergy());
  const series = built.series.map((r) => energySeries.parse(r));
  const observations = built.observations.map((r) => energyObservation.parse(r));
  const summary = validateEnergy(series, observations);

  await mkdir(OUT, { recursive: true });
  await writeFile(`${OUT}/energy_series.json`, oneRowPerLine(series));
  await writeFile(`${OUT}/energy_observations.json`, oneRowPerLine(observations));
  const obsBytes = (await stat(`${OUT}/energy_observations.json`)).size;
  await writeFile(
    `${OUT}/energy_report.json`,
    JSON.stringify(
      {
        display_start: ENERGY_DISPLAY_START,
        counts: summary.counts,
        last_observation: summary.lastObservation,
        preliminary_observations: summary.preliminary,
        skipped_missing_values: Object.fromEntries(Object.entries(built.skippedMissing).map(([k, v]) => [k, { count: v.length, first: v[0], last: v[v.length - 1] }])),
        observations_file_bytes: obsBytes,
      },
      null,
      2,
    ) + "\n",
  );
  for (const s of series) {
    console.log(`  ${s.series_id.padEnd(17)} ${String(s.observation_count).padStart(5)} obs  ${s.first_observation}..${s.last_observation}  prelim ${summary.preliminary[s.series_id]}`);
  }
  console.log(`  energy_observations.json ${(obsBytes / 1024).toFixed(0)} KB; coverage ok from ${ENERGY_DISPLAY_START} (late starts checked from their own first observation)`);
}

if (process.argv[1]?.endsWith("energy-run.ts")) {
  main().catch((err: unknown) => {
    console.error("\ntransform:energy FAILED");
    console.error(err instanceof z.ZodError ? z.prettifyError(err) : err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
