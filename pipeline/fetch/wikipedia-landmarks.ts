import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { landmarksManifest, type LandmarksManifest } from "../../lib/decisions-entities";
import { RAW_DIR } from "./lib";

/**
 * Wikipedia's "List of landmark court decisions in the United States": one API request for the page's wikitext (the
 * list is grouped under topic headings and each case carries a {{ussc|volume|page|year}} citation template). Official
 * MediaWiki API, an identifying User-Agent, a single request. Manual refresh, not part of `fetch:all`.
 *
 *   pnpm fetch:landmarks
 *
 * The wikitext is CC BY-SA 4.0 and is kept as the raw snapshot; the pipeline's outputs hold only which cases it names,
 * the heading each sits under and the article title (a link back), never its prose. Exit 2 when the API is unreachable.
 */
const PAGE = "List of landmark court decisions in the United States";
const DIR = `${RAW_DIR}/wikipedia-landmarks`;
const USER_AGENT = "InsideGov-pipeline/0.1 (+https://github.com/corbett-hobbs/insidegov; landmark-case flag lookup, one request)";

async function main() {
  const api = new URL("https://en.wikipedia.org/w/api.php");
  api.search = new URLSearchParams({ format: "json", formatversion: "2", action: "query", prop: "revisions", rvprop: "content|ids|timestamp", rvslots: "main", titles: PAGE }).toString();
  let res: Response;
  try {
    res = await fetch(api, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(60_000) });
  } catch (e) {
    console.error(`GET ${api}: ${e instanceof Error ? e.message : e}`);
    process.exit(2);
  }
  if (!res.ok) {
    console.error(`GET ${api} -> ${res.status}`);
    process.exit(2);
  }
  const json = (await res.json()) as { query?: { pages?: { missing?: boolean; revisions?: { revid: number; timestamp: string; slots: { main: { content: string } } }[] }[] } };
  const rev = json.query?.pages?.[0]?.revisions?.[0];
  if (!rev) throw new Error(`no revision returned for "${PAGE}"`);
  const text = rev.slots.main.content;
  if (!text.includes("{{ussc|")) throw new Error("the page no longer carries {{ussc}} citation templates; the parser needs a new look");
  await mkdir(DIR, { recursive: true });
  await writeFile(`${DIR}/list.wikitext`, text);
  const manifest: LandmarksManifest = {
    page: PAGE,
    url: `https://en.wikipedia.org/wiki/${PAGE.replaceAll(" ", "_")}`,
    revid: rev.revid,
    revision_timestamp: rev.timestamp,
    sha256: createHash("sha256").update(text).digest("hex"),
    fetched: new Date().toISOString().slice(0, 10),
    license: "Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0), Wikipedia contributors",
  };
  await writeFile(`${DIR}/manifest.json`, JSON.stringify(landmarksManifest.parse(manifest), null, 2) + "\n");
  console.log(`wikipedia landmarks: revision ${rev.revid} (${rev.timestamp}), ${text.length} chars`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
