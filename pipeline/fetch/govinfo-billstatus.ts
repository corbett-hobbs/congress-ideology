import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { billstatusManifest, rawCongressFile, BILLSTATUS_FIRST_CONGRESS, LawsDataError, ordinal, type BillstatusManifest, type RawLaw } from "../../lib/laws-entities";
import { rawBillsFile, type RawBill } from "../../lib/committee-bills-entities";
import { BILLSTATUS_BASE, LAW_BILL_TYPES, billsFromZip, formatRawBills, lawsFromZip, zipName, zipUrl } from "./billstatus-lib";
import { congressForDate, formatRawCongress } from "./laws-raw";
import { RAW_DIR, download, run } from "./lib";

/**
 * GovInfo Bill Status bulk data -> `pipeline/raw/govinfo-billstatus/<congress>.json` (keyless).
 *
 *   pnpm fetch:billstatus -- --dry-run          sizes only (HEAD requests); nothing is downloaded
 *   pnpm fetch:billstatus -- --rebuild          re-read the cached ZIPs (no download) after a parser change
 *   pnpm fetch:billstatus                       every Congress from the 108th whose ZIPs changed since manifest.json
 *   pnpm fetch:billstatus -- 119                only the 119th
 *   pnpm fetch:billstatus -- --yes              allow a download above 150 MB (the first full run is ~0.5 GB)
 *
 * The ZIPs (one per bill type per Congress, one XML per bill) are cached under `pipeline/raw/_scratch/govinfo-billstatus/`
 * (gitignored) and only the public-law bills are kept, in the same shape the Congress.gov fetcher writes. A ZIP is
 * re-downloaded only when its size or Last-Modified differs from manifest.json. Not part of `fetch:all`.
 *
 * For the Congress in progress it also writes `pipeline/raw/govinfo-bills/<congress>.json`: a digest of EVERY bill and joint
 * resolution (committee referrals and their dated steps, sponsor, cosponsor parties, the few actions the stage logic reads),
 * which the committee-legislation transform turns into one shard per committee. Earlier Congresses have no committee pages.
 */
const DIR = `${RAW_DIR}/govinfo-billstatus`;
const CACHE = `${RAW_DIR}/_scratch/govinfo-billstatus`;
const MANIFEST = `${DIR}/manifest.json`;
const BILLS_DIR = `${RAW_DIR}/govinfo-bills`;
const BIG_DOWNLOAD = 150 * 1024 * 1024;
const USER_AGENT = "InsideGov-pipeline/0.1 (+https://github.com/corbett-hobbs/insidegov; weekly data check)";

const readManifest = async (): Promise<BillstatusManifest> =>
  existsSync(MANIFEST) ? billstatusManifest.parse(JSON.parse(await readFile(MANIFEST, "utf8"))) : { base_url: BILLSTATUS_BASE, zips: [] };

