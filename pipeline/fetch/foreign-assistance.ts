import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { run } from "./lib";
import {
  FA_RAW_DIR,
  FA_RAW_META_PATH,
  MILITARY_ASSISTANCE_CATEGORY_ID,
  TX_DISBURSEMENTS,
  TX_OBLIGATIONS,
  faRawYearPath,
  parseRawMeta,
  parseRawYear,
  type RawMeta,
  type RawRow,
  type RawYear,
} from "./foreign-assistance-lib";

/**
 * U.S. foreign assistance from ForeignAssistance.gov, snapshotted into
 * `pipeline/raw/foreign-assistance/`:
 *
 *   <fy>.json   one file per fiscal year (disbursements + obligations, nominal $, by country and
 *               U.S. sector), plus the Military-assistance subset at the same grain
 *   meta.json   fetch time, the site's data-through date, source record counts, sector taxonomy
 *
 * Keyless and public (the site's own data API; no credentials anywhere). Freshness: re-run by hand;
 * the output is diff-friendly (`fetched_at` is carried over while a year's rows are unchanged).
 *
 * `data_through` is not an API field: the site renders "Data last updated on: M/D/YYYY" from a
 * constant in its JS bundle. We read that constant; if the site changes shape, pass
 * `--data-through=YYYY-MM-DD` after reading the date off https://foreignassistance.gov/data.
 */
const SITE = "https://foreignassistance.gov";
const API = `${SITE}/api/data-api`;
const PER_PAGE = 10000;
// Cloudflare 403s some default client user agents; identify ourselves plainly.
const HEADERS = { "User-Agent": "congress-ideology-pipeline (public-data research; github.com/corbetthobbs)" };

interface Page<T> {
  data: T[];
  page_info: { current_page: number; total_pages: number; total_records: number };
}

async function getJson<T>(url: string): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: HEADERS });
    if (res.ok) return (await res.json()) as T;
    if (attempt >= 4 || (res.status < 500 && res.status !== 429)) throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
}

/** Every page of `endpoint` for `query`; fails if the rows returned differ from the API's own `total_records`. */
async function fetchAll<T>(endpoint: string, query: Record<string, string | number>): Promise<{ rows: T[]; expected: number }> {
  const rows: T[] = [];
  let expected = 0;
  for (let page = 1; ; page++) {
    const q = new URLSearchParams({ ...Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])), per_page: String(PER_PAGE), page: String(page) });
    const body = await getJson<Page<T>>(`${API}/${endpoint}?${q}`);
    expected = body.page_info.total_records;
    rows.push(...body.data);
    if (page >= body.page_info.total_pages) break;
  }
  if (rows.length !== expected) throw new Error(`${endpoint} ${JSON.stringify(query)}: got ${rows.length} rows, API reported ${expected}`);
  return { rows, expected };
}

interface SectorApiRow {
  country_code: string | null;
  country_name: string;
  usg_category_id: number;
  usg_category_name: string;
  usg_sector_id: number;
  usg_sector_name: string;
  transaction_type_id: number;
  fiscal_year: string;
  current_amount: number;
}
interface TxApiRow extends Omit<SectorApiRow, "usg_category_name" | "usg_sector_name"> {
  assistance_category_id: number;
}

