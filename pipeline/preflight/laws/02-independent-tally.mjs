// Independent public-law tally: GovInfo Statutes at Large granules (PUBLICLAW class) per volume,
// and GovInfo PLAW packages (104th on). Compared with Congress.gov /law/{c}/pub counts.
import fs from "node:fs";
import { KEY, CACHE } from "./lib.mjs";
const g = async (u) => { for (let i=0;i<5;i++){ const r = await fetch(u + (u.includes("?")?"&":"?") + "api_key=" + KEY); if (r.ok) return r.json(); await new Promise(s=>setTimeout(s,2000*(i+1))); } throw new Error(u); };
const counts = JSON.parse(fs.readFileSync(CACHE + "counts.json"));
const byCongress = {};
for (let vol = 87; vol <= 138; vol++) {
  const sum = await g(`https://api.govinfo.gov/packages/STATUTE-${vol}/summary`).catch(() => null);
  if (!sum) { console.log("no volume", vol); continue; }
  const cong = Number(sum.congress);
  let tally = {}, mark = "*";
  while (mark) {
    const j = await g(`https://api.govinfo.gov/packages/STATUTE-${vol}/granules?offsetMark=${encodeURIComponent(mark)}&pageSize=1000`);
    for (const x of j.granules) tally[x.granuleClass] = (tally[x.granuleClass] ?? 0) + 1;
    mark = j.nextPage ? new URL(j.nextPage).searchParams.get("offsetMark") : null;
  }
  (byCongress[cong] ??= { volumes: [], public: 0, other: {} }).volumes.push(vol);
  byCongress[cong].public += tally.PUBLICLAW ?? 0;
  for (const [k, v] of Object.entries(tally)) if (k !== "PUBLICLAW") byCongress[cong].other[k] = (byCongress[cong].other[k] ?? 0) + v;
  if (cong >= 119) break;
}
const rows = [];
for (const c of Object.keys(byCongress).map(Number).sort((a,b)=>a-b)) {
  if (c < 93) continue;
  rows.push({ congress: c, volumes: byCongress[c].volumes.join("+"), statutes_public: byCongress[c].public, api: counts[c]?.count, diff: (counts[c]?.count ?? 0) - byCongress[c].public, other: JSON.stringify(byCongress[c].other) });
}
console.table(rows);
fs.writeFileSync(CACHE + "independent-tally.json", JSON.stringify(rows, null, 1));
