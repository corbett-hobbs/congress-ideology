import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { rawCongressFile, rawLaw, LAWS_FIRST_CONGRESS, BILLSTATUS_FIRST_CONGRESS, LawsDataError, ordinal, type RawLaw } from "../../lib/laws-entities";
import { CongressApi, apiCommittees, lawsFromApiBill, type ApiBillDetail, type ApiCommittee, type ApiCosponsor, type ApiSummary, type LawListRow } from "./congress-gov-lib";
import { formatRawCongress, isoDay, parsePublicLawNumber } from "./laws-raw";
import { RAW_DIR, run } from "./lib";

/**
 * Public laws from the Congress.gov API -> `pipeline/raw/congress-gov/<congress>.json` (needs `CONGRESS_API_KEY`,
 * free from api.data.gov; `.env.local` locally, a repo secret in Actions).
 *
 *   pnpm fetch:laws                      the Congresses Bill Status does not cover (93rd-107th)
 *   pnpm fetch:laws -- 108               one Congress (108 is the overlap check against Bill Status)
 *   pnpm fetch:laws -- --refresh         ignore what is already stored
 *   pnpm fetch:laws -- --per-second 4    slow down (default 5; the hourly limit of 20,000 allows 5.5)
 *
 * Resumable: every bill's result is cached in `pipeline/raw/_scratch/congress-gov/` (gitignored) as soon as it arrives,
 * so an interrupted run continues where it stopped. Incremental: a bill already stored is re-fetched only when the list's
 * `updateDate` is newer than the stored one. The law *list* repeats some rows and omits others, so law numbers are
 * walked 1..N and every number the list lacks is looked up at `/law/{congress}/pub/{number}`. Not part of `fetch:all`.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  /* no .env.local (CI passes the secret as an env var) */
}

const DIR = `${RAW_DIR}/congress-gov`;
const CACHE = `${RAW_DIR}/_scratch/congress-gov`;
const WORKERS = 4;

interface BillRef {
  type: string;
  number: string;
  updateDate: string | null;
}

async function readJson<T>(path: string): Promise<T | null> {
  return existsSync(path) ? (JSON.parse(await readFile(path, "utf8")) as T) : null;
}

async function writeAtomic(path: string, text: string) {
  await mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  await writeFile(`${path}.tmp`, text);
  await rename(`${path}.tmp`, path);
}

async function fetchBill(api: CongressApi, congress: number, ref: BillRef): Promise<RawLaw[]> {
  const base = `/bill/${congress}/${ref.type.toLowerCase()}/${ref.number}`;
  const detail = ((await api.get(base)) as { bill?: ApiBillDetail } | null)?.bill;
  if (!detail) throw new LawsDataError(`${base} returned nothing`);
  const actionCount = (detail as { actions?: { count?: number } }).actions?.count ?? 1;
  const cosponsorCount = (detail as { cosponsors?: { count?: number } }).cosponsors?.count ?? 0;
  const actions = actionCount > 0 ? (await api.list(`${base}/actions`, "actions")).items : [];
  const summaries = ((await api.get(`${base}/summaries`)) as { summaries?: ApiSummary[] } | null)?.summaries ?? [];
  const cosponsors = cosponsorCount > 0 ? (await api.list(`${base}/cosponsors`, "cosponsors")).items : [];
  const committees = ((await api.get(`${base}/committees`)) as { committees?: ApiCommittee[] } | null)?.committees ?? [];
  return lawsFromApiBill(congress, detail, actions as never[], summaries, cosponsors as ApiCosponsor[], committees);
}

