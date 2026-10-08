import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { RAW_DIR } from "./lib";
import type { WikiCaseEntry } from "./wikipedia-cases-lib";

/**
 * The opening of every Wikipedia case article named by `articles.json` -> `pipeline/raw/wikipedia-cases/leads.json`
 * (`{ "<article title>": "<plain-text lead, first 1,000 characters>" }`). The TextExtracts API returns 20 articles a request,
 * so about 230 requests, 150 ms apart, with an identifying User-Agent. Manual refresh, run after `fetch:wikipedia-cases`:
 *
 *   pnpm fetch:wikipedia-case-leads          # only titles not fetched before
 *   pnpm fetch:wikipedia-case-leads -- --all # every title again (picks up edits to the articles)
 *
 * The titles are the lists' own links and where their redirects land (the matcher hands back either).
 *
 * `transform/wikipedia-case-summaries.ts` picks one sentence from each lead; the site shows that sentence with a link back to
 * the article. Wikipedia text is CC BY-SA 4.0.
 */
const DIR = `${RAW_DIR}/wikipedia-cases`;
const USER_AGENT = "InsideGov-pipeline/0.1 (+https://github.com/corbett-hobbs/insidegov; case-article lead lookup, 20 titles per request)";
const LEAD_CHARS = 1000;
const BATCH = 20;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Page {
  title: string;
  extract?: string;
  missing?: boolean;
}
interface Reply {
  query?: { normalized?: { from: string; to: string }[]; redirects?: { from: string; to: string }[]; pages?: Page[] };
}

async function getBatch(titles: readonly string[]): Promise<Reply> {
  const api = new URL("https://en.wikipedia.org/w/api.php");
  api.search = new URLSearchParams({ format: "json", formatversion: "2", action: "query", prop: "extracts", exintro: "1", explaintext: "1", exlimit: String(BATCH), redirects: "1", titles: titles.join("|") }).toString();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(api, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(60_000) });
      if (res.status === 429 || res.status >= 500) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new Error(`GET ${titles[0]}… -> ${res.status}`);
      return (await res.json()) as Reply;
    } catch (e) {
      if (attempt === 2) throw e;
      await sleep(2000);
    }
  }
  throw new Error(`lead lookup failed for a batch starting "${titles[0]}"`);
}

async function main() {
  const articles = JSON.parse(await readFile(`${DIR}/articles.json`, "utf8")) as { entries: WikiCaseEntry[]; redirects: Record<string, string> };
  // The matcher hands back a list's own title or where its redirect lands, so keep a lead under both.
  const all = [...new Set([...articles.entries.flatMap((e) => (e.title ? [e.title] : [])), ...Object.values(articles.redirects)])].sort();
  const prior = process.argv.includes("--all") ? null : ((await readFile(`${DIR}/leads.json`, "utf8").then(JSON.parse).catch(() => null)) as { leads: Record<string, string>; none?: string[] } | null);
  const leads: Record<string, string> = { ...(prior?.leads ?? {}) };
  const none = new Set(prior?.none ?? []);
  const wanted = all.filter((t) => !(t in leads) && !none.has(t));
  for (let i = 0; i < wanted.length; i += BATCH) {
    const batch = wanted.slice(i, i + BATCH);
    const reply = await getBatch(batch);
    // A requested title can be normalised ("a_b" -> "A b") and then redirected; walk the chain back to the request.
    const hop = new Map<string, string>();
    for (const n of reply.query?.normalized ?? []) hop.set(n.to, n.from);
    for (const r of reply.query?.redirects ?? []) hop.set(r.to, hop.get(r.from) ?? r.from);
    const byRequest = new Map<string, Page>();
    for (const p of reply.query?.pages ?? []) byRequest.set(hop.get(p.title) ?? p.title, p);
    for (const t of batch) {
      const p = byRequest.get(t);
      const text = p && !p.missing ? (p.extract ?? "").trim() : "";
      if (!text) {
        none.add(t);
        continue;
      }
      leads[t] = text.slice(0, LEAD_CHARS);
    }
    if ((i / BATCH) % 25 === 0) console.log(`  ${Math.min(i + BATCH, wanted.length)} / ${wanted.length}`);
    await sleep(150);
  }
  const body = { fetched: new Date().toISOString().slice(0, 10), license: "Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0), Wikipedia contributors", lead_chars: LEAD_CHARS, none: [...none].sort(), leads };
  const text = JSON.stringify(body) + "\n";
  await writeFile(`${DIR}/leads.json`, text);
  await writeFile(`${DIR}/leads-manifest.json`, JSON.stringify({ fetched: body.fetched, license: body.license, titles: all.length, with_lead: Object.keys(leads).length, without_lead: none.size, sha256: createHash("sha256").update(text).digest("hex") }, null, 2) + "\n");
  console.log(`wikipedia case leads: ${Object.keys(leads).length} of ${all.length} titles (${none.size} with none), ${wanted.length} fetched this run`);
}

// Every failure here is a request that would not go through, so exit 2 ("host unreachable"), as `wikipedia-cases.ts` does.
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(2);
});
