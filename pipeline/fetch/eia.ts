import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { EIA_PAGE_LENGTH, ENERGY_CATALOG, rawEnergySeries, type EnergyCatalogEntry, type RawEnergySeries } from "../../lib/energy-entities";
import { EIA_API, EIA_DIR, parseRawText, queryFor, rawPath, serializeRaw } from "./eia-lib";
import { run } from "./lib";

/**
 * Energy series from the EIA API v2 (api.eia.gov/v2), one raw snapshot per series in
 * `pipeline/raw/eia/<SERIES_ID>.json`. Needs `EIA_API_KEY` (free; read from the environment or the
 * git-ignored `.env.local`). The key is never logged or stored: errors name the series and the HTTP
 * status, and the committed `query` string has no key in it.
 *
 * The API returns at most 5,000 rows per request and does NOT warn when it truncates (verified
 * 2026-10-06), so every series is paged by `offset` and the run fails unless the rows received
 * equal `response.total`. Each series' FULL history is stored; values are the latest as of the fetch
 * (no vintages). `fetched_at` is carried over from the committed file while the data is unchanged,
 * so an idle week yields no diff.
 *
 * Freshness: .github/workflows/energy-freshness.yml, which applies the materiality rule in
 * `pipeline/fetch/energy-diff.ts`.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  /* no .env.local (CI passes the secret as an env var) */
}

interface ApiRow {
  period: string;
  [k: string]: unknown;
}
interface ApiResponse {
  response: { total: string | number; data: ApiRow[] };
}

async function getJson(url: string, label: string): Promise<ApiResponse> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (res.ok) return (await res.json()) as ApiResponse;
    if (attempt >= 4 || (res.status < 500 && res.status !== 429)) {
      throw new Error(`EIA ${label} -> ${res.status} ${res.statusText}`);
    }
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
}

const pickString = (row: ApiRow, ...keys: string[]): string => {
  for (const k of keys) if (typeof row[k] === "string" && row[k]) return row[k] as string;
  return "";
};

async function fetchSeries(entry: EnergyCatalogEntry): Promise<RawEnergySeries> {
  const key = process.env.EIA_API_KEY;
  if (!key) throw new Error("EIA_API_KEY is not set (put it in the environment or .env.local)");
  const valueField = "valueField" in entry.source ? entry.source.valueField : "value";
  const route = `${entry.source.route}/data`;
  const rows: ApiRow[] = [];
  let total = Infinity;
  while (rows.length < total) {
    const url = `${EIA_API}/${route}?api_key=${encodeURIComponent(key)}&${queryFor(entry, rows.length, EIA_PAGE_LENGTH)}`;
    const { response } = await getJson(url, `${entry.series_id} (offset ${rows.length})`);
    total = Number(response.total);
    if (!Number.isInteger(total)) throw new Error(`EIA ${entry.series_id}: response.total is not a number`);
    if (response.data.length === 0) break;
    rows.push(...response.data);
  }
  if (rows.length !== total) {
    throw new Error(`EIA ${entry.series_id}: received ${rows.length} rows but the API reports ${total} (truncated?)`);
  }
  if (rows.length === 0) throw new Error(`EIA ${entry.series_id}: no rows`);
  const first = rows[0];
  return rawEnergySeries.parse({
    fetched_at: new Date().toISOString(),
    series: {
      id: entry.series_id,
      title: pickString(first, "seriesDescription", "series-description"),
      units: pickString(first, "unit", "units", `${valueField}-units`),
      route: entry.source.route,
      query: queryFor(entry, 0, EIA_PAGE_LENGTH),
      total,
    },
    observations: rows.map((r) => {
      const v = r[valueField];
      return [r.period, v === null || v === undefined || v === "" ? null : String(v)];
    }),
  });
}

await run("eia", async () => {
  await mkdir(EIA_DIR, { recursive: true });
  for (const entry of ENERGY_CATALOG) {
    const fresh = await fetchSeries(entry);
    const dest = rawPath(entry.series_id);
    if (existsSync(dest)) {
      const prev = parseRawText(await readFile(dest, "utf8"));
      const same =
        JSON.stringify(prev?.series) === JSON.stringify(fresh.series) &&
        JSON.stringify(prev?.observations) === JSON.stringify(fresh.observations);
      if (prev && same) fresh.fetched_at = prev.fetched_at;
    }
    await writeFile(`${dest}.download`, serializeRaw(fresh));
    await rename(`${dest}.download`, dest);
    const last = fresh.observations[fresh.observations.length - 1][0];
    console.log(`  ${dest}  ${fresh.observations.length} rows, last ${last}`);
  }
});
