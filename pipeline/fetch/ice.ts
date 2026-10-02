import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { RAW_DIR, download, logResult } from "./lib";
import { iceCatalog, type IceSource } from "../../lib/enforcement-entities";

/**
 * ICE removals track fetch: downloads the ICE-published documents listed in
 * `pipeline/reference/ice-removals-catalog.json` into `pipeline/raw/ice/`, then
 * writes a plain-text extract next to each one (`<file>.txt`). The transform
 * reads ONLY the text extracts, and checks every published number against the
 * quote the catalog cites for it, so a snapshot that drifts fails the build.
 *
 * There is no scheduled refresh: ICE's year-end figures are locked once
 * published and its URLs are not stable (a new year arrives in a new report or
 * dashboard, not at a known address). A monthly workflow (ice-annual-review.yml) opens an issue
 * when a year that should be locked is missing from the catalog. See
 * docs/IMMIGRATION_ENFORCEMENT_METHODOLOGY.md, "Refreshing". Existing snapshots are never re-downloaded unless `--refresh`.
 *
 * Needs `pdftotext` (poppler) and `unzip` on PATH for the text extracts.
 */
const DIR = `${RAW_DIR}/ice`;
const CATALOG = "pipeline/reference/ice-removals-catalog.json";

const entities = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&ldquo;|&rdquo;|&#822[01];/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

/** Visible text of an HTML page, one block per line (scripts/styles dropped). */
export function htmlToText(html: string): string {
  return entities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]*>/g, "\n"),
  )
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/** sheet1 of an .xlsx as `a | b | c` lines (shared strings resolved; no formulas needed). */
export function xlsxToText(path: string): string {
  const unzip = (member: string) => execFileSync("unzip", ["-p", path, member], { maxBuffer: 1 << 26 }).toString("utf8");
  const strings = [...unzip("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    entities([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")),
  );
  const lines: string[] = [];
  for (const row of unzip("xl/worksheets/sheet1.xml").matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const c of row[1].matchAll(/<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const v = c[2]?.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      if (v === undefined) continue;
      cells.push(/t="s"/.test(c[1]) ? strings[Number(v)] : v);
    }
    if (cells.length) lines.push(cells.join(" | "));
  }
  return lines.join("\n") + "\n";
}

async function extract(s: IceSource): Promise<void> {
  const path = `${DIR}/${s.file}`;
  let text: string;
  if (s.kind === "pdf") text = execFileSync("pdftotext", ["-layout", path, "-"], { maxBuffer: 1 << 28 }).toString("utf8");
  else if (s.kind === "xlsx") text = xlsxToText(path);
  else text = htmlToText(await readFile(path, "utf8")) + "\n";
  await writeFile(`${DIR}/${s.text_file}`, text);
}

async function main() {
  const refresh = process.argv.includes("--refresh");
  const catalog = iceCatalog.parse(JSON.parse(await readFile(CATALOG, "utf8")));
  console.log("fetch:ice");
  for (const s of catalog.sources) {
    const path = `${DIR}/${s.file}`;
    if (refresh || !existsSync(path)) logResult(await download(s.url, path));
    await extract(s);
  }
  console.log(`  ${catalog.sources.length} sources, text extracts written`);
}

if (process.argv[1]?.endsWith("ice.ts")) {
  main().catch((err: unknown) => {
    console.error("\nfetch:ice FAILED");
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
