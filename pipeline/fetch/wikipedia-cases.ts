import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { RAW_DIR } from "./lib";
import { parseTermPage, parseVolumePage, type WikiCaseEntry } from "./wikipedia-cases-lib";

/**
 * Wikipedia's Supreme Court case indexes -> `pipeline/raw/wikipedia-cases/articles.json`: for every case the volume lists
 * and the term lists name, the article it links (or that it has none). One parse-API request per page (about 280 volume
 * pages, one term page per recent term), 150 ms apart, with an identifying User-Agent. Weekly via the freshness workflow; not in `fetch:all`.
 *
 *   pnpm fetch:wikipedia-cases
 *
 * The transform joins these to SCDB by U.S. Reports cite, docket, then name and year (`transform/wikipedia-cases.ts`);
 * the outputs hold article titles only (links back), never Wikipedia's prose. CC BY-SA 4.0.
 */
const DIR = `${RAW_DIR}/wikipedia-cases`;
const USER_AGENT = "InsideGov-pipeline/0.1 (+https://github.com/corbett-hobbs/insidegov; case-article link lookup, one request per index page)";
/** SCDB's file starts with the October 1946 term, which is volume 329. */
const FIRST_VOLUME = 329;
/** Term lists cover decisions newer than the last volume list (and the cases a volume list leaves out). */
const FIRST_TERM_PAGE = 2010;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Parsed {
  html: string;
  revid: number;
}

async function parsePage(title: string): Promise<Parsed | null> {
  const api = new URL("https://en.wikipedia.org/w/api.php");
  api.search = new URLSearchParams({ format: "json", formatversion: "2", action: "parse", prop: "text|revid", page: title, redirects: "1" }).toString();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(api, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(60_000) });
      if (res.status === 429 || res.status >= 500) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new Error(`GET ${title} -> ${res.status}`);
      const json = (await res.json()) as { error?: { code: string }; parse?: { text: string; revid: number } };
      if (json.error?.code === "missingtitle") return null;
      if (!json.parse) throw new Error(`${title}: ${JSON.stringify(json.error ?? json).slice(0, 200)}`);
      return { html: json.parse.text, revid: json.parse.revid };
    } catch (e) {
      if (attempt === 2) {
        console.error(e instanceof Error ? e.message : e);
        process.exit(2);
      }
      await sleep(2000);
    }
  }
  return null;
}

/**
 * Where each title really lives. A list links "Costco Wholesale Corp. v. Omega, S. A." (a redirect) on one page and
 * "Omega S.A. v. Costco Wholesale Corp." on another; both are one article, and the join must see them as one. Redirects
 * into a section of a larger article keep the title the list used (Wikipedia follows it, fragment and all).
 */
interface RedirectReply {
  query?: { normalized?: { from: string; to: string }[]; redirects?: { from: string; to: string; tofragment?: string }[] };
}

async function redirectBatch(api: URL): Promise<RedirectReply | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(api, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(60_000) });
      if (res.ok) return (await res.json()) as RedirectReply;
      await sleep(2000 * (attempt + 1));
    } catch {
      await sleep(2000);
    }
  }
  return null;
}

async function resolveRedirects(titles: readonly string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const api = new URL("https://en.wikipedia.org/w/api.php");
    api.search = new URLSearchParams({ format: "json", formatversion: "2", action: "query", redirects: "1", titles: batch.join("|") }).toString();
    const json = await redirectBatch(api);
    if (!json) throw new Error(`redirect lookup failed for a batch starting "${batch[0]}"`);
    const norm = new Map((json.query?.normalized ?? []).map((n) => [n.to, n.from]));
    for (const r of json.query?.redirects ?? []) if (!r.tofragment) out[norm.get(r.from) ?? r.from] = r.to;
    await sleep(150);
  }
  return out;
}

async function main() {
  const entries: WikiCaseEntry[] = [];
  const pages: { title: string; revid: number; rows: number }[] = [];
  for (let v = FIRST_VOLUME; ; v++) {
    const title = `List of United States Supreme Court cases, volume ${v}`;
    const p = await parsePage(title);
    if (!p) {
      console.log(`  no page for volume ${v}; volumes ${FIRST_VOLUME}-${v - 1} fetched`);
      break;
    }
    const rows = parseVolumePage(p.html, v, title);
    if (rows.length === 0) throw new Error(`${title}: no rows parsed; the table's markup has probably changed`);
    entries.push(...rows);
    pages.push({ title, revid: p.revid, rows: rows.length });
    await sleep(150);
  }
  const thisYear = new Date().getUTCFullYear();
  for (let t = FIRST_TERM_PAGE; t <= thisYear; t++) {
    const title = `${t} term opinions of the Supreme Court of the United States`;
    const p = await parsePage(title);
    if (!p) continue;
    const rows = parseTermPage(p.html, title);
    if (rows.length === 0) throw new Error(`${title}: no rows parsed; the table's markup has probably changed`);
    entries.push(...rows);
    pages.push({ title, revid: p.revid, rows: rows.length });
    await sleep(150);
  }
  const redirects = await resolveRedirects([...new Set(entries.flatMap((e) => (e.title ? [e.title] : [])))]);
  const body = { fetched: new Date().toISOString().slice(0, 10), license: "Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0), Wikipedia contributors", pages, redirects, entries };
  const text = JSON.stringify(body) + "\n";
  // Nothing about the cases changed (only revision ids or the fetch date): leave the files alone, so the weekly job opens no pull request.
  const before = await readFile(`${DIR}/articles.json`, "utf8").then((t) => JSON.parse(t) as { entries: unknown; redirects: unknown }).catch(() => null);
  if (before && JSON.stringify([before.entries, before.redirects]) === JSON.stringify([entries, redirects])) {
    console.log(`wikipedia cases: unchanged (${pages.length} pages, ${entries.length} rows)`);
    return;
  }
  await mkdir(DIR, { recursive: true });
  await writeFile(`${DIR}/articles.json`, text);
  await writeFile(`${DIR}/manifest.json`, JSON.stringify({ fetched: body.fetched, license: body.license, pages: pages.length, entries: entries.length, linked: entries.filter((e) => e.title).length, sha256: createHash("sha256").update(text).digest("hex") }, null, 2) + "\n");
  console.log(`wikipedia cases: ${pages.length} pages, ${entries.length} rows, ${entries.filter((e) => e.title).length} with an article`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
