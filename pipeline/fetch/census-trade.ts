import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { download, logResult, run } from "./lib";
import { CENSUS_RAW_DIR, DUTIES_FIRST_YEAR, dutiesRawPath, parseRawDuties, type RawDuties } from "./census-trade-lib";

/**
 * U.S. trade data from the Census Bureau, snapshotted into
 * `pipeline/raw/census-trade/`:
 *
 *   country.xlsx   monthly goods imports/exports by country, 1985-present (Census basis, $M)
 *   gands.xlsx     annual goods and services, balance-of-payments basis, 1960-present ($M)
 *   country.txt    Schedule C country codes with ISO 3166-1 alpha-2 codes
 *   duties/<year>.json   calculated duties + imports for consumption by country and month,
 *                  from the international trade API (2010-present; the API has nothing earlier)
 *
 * The three files are keyless downloads. The API needs `CENSUS_API_KEY` (free; read
 * from the environment or the git-ignored `.env.local`). The key is never logged:
 * error messages carry the dataset and HTTP status, never the request URL.
 *
 * Freshness: .github/workflows/trade-freshness.yml (weekly; opens a PR only when
 * the rebuilt `pipeline/output/` differs).
 */
const BASE = "https://www.census.gov/foreign-trade";
const FILES = [
  { url: `${BASE}/balance/country.xlsx`, dest: "country.xlsx" },
  { url: `${BASE}/statistics/historical/gands.xlsx`, dest: "gands.xlsx" },
  { url: `${BASE}/schedules/c/country.txt`, dest: "country.txt" },
];
const API = "https://api.census.gov/data/timeseries/intltrade/imports/hs";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* no .env.local (CI passes the secret as an env var) */
}

async function fetchYear(year: number): Promise<RawDuties | null> {
  const key = process.env.CENSUS_API_KEY;
  if (!key) throw new Error("CENSUS_API_KEY is not set (put it in the environment or .env.local)");
  const q = new URLSearchParams({
    get: "CTY_CODE,CTY_NAME,CAL_DUT_MO,CON_VAL_MO",
    time: `from ${year}-01 to ${year}-12`,
    key,
  });
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${API}?${q.toString()}`);
    if (res.status === 204) return null; // no data published for that year yet
    if (res.ok) {
      const body = (await res.json()) as string[][];
      const [header, ...rows] = body;
      const col = (n: string) => header.indexOf(n);
      const idx = ["time", "CTY_CODE", "CTY_NAME", "CAL_DUT_MO", "CON_VAL_MO"].map(col);
      if (idx.some((i) => i < 0)) throw new Error(`Census imports/hs ${year}: unexpected columns ${header.join(",")}`);
      return parseRawDuties({
        fetched_at: new Date().toISOString(),
        year,
        rows: rows.map((r) => idx.map((i) => r[i])),
      });
    }
    if (attempt >= 4 || (res.status < 500 && res.status !== 429)) {
      throw new Error(`Census imports/hs ${year} -> ${res.status} ${res.statusText}`);
    }
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
}

await run("census-trade", async () => {
  await mkdir(`${CENSUS_RAW_DIR}/duties`, { recursive: true });
  for (const f of FILES) logResult(await download(f.url, `${CENSUS_RAW_DIR}/${f.dest}`));

  for (let year = DUTIES_FIRST_YEAR; year <= new Date().getUTCFullYear(); year++) {
    const fresh = await fetchYear(year);
    if (!fresh) {
      console.log(`  duties ${year}: no data yet`);
      continue;
    }
    const dest = dutiesRawPath(year);
    if (existsSync(dest)) {
      const prev = parseRawDuties(JSON.parse(await readFile(dest, "utf8")));
      // Carry `fetched_at` over while the data is unchanged, so an idle week yields no diff.
      if (JSON.stringify(prev.rows) === JSON.stringify(fresh.rows)) fresh.fetched_at = prev.fetched_at;
    }
    const tmp = `${dest}.download`;
    await writeFile(tmp, JSON.stringify(fresh) + "\n");
    await rename(tmp, dest);
    console.log(`  duties ${year}: ${fresh.rows.length} rows`);
  }
});
