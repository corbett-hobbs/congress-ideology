// Reconcile law NUMBERS (not just counts): API list vs per-number endpoint vs Statutes at Large granules (93, 94, 99).
import fs from "node:fs";
import { api, KEY, CACHE } from "./lib.mjs";
const lists = JSON.parse(fs.readFileSync(CACHE + "lists.json"));
const g = async (u) => { for (let i=0;i<6;i++){ const r = await fetch(u + (u.includes("?")?"&":"?") + "api_key=" + KEY); if (r.ok) return r.json(); await new Promise(s=>setTimeout(s,2000*(i+1))); } throw new Error(u); };
const out = {};
// 1. per-number fill for gaps in every Congress
for (const c of Object.keys(lists)) {
  const have = new Set(lists[c].flatMap((b) => b.laws.map((l) => l.number)));
  const max = Math.max(...[...have].map((n) => +n.split("-")[1]));
  const gaps = []; for (let i = 1; i <= max; i++) if (!have.has(`${c}-${i}`)) gaps.push(i);
  const filled = [], unresolved = [];
  for (const n of gaps) { const j = await api(`/law/${c}/pub/${n}`); (j._404 ? unresolved : filled).push(n); }
  const dupBills = lists[c].length - new Set(lists[c].map((b) => b.type + b.number)).size;
  out[c] = { rows: lists[c].length, dupRows: dupBills, max, gaps: gaps.length, filledByNumber: filled.length, unresolved: unresolved.join(","), universe: max - unresolved.length };
}
console.table(out);
fs.writeFileSync(CACHE + "reconcile-api.json", JSON.stringify(out, null, 1));
// 2. Statutes granules numbers for 93, 94, 99
const vols = { 93: [87, 88], 94: [89, 90], 99: [99, 100] };
for (const [c, vs] of Object.entries(vols)) {
  const nums = [];
  for (const v of vs) {
    let mark = "*";
    while (mark) {
      const j = await g(`https://api.govinfo.gov/packages/STATUTE-${v}/granules?offsetMark=${encodeURIComponent(mark)}&pageSize=1000`);
      for (const x of j.granules) if (x.granuleClass === "PUBLICLAW") {
        const f = CACHE + "gran/" + x.granuleId + ".json"; fs.mkdirSync(CACHE + "gran", { recursive: true });
        let s; if (fs.existsSync(f)) s = JSON.parse(fs.readFileSync(f)); else { s = await g(x.granuleLink); fs.writeFileSync(f, JSON.stringify({ number: s.number, id: s.identifier, title: s.title, date: s.dateIssued })); s = { number: s.number, id: s.identifier }; }
        nums.push(s.id?.publicLawCitation ?? "?" + s.number);
      }
      mark = j.nextPage ? new URL(j.nextPage).searchParams.get("offsetMark") : null;
    }
  }
  const cnt = {}; for (const n of nums) cnt[n] = (cnt[n] ?? 0) + 1;
  const dup = Object.entries(cnt).filter(([, v]) => v > 1);
  const set = new Set(nums.map((n) => +n.replace(/.*-/, "")));
  const max = Math.max(...set); const miss = []; for (let i = 1; i <= max; i++) if (!set.has(i)) miss.push(i);
  console.log(c, "granules", nums.length, "distinct", set.size, "max", max, "missing numbers", miss.join(","), "dup", JSON.stringify(dup));
}
