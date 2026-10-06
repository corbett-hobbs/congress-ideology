// One-off extractor: DMDC "Active Duty Military Personnel Strengths by Regional Area and by Country (309A)" Sep 30 tables,
// 1996 and 1998-2005, into pipeline/reference/dmdc-309a-sep.csv. Run by hand when the reference needs rebuilding:
//
//   node pipeline/reference/extract-309a.mjs <dir-with-M01.zip-and-M05.zip-extracted>
//
// Needs `pdftotext` (poppler) on PATH; not part of CI or `pnpm transform`. The PDFs are U.S. DoD publications from
// the DMDC page (M01.zip, M05.zip, groupName=... historical reports); they are not committed, only this extract is.
// Each row is `year,seq,name,total,army,navy,marine_corps,air_force` (active duty, in table order, so repeated labels such
// as "Afloat" stay distinguishable by `seq`). Coast Guard is not in these tables (it is DHS, not DoD).
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2];
if (!root) throw new Error("usage: extract-309a.mjs <dir containing M05/ and M01/>");
const FILES = {
  1996: "M01/M01/FY96/Hst0996.pdf",
  1998: "M05/M05/m05sep98.pdf",
  1999: "M05/M05/M05SEP99.pdf",
  2000: "M05/M05/m05sep00.pdf",
  2001: "M05/M05/m05sep01.pdf",
  2002: "M05/M05/m05sep02.pdf",
  2003: "M05/M05/m05sep03.pdf",
  2004: "M05/M05/m05sep04.pdf",
  2005: "M05/M05/m05sep05.pdf",
};
const HEAD = /ACTIVE DUTY MILITARY PERSONNEL STRENGTHS BY REGIONAL AREA AND BY COUNTRY/i;
const out = ["year,seq,name,total,army,navy,marine_corps,air_force"];
for (const [year, rel] of Object.entries(FILES)) {
  const text = execFileSync("pdftotext", ["-layout", join(root, rel), "-"], { encoding: "utf8", maxBuffer: 1 << 28 });
  // Pages are separated by form feeds. Keep pages that carry the active-duty 309A heading (96 has it as plain "Regional Area/Country").
  const pages = text.split("\f").filter((p) => HEAD.test(p) || /Regional Area\/Country\s+Total\s+Army/.test(p));
  let seq = 0;
  let done = false;
  // The same pages carry later tables (all services' reserves, civilians, ...). The active-duty table is the first one and
  // ends at its "Total - Worldwide" row.
  for (const page of pages) {
    if (done) break;
    if (/Operation Iraqi Freedom \(OIF data/.test(page) === false && /^\s*Table [A-Z]/m.test(page)) continue;
    for (const line of page.split("\n")) {
      const m = /^\s*(.*?[A-Za-z\)\*\.])\s{2,}(\d[\d,]*)\s+(\d[\d,]*)\s+(\d[\d,]*)\s+(\d[\d,]*)\s+(\d[\d,]*)\s*$/.exec(line);
      if (!m) continue;
      const name = m[1].replace(/\s+/g, " ").replace(/^\*+/, "").replace(/\*+$/, "").trim();
      if (/^(Regional Area|Total \(In\/around)/.test(name)) continue;
      out.push(`${year},${seq++},"${name.replace(/"/g, "")}",${[m[2], m[3], m[4], m[5], m[6]].map((v) => v.replace(/,/g, "")).join(",")}`);
      if (/^Total - Worldwide/.test(name)) {
        done = true;
        break;
      }
    }
  }
}
writeFileSync("pipeline/reference/dmdc-309a-sep.csv", out.join("\n") + "\n");
console.log(`${out.length - 1} rows`);