async function fetchCongress(api: CongressApi, congress: number, refresh: boolean) {
  const out = `${DIR}/${congress}.json`;
  // Files written before committees were captured lack the field: read them with an empty list and top the bills up below.
  const needsCommittees = new Set<RawLaw>();
  const stored = refresh
    ? null
    : await readJson<{ laws: Record<string, unknown>[] }>(out).then((j) => {
        if (!j) return null;
        const f = rawCongressFile.parse({ ...j, laws: j.laws.map((l) => ({ committees: [], ...l })) });
        j.laws.forEach((l, i) => {
          if (!("committees" in l)) needsCommittees.add(f.laws[i]!);
        });
        return f;
      });
  const storedByBill = new Map<string, RawLaw[]>();
  for (const l of stored?.laws ?? []) storedByBill.set(`${l.bill_type}${l.bill_number}`, [...(storedByBill.get(`${l.bill_type}${l.bill_number}`) ?? []), l]);

  const { items, count } = await api.list(`/law/${congress}/pub`, "bills");
  const rows = items as LawListRow[];
  const refs = new Map<string, BillRef>();
  const have = new Set<number>();
  for (const r of rows) {
    for (const l of r.laws) {
      const n = l.type === "Public Law" ? parsePublicLawNumber(l.number) : null;
      if (n && n[0] === congress) have.add(n[1]);
    }
    refs.set(`${r.type.toLowerCase()}${r.number}`, { type: r.type, number: r.number, updateDate: isoDay(r.updateDate) });
  }
  if (have.size === 0) throw new LawsDataError(`${ordinal(congress)} Congress: the API lists no public laws`);
  const max = Math.max(...have);
  let gaps = 0;
  for (let n = 1; n <= max; n++) {
    if (have.has(n)) continue;
    gaps++;
    const j = (await api.get(`/law/${congress}/pub/${n}`)) as { bill?: LawListRow & { updateDate?: string } } | null;
    if (!j?.bill) throw new LawsDataError(`${ordinal(congress)} Congress: public law ${congress}-${n} is not in the list and /law/${congress}/pub/${n} returned nothing`);
    refs.set(`${j.bill.type.toLowerCase()}${j.bill.number}`, { type: j.bill.type, number: j.bill.number, updateDate: isoDay(j.bill.updateDate) });
  }
  console.log(`  ${ordinal(congress)}: list says ${count} rows, ${have.size} distinct laws, ${gaps} numbers filled in by lookup, ${refs.size} bills`);

  const todo = [...refs.entries()].filter(([key, ref]) => {
    const kept = storedByBill.get(key);
    return !(kept && ref.updateDate !== null && kept.every((l) => l.updated !== null && l.updated >= ref.updateDate!));
  });
  const results = new Map<string, RawLaw[]>();
  for (const [key] of refs) if (!todo.some(([k]) => k === key)) results.set(key, storedByBill.get(key)!);
  let done = 0;
  let cached = 0;
  const queue = [...todo];
  await Promise.all(
    Array.from({ length: WORKERS }, async () => {
      while (queue.length > 0) {
        const [key, ref] = queue.shift()!;
        const cacheFile = `${CACHE}/${congress}/${key}.json`;
        let laws = refresh ? null : await readJson<RawLaw[]>(cacheFile);
        if (laws && ref.updateDate !== null && laws.some((l) => l.updated === null || l.updated < ref.updateDate!)) laws = null;
        if (laws) {
          cached++;
          laws = laws.map((l) => {
            if ((l as Partial<RawLaw>).committees) return l;
            const filled: RawLaw = { ...(l as RawLaw), committees: [] };
            needsCommittees.add(filled);
            return filled;
          });
        }
        else {
          laws = (await fetchBill(api, congress, ref)).map((l) => rawLaw.parse(l));
          await writeAtomic(cacheFile, JSON.stringify(laws));
        }
        results.set(key, laws);
        if (++done % 100 === 0) console.log(`    ${done}/${todo.length} bills (${api.calls} calls, ${api.remaining ?? "?"} left this hour)`);
      }
    }),
  );
  // Top up: one /committees call for each stored bill that predates committee capture.
  const topUp = [...results.entries()].filter(([, ls]) => ls.some((l) => needsCommittees.has(l)));
  let topped = 0;
  await Promise.all(
    Array.from({ length: WORKERS }, async () => {
      while (topUp.length > 0) {
        const [key, ls] = topUp.shift()!;
        const ref = refs.get(key)!;
        const j = (await api.get(`/bill/${congress}/${ref.type.toLowerCase()}/${ref.number}/committees`)) as { committees?: ApiCommittee[] } | null;
        const committees = apiCommittees(j?.committees ?? []);
        const filled = ls.map((l) => ({ ...l, committees }));
        results.set(key, filled);
        await writeAtomic(`${CACHE}/${congress}/${key}.json`, JSON.stringify(filled));
        if (++topped % 100 === 0) console.log(`    committees: ${topped} bills topped up (${api.calls} calls)`);
      }
    }),
  );
  if (topped > 0) console.log(`  ${ordinal(congress)}: committees added to ${topped} bills`);
  const laws = [...results.values()].flat().sort((a, b) => a.number - b.number || a.law_id.localeCompare(b.law_id));
  const file = rawCongressFile.parse({ source: "congress-gov", congress, fetched: new Date().toISOString().slice(0, 10), list_count: count, max_number: max, laws });
  await writeAtomic(out, formatRawCongress(file));
  console.log(`  ${ordinal(congress)}: ${laws.length} laws written (${todo.length} bills fetched or cached, ${cached} from the resume cache, ${api.calls} calls so far)`);
}

async function main() {
  const key = process.env.CONGRESS_API_KEY;
  if (!key) throw new LawsDataError("CONGRESS_API_KEY is not set (put it in the environment or .env.local)");
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const refresh = args.includes("--refresh");
  const ps = args.indexOf("--per-second");
  const perSecond = ps >= 0 ? Number(args[ps + 1]) : 5;
  const wanted = args.filter((a) => /^\d+$/.test(a) && args[args.indexOf(a) - 1] !== "--per-second").map(Number);
  const congresses = wanted.length > 0 ? wanted : Array.from({ length: BILLSTATUS_FIRST_CONGRESS - LAWS_FIRST_CONGRESS }, (_, i) => LAWS_FIRST_CONGRESS + i);
  const api = new CongressApi({ key, perSecond });
  for (const c of congresses) {
    if (c < LAWS_FIRST_CONGRESS) throw new LawsDataError(`the page starts at the ${ordinal(LAWS_FIRST_CONGRESS)} Congress`);
    await fetchCongress(api, c, refresh);
  }
}

run("laws", main);