/** "9/30/2026" -> "2026-09-30", read from the site's bundle (see header comment). */
async function readDataThrough(): Promise<string> {
  const flag = process.argv.find((a) => a.startsWith("--data-through="))?.slice("--data-through=".length);
  if (flag) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(flag)) throw new Error(`--data-through must be YYYY-MM-DD, got ${flag}`);
    return flag;
  }
  const html = await (await fetch(`${SITE}/`, { headers: HEADERS })).text();
  const scripts = [...html.matchAll(/src="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]);
  for (const src of scripts) {
    const js = await (await fetch(`${SITE}${src}`, { headers: HEADERS })).text();
    const m = js.match(/exports=\{_:"(\d{1,2})\/(\d{1,2})\/(\d{4})"\}/);
    if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  throw new Error("could not find the site's 'last updated' constant; pass --data-through=YYYY-MM-DD");
}

const toRaw = (r: SectorApiRow | TxApiRow): RawRow => [r.country_code, r.country_name, r.usg_category_id, r.usg_sector_id, r.transaction_type_id as 2 | 3, r.current_amount];

await run("foreign-assistance", async () => {
  await mkdir(FA_RAW_DIR, { recursive: true });
  const dataThrough = await readDataThrough();

  const sector: SectorApiRow[] = [];
  const expected: RawMeta["expected_records"] = { sector: {}, military: {} };
  for (const tx of [TX_OBLIGATIONS, TX_DISBURSEMENTS]) {
    const s = await fetchAll<SectorApiRow & { id: number }>("by-usg-sector.json", { transaction_type_id: tx });
    // Every row carries a unique id; a repeat or gap means the pagination slipped.
    if (new Set(s.rows.map((r) => r.id)).size !== s.rows.length) throw new Error(`by-usg-sector tx ${tx}: duplicate row ids across pages`);
    sector.push(...s.rows);
    expected.sector[String(tx)] = s.expected;
    console.log(`  tx ${tx}: ${s.rows.length} sector rows`);
  }

  // complete-data (1.7M lines, no row ids) paginates unreliably over a large result: an unfiltered pull of the
  // Military subset returns the right row count but silently omits lines (FY2025 came back at $1.6B vs $6.3B).
  // Filtering to one fiscal year per request is reliable (verified equal to a per-country partition), so pull per year.
  const sectorYears = new Set(sector.map((r) => r.fiscal_year));
  const keptMilitary: TxApiRow[] = [];
  for (const fy of [...sectorYears].sort()) {
    for (const tx of [TX_OBLIGATIONS, TX_DISBURSEMENTS]) {
      const m = await fetchAll<TxApiRow>("complete-data.json", { transaction_type_id: tx, assistance_category_id: MILITARY_ASSISTANCE_CATEGORY_ID, fiscal_year: fy });
      keptMilitary.push(...m.rows);
      expected.military[`${fy}-${tx}`] = m.expected;
    }
  }
  console.log(`  military: ${keptMilitary.length} transaction lines`);

  // Sum military transaction lines to the sector grain (country, fy, category, sector, type).
  const milSum = new Map<string, TxApiRow>();
  for (const r of keptMilitary) {
    const k = [r.country_code ?? "", r.country_name, r.fiscal_year, r.usg_sector_id, r.transaction_type_id].join("|");
    const prev = milSum.get(k);
    if (prev) prev.current_amount += r.current_amount;
    else milSum.set(k, { ...r });
  }

  const years = new Map<number, { sector_rows: RawRow[]; military_rows: RawRow[] }>();
  const bucket = (fy: string) => {
    const y = Number(fy);
    if (!Number.isInteger(y)) throw new Error(`non-numeric fiscal_year ${JSON.stringify(fy)}`);
    if (!years.has(y)) years.set(y, { sector_rows: [], military_rows: [] });
    return years.get(y)!;
  };
  const order = (a: RawRow, b: RawRow) => (a[0] ?? a[1]).localeCompare(b[0] ?? b[1]) || a[1].localeCompare(b[1]) || a[3] - b[3] || a[4] - b[4];
  for (const r of sector) bucket(r.fiscal_year).sector_rows.push(toRaw(r));
  for (const r of milSum.values()) bucket(r.fiscal_year).military_rows.push(toRaw(r));

  const taxonomy = new Map<number, { id: number; category_id: number; name: string }>();
  const categories = new Map<number, string>();
  for (const r of sector) {
    categories.set(r.usg_category_id, r.usg_category_name);
    taxonomy.set(r.usg_sector_id, { id: r.usg_sector_id, category_id: r.usg_category_id, name: r.usg_sector_name });
  }

  const wanted = new Set<string>();
  for (const [fy, v] of [...years].sort((a, b) => a[0] - b[0])) {
    v.sector_rows.sort(order);
    v.military_rows.sort(order);
    const fresh: RawYear = parseRawYear({ fiscal_year: fy, ...v });
    const dest = faRawYearPath(fy);
    wanted.add(`${fy}.json`);
    const text = `{"fiscal_year":${fy},\n"sector_rows":[\n${fresh.sector_rows.map((r) => JSON.stringify(r)).join(",\n")}\n],\n"military_rows":[\n${fresh.military_rows.map((r) => JSON.stringify(r)).join(",\n")}\n]}\n`;
    const tmp = `${dest}.download`;
    await writeFile(tmp, text);
    await rename(tmp, dest);
    console.log(`  ${fy}: ${fresh.sector_rows.length} sector rows, ${fresh.military_rows.length} military rows`);
  }
  // A fiscal year the source no longer serves must not linger as a stale snapshot.
  for (const f of await readdir(FA_RAW_DIR)) if (/^\d{4}\.json$/.test(f) && !wanted.has(f)) await rm(`${FA_RAW_DIR}/${f}`);

  let fetchedAt = new Date().toISOString();
  const meta: Omit<RawMeta, "fetched_at"> = {
    data_through: dataThrough,
    expected_records: expected,
    categories: [...categories].sort((a, b) => a[0] - b[0]).map(([id, name]) => ({ id, name })),
    sectors: [...taxonomy.values()].sort((a, b) => a.id - b.id),
  };
  if (existsSync(FA_RAW_META_PATH)) {
    const prev = parseRawMeta(JSON.parse(await readFile(FA_RAW_META_PATH, "utf8")));
    // Keep `fetched_at` while nothing in the snapshot changed, so an idle re-run yields no diff.
    const { fetched_at, ...rest } = prev;
    if (JSON.stringify(rest) === JSON.stringify(meta)) fetchedAt = fetched_at;
  }
  await writeFile(FA_RAW_META_PATH, JSON.stringify(parseRawMeta({ fetched_at: fetchedAt, ...meta }), null, 2) + "\n");
  console.log(`  data through ${dataThrough}`);
});
