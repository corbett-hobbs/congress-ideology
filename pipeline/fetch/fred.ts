import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { CATALOG, rawFredSeries, type RawFredSeries } from "../../lib/indicator-entities";
import { FRED_DIR, parseRawText, rawPath, serializeRaw } from "./fred-lib";
import { run } from "./lib";

/**
 * Economic indicators from the FRED API (api.stlouisfed.org/fred), one raw
 * snapshot per series in `pipeline/raw/fred/<SERIES_ID>.json`. Needs
 * `FRED_API_KEY` (free; read from the environment or the git-ignored
 * `.env.local`). The key is never logged: error messages name the series and the
 * HTTP status, never the request URL.
 *
 * Each series' FULL history is stored, with FRED's own string values (`"."` =
 * missing, kept here and skipped by the transform). Values are the LATEST
 * revised as of the fetch; ALFRED vintages are not used. `fetched_at` is carried
 * over from the committed file while the data is unchanged, so an idle week
 * yields no diff.
 *
 * Freshness: .github/workflows/indicators-freshness.yml, which applies the
 * materiality rule in `pipeline/fetch/fred-diff.ts`.
 */
const API = "https://api.stlouisfed.org/fred";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* no .env.local (CI passes the secret as an env var) */
}

async function getJson<T>(path: string, params: Record<string, string>, label: string): Promise<T> {
  const key = process.env.FRED_API_KEY;
  if (!key) throw new Error("FRED_API_KEY is not set (put it in the environment or .env.local)");
  const q = new URLSearchParams({ ...params, api_key: key, file_type: "json" });
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${API}/${path}?${q.toString()}`, { headers: { accept: "application/json" } });
    if (res.ok) return (await res.json()) as T;
    if (attempt >= 4 || (res.status < 500 && res.status !== 429)) {
      throw new Error(`FRED ${label} -> ${res.status} ${res.statusText}`);
    }
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
}

async function fetchSeries(id: string): Promise<RawFredSeries> {
  const meta = await getJson<{ seriess: Record<string, string>[] }>("series", { series_id: id }, `${id} metadata`);
  const s = meta.seriess?.[0];
  if (!s) throw new Error(`FRED has no series ${id}`);
  const obs = await getJson<{ observations: { date: string; value: string }[] }>(
    "series/observations",
    { series_id: id },
    `${id} observations`,
  );
  return rawFredSeries.parse({
    fetched_at: new Date().toISOString(),
    series: {
      id: s.id,
      title: s.title,
      units: s.units,
      frequency: s.frequency,
      seasonal_adjustment: s.seasonal_adjustment,
      observation_start: s.observation_start,
      observation_end: s.observation_end,
      last_updated: s.last_updated,
      notes: (s.notes ?? "").replace(/\s+/g, " ").trim(),
    },
    observations: obs.observations.map((o) => [o.date, o.value]),
  });
}

await run("fred", async () => {
  await mkdir(FRED_DIR, { recursive: true });
  for (const { series_id: id } of CATALOG) {
    const fresh = await fetchSeries(id);
    const dest = rawPath(id);
    if (existsSync(dest)) {
      const prev = parseRawText(await readFile(dest, "utf8"));
      const same =
        JSON.stringify(prev?.series) === JSON.stringify(fresh.series) &&
        JSON.stringify(prev?.observations) === JSON.stringify(fresh.observations);
      if (prev && same) fresh.fetched_at = prev.fetched_at;
    }
    await writeFile(`${dest}.download`, serializeRaw(fresh));
    await rename(`${dest}.download`, dest);
    console.log(`  ${dest}  ${fresh.observations.length} observations, last ${fresh.series.observation_end}`);
  }
});
