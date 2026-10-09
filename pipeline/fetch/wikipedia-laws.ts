import { mkdir, writeFile } from "node:fs/promises";
import { RAW_DIR } from "./lib";
import { parseActList, type WikiLawRow } from "./wikipedia-laws-lib";

/**
 * Session 3b back-test input: Wikipedia's per-Congress act lists (which public laws have an article) and the lead of each
 * such article. Official MediaWiki API, identifying User-Agent, a request per Congress and one per 20 articles. Manual, not
 * part of `fetch:all`.
 *
 *   pnpm fetch:wikipedia-laws                # 113th-119th
 *   pnpm fetch:wikipedia-laws -- 93 119      # a range
 *
 * Text is CC BY-SA 4.0; the pipeline outputs keep only which laws have an article, its title and the verbatim sentences quoted
 * as evidence.
 */
type ApiJson = {
  parse: { text: string };
  query: {
    redirects?: { from: string; to: string }[];
    normalized?: { from: string; to: string }[];
    pages: { title: string; missing?: boolean; extract?: string; length?: number; pageprops?: { disambiguation?: string } }[];
  };
};
const DIR = `${RAW_DIR}/wikipedia-laws`;
const UA = "InsideGov-pipeline/0.1 (+https://github.com/corbett-hobbs/insidegov; public-law article lookup)";
const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;

async function api(params: Record<string, string>): Promise<ApiJson> {
  const u = new URL("https://en.wikipedia.org/w/api.php");
  u.search = new URLSearchParams({ format: "json", formatversion: "2", ...params }).toString();
  for (let i = 0; i < 4; i++) {
    const res = await fetch(u, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(60_000) });
    if (res.ok) return res.json();
    await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
  }
  throw new Error(`GET ${u} failed`);
}

async function main() {
  const [from = 113, to = 119] = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);
  await mkdir(DIR, { recursive: true });
  const rows: WikiLawRow[] = [];
  for (let c = from; c <= to; c++) {
    const j = await api({ action: "parse", prop: "text", page: `List of acts of the ${ord(c)} United States Congress` });
    const r = parseActList(j.parse.text);
    console.log(`${ord(c)}: ${r.length} laws, ${r.filter((x) => x.title).length} with an article`);
    rows.push(...r);
  }
  // The lists leave many acts unlinked although the article exists (FAA Reauthorization Act of 2024): look the printed
  // short title up by name, following redirects, and take it when it is a real page that is not a disambiguation page.
  const byName = new Map<string, string>();
  const names = [...new Set(rows.flatMap((r) => (!r.title && r.name ? [r.name.split(/, with:/)[0]!] : [])))];
  for (let i = 0; i < names.length; i += 50) {
    const j = await api({ action: "query", redirects: "1", prop: "pageprops", ppprop: "disambiguation", titles: names.slice(i, i + 50).join("|") });
    const redirect = new Map((j.query.redirects ?? []).map((x) => [x.from, x.to]));
    const norm = new Map((j.query.normalized ?? []).map((x) => [x.from, x.to]));
    const pages = new Map(j.query.pages.map((p) => [p.title, p]));
    for (const n of names.slice(i, i + 50)) {
      const t = redirect.get(norm.get(n) ?? n) ?? norm.get(n) ?? n;
      const p = pages.get(t);
      if (p && !p.missing && !p.pageprops?.disambiguation) byName.set(n, t);
    }
  }
  for (const r of rows) if (!r.title && r.name && byName.has(r.name.split(/, with:/)[0]!)) r.title = byName.get(r.name.split(/, with:/)[0]!)!;
  console.log(`looked up ${names.length} unlinked short titles by name: ${byName.size} are articles`);
  const titles = [...new Set(rows.flatMap((r) => (r.title ? [r.title] : [])))];
  const leads: Record<string, { title: string; lead: string; length: number }> = {};
  for (let i = 0; i < titles.length; i += 20) {
    const batch = titles.slice(i, i + 20);
    const j = await api({ action: "query", prop: "extracts", exintro: "1", explaintext: "1", exlimit: "20", redirects: "1", titles: batch.join("|") });
    const redirect = new Map<string, string>((j.query.redirects ?? []).map((x) => [x.to, x.from]));
    const norm = new Map<string, string>((j.query.normalized ?? []).map((x) => [x.to, x.from]));
    for (const p of j.query.pages) {
      const asked = redirect.get(p.title) ?? p.title;
      const key = norm.get(asked) ?? asked;
      leads[key] = { title: p.title, lead: p.extract ?? "", length: p.extract?.length ?? 0 };
    }
    process.stdout.write(`\rleads ${Math.min(i + 20, titles.length)}/${titles.length}`);
  }
  console.log();
  await writeFile(`${DIR}/acts.json`, JSON.stringify({ fetched: new Date().toISOString().slice(0, 10), license: "CC BY-SA 4.0, Wikipedia contributors", rows, leads }, null, 1) + "\n");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
