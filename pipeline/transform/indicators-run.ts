import { mkdir, readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import {
  CATALOG,
  INDICATORS_DISPLAY_START,
  indicatorObservation,
  indicatorSeries,
  type RawFredSeries,
} from "../../lib/indicator-entities";
import { parseRawText, rawPath } from "../fetch/fred-lib";
import { IndicatorDataError, buildIndicators, validateIndicators } from "./indicators";

/**
 * Indicators track transform: raw/fred/*.json -> pipeline/output/
 * {indicator_series,indicator_observations}.json + indicators_report.json.
 * Deterministic (no run timestamp; `fetched_at` comes from the raw snapshot).
 */
const OUT = "pipeline/output";

export async function readRawFred(): Promise<Map<string, RawFredSeries>> {
  const raws = new Map<string, RawFredSeries>();
  for (const { series_id: id } of CATALOG) {
    let text: string;
    try {
      text = await readFile(rawPath(id), "utf8");
    } catch {
      throw new IndicatorDataError(`${rawPath(id)} is missing — run pnpm fetch:fred`);
    }
    const raw = parseRawText(text);
    if (!raw) throw new IndicatorDataError(`${rawPath(id)} is not a valid FRED snapshot`);
    raws.set(id, raw);
  }
  return raws;
}

const oneRowPerLine = (rows: readonly unknown[]) =>
  rows.length === 0 ? "[]\n" : `[\n${rows.map((r) => JSON.stringify(r)).join(",\n")}\n]\n`;

async function main() {
  console.log("transform:indicators");
  const built = buildIndicators(await readRawFred());
  const series = built.series.map((r) => indicatorSeries.parse(r));
  const observations = built.observations.map((r) => indicatorObservation.parse(r));
  const summary = validateIndicators(series, observations);

  await mkdir(OUT, { recursive: true });
  await writeFile(`${OUT}/indicator_series.json`, oneRowPerLine(series));
  await writeFile(`${OUT}/indicator_observations.json`, oneRowPerLine(observations));
  await writeFile(
    `${OUT}/indicators_report.json`,
    JSON.stringify(
      {
        display_start: INDICATORS_DISPLAY_START,
        counts: summary.counts,
        last_observation: summary.lastObservation,
        skipped_missing_values: built.skippedMissing,
      },
      null,
      2,
    ) + "\n",
  );
  for (const s of series) {
    console.log(`  ${s.series_id.padEnd(14)} ${String(s.observation_count).padStart(5)} obs  ${s.first_observation}..${s.last_observation}`);
  }
  console.log(`  coverage ok from ${INDICATORS_DISPLAY_START} for all ${series.length} series`);
}

if (process.argv[1]?.endsWith("indicators-run.ts")) {
  main().catch((err: unknown) => {
    console.error("\ntransform:indicators FAILED");
    console.error(err instanceof z.ZodError ? z.prettifyError(err) : err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