async function head(url: string): Promise<{ bytes: number; lastModified: string } | null> {
  const res = await fetch(url, { method: "HEAD", headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(60_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new LawsDataError(`HEAD ${url} -> ${res.status}`);
  return { bytes: Number(res.headers.get("content-length") ?? 0), lastModified: res.headers.get("last-modified") ?? "" };
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const dry = args.includes("--dry-run");
  const yes = args.includes("--yes");
  const rebuildAll = args.includes("--rebuild");
  const wanted = args.filter((a) => /^\d+$/.test(a)).map(Number);
  const last = congressForDate(new Date());
  const billsFile = (c: number) => `${BILLS_DIR}/${c}.json`;
  const congresses = wanted.length > 0 ? wanted : Array.from({ length: last - BILLSTATUS_FIRST_CONGRESS + 1 }, (_, i) => BILLSTATUS_FIRST_CONGRESS + i);
  for (const c of congresses) if (c < BILLSTATUS_FIRST_CONGRESS) throw new LawsDataError(`Bill Status starts at the ${ordinal(BILLSTATUS_FIRST_CONGRESS)} Congress; use pnpm fetch:laws for ${c}`);

  const manifest = await readManifest();
  const known = new Map(manifest.zips.map((z) => [`${z.congress}|${z.type}`, z]));
  const plan: { congress: number; type: (typeof LAW_BILL_TYPES)[number]; bytes: number; lastModified: string; stale: boolean }[] = [];
  for (const congress of congresses) {
    for (const type of LAW_BILL_TYPES) {
      const h = await head(zipUrl(congress, type));
      if (!h) {
        console.log(`  ${zipName(congress, type)}: not published`);
        continue;
      }
      const k = known.get(`${congress}|${type}`);
      const fresh = !rebuildAll && !!k && k.bytes === h.bytes && k.last_modified === h.lastModified && existsSync(`${DIR}/${congress}.json`) && (congress !== last || existsSync(billsFile(congress)));
      plan.push({ congress, type, ...h, stale: !fresh });
    }
  }
  const toGet = plan.filter((p) => p.stale);
  const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
  for (const p of plan) console.log(`  ${zipName(p.congress, p.type)}  ${mb(p.bytes)} MB  ${p.stale ? "to fetch" : "up to date"}`);
  const cachedOk = (p: (typeof plan)[number]) => existsSync(`${CACHE}/${zipName(p.congress, p.type)}`) && statSync(`${CACHE}/${zipName(p.congress, p.type)}`).size === p.bytes;
  const total = toGet.filter((p) => !cachedOk(p)).reduce((s, p) => s + p.bytes, 0);
  console.log(`  ${toGet.length} of ${plan.length} ZIPs to read, ${mb(total)} MB to download`);
  if (dry || toGet.length === 0) return;
  if (total > BIG_DOWNLOAD && !yes) throw new LawsDataError(`${mb(total)} MB is above the 150 MB guard; re-run with --yes once the download has been approved`);

  await mkdir(CACHE, { recursive: true });
  await mkdir(DIR, { recursive: true });
  const byCongress = new Map<number, RawLaw[]>();
  const corrected = new Map<number, string[]>();
  const counts = new Map<string, number>();
  const digests: RawBill[] = [];
  // A Congress is rebuilt from all four of its ZIPs, so re-read the cached ones that did not change.
  const rebuild = new Set(toGet.map((p) => p.congress));
  for (const p of plan.filter((x) => rebuild.has(x.congress))) {
    const file = `${CACHE}/${zipName(p.congress, p.type)}`;
    if (!existsSync(file) || (await stat(file)).size !== p.bytes) {
      process.stdout.write(`  downloading ${zipName(p.congress, p.type)} (${mb(p.bytes)} MB)\n`);
      await download(zipUrl(p.congress, p.type), file);
    }
    const zip = await readFile(file);
    const { laws, bills, corrections } = lawsFromZip(zip);
    if (p.congress === last) digests.push(...billsFromZip(zip));
    for (const c of corrections) console.log(`    corrected: ${c}`);
    corrected.set(p.congress, [...(corrected.get(p.congress) ?? []), ...corrections]);
    console.log(`  ${zipName(p.congress, p.type)}: ${bills} bills, ${laws.length} public laws`);
    byCongress.set(p.congress, [...(byCongress.get(p.congress) ?? []), ...laws]);
    counts.set(`${p.congress}|${p.type}`, laws.length);
  }
  const today = new Date().toISOString().slice(0, 10);
  for (const [congress, laws] of byCongress) {
    laws.sort((a, b) => a.number - b.number || a.law_id.localeCompare(b.law_id));
    const file = rawCongressFile.parse({ source: "govinfo-billstatus", congress, fetched: today, list_count: null, max_number: laws.at(-1)!.number, ...(corrected.get(congress)?.length ? { corrections: corrected.get(congress)!.sort() } : {}), laws });
    await writeFile(`${DIR}/${congress}.json`, formatRawCongress(file));
  }
  if (rebuild.has(last)) {
    await mkdir(BILLS_DIR, { recursive: true });
    digests.sort((a, b) => a.type.localeCompare(b.type) || Number(a.number) - Number(b.number));
    const file = rawBillsFile.parse({ source: "govinfo-billstatus", congress: last, fetched: today, bills: digests });
    await writeFile(billsFile(last), formatRawBills(file));
    console.log(`  ${billsFile(last)}: ${digests.length} bills`);
  }
  const next = new Map(known);
  for (const p of plan.filter((x) => rebuild.has(x.congress))) {
    next.set(`${p.congress}|${p.type}`, { congress: p.congress, type: p.type, bytes: p.bytes, last_modified: p.lastModified, public_law_bills: counts.get(`${p.congress}|${p.type}`) ?? 0 });
  }
  const out: BillstatusManifest = { base_url: BILLSTATUS_BASE, zips: [...next.values()].sort((a, b) => a.congress - b.congress || a.type.localeCompare(b.type)) };
  await writeFile(MANIFEST, JSON.stringify(billstatusManifest.parse(out), null, 2) + "\n");
}

run("billstatus", main);
