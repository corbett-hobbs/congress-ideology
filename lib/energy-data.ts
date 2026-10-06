import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { energyObservation, energySeries } from "./energy-entities";
import { energyActionsFile } from "./energy-actions-entities";
import { buildSeries, groupObservations, spanOf, toFlag } from "./energy-derive";
import { getEraLayers } from "./indicator-data";
import type { EnergyPayload } from "./energy-types";

/**
 * Build-time energy dataset for /presidency/energy: reads `energy_series.json`, `energy_observations.json` and
 * `energy_actions.json` (Zod-parsed at the boundary), applies the display window and compacts to the client
 * payload. All math is in `lib/energy-derive.ts`; the day axis and era layers are the Economy page's.
 */
const OUT = join(process.cwd(), "pipeline", "output");

const readJson = (file: string): unknown => JSON.parse(readFileSync(join(OUT, file), "utf8"));

let cache: EnergyPayload | null = null;

export function getEnergyPayload(): EnergyPayload {
  if (cache) return cache;
  const series = z.array(energySeries).parse(readJson("energy_series.json"));
  const observations = z.array(energyObservation).parse(readJson("energy_observations.json"));
  const actions = energyActionsFile.parse(readJson("energy_actions.json"));
  const { spr, monthly, prelim } = buildSeries(groupObservations(observations));
  const span = spanOf(spr);
  cache = {
    span,
    spr,
    monthly,
    prelim,
    ...getEraLayers(span),
    flags: actions.actions.map(toFlag),
    flagsReviewed: actions.last_reviewed,
    fetchedAt: series.map((s) => s.fetched_at).sort().slice(-1)[0],
  };
  return cache;
}
