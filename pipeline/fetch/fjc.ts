import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { download, logResult, RAW_DIR, run } from "./lib";

/**
 * Federal Judicial Center — Biographical Directory of Article III Federal
 * Judges (public domain). Source of Supreme Court justice bios (full name,
 * birth/death year, appointing president + party, nomination / confirmation /
 * commission / senior-status dates) that Martin-Quinn's last-name-only file
 * lacks. Two CSVs are kept: `demographics.csv` (names, birth/death) and
 * `federal-judicial-service.csv` (one row per judicial appointment).
 *
 * Page: https://www.fjc.gov/history/judges/biographical-directory-article-iii-federal-judges-export
 * Files land in pipeline/raw/fjc/ and are committed.
 */
const BASE = "https://www.fjc.gov/sites/default/files/history";
const DIR = `${RAW_DIR}/fjc`;
const FILES = ["demographics.csv", "federal-judicial-service.csv"];

await run("fjc", async () => {
  const sha256: Record<string, string> = {};
  for (const name of FILES) {
    const r = await download(`${BASE}/${name}`, `${DIR}/${name}`);
    logResult(r);
    const text = (await readFile(r.path, "utf8")).slice(0, 200);
    if (text.trimStart().startsWith("<")) {
      throw new Error(`${name}: got HTML, not CSV — the FJC page may have moved.`);
    }
    sha256[name] = createHash("sha256").update(await readFile(r.path)).digest("hex");
  }
  await writeFile(
    `${DIR}/SOURCE.json`,
    JSON.stringify(
      {
        page: "https://www.fjc.gov/history/judges/biographical-directory-article-iii-federal-judges-export",
        urls: Object.fromEntries(FILES.map((f) => [f, `${BASE}/${f}`])),
        retrieved_on: new Date().toISOString().slice(0, 10),
        sha256,
      },
      null,
      2,
    ) + "\n",
  );
});
