// Sample 40 laws per Congress (93..119), fetch bill detail + actions (all pages) + summaries. Cached via api().
import fs from "node:fs";
import { api, sample, CACHE, stats } from "./lib.mjs";
const lists = JSON.parse(fs.readFileSync(CACHE + "lists.json"));
const sampleRows = [];
for (let c = 93; c <= 119; c++) {
  const max = Math.max(...lists[c].flatMap((b) => b.laws.map((l) => +l.number.split("-")[1])));
  const nums = sample(Array.from({ length: max }, (_, i) => i + 1), 40, 1000 + c);
  for (const n of nums) {
    let b = lists[c].find((x) => x.laws.some((l) => l.number === `${c}-${n}`));
    if (!b) b = (await api(`/law/${c}/pub/${n}`)).bill;
    sampleRows.push({ congress: c, lawNo: n, type: b.type.toLowerCase(), number: b.number, listAction: b.latestAction, title: b.title });
  }
}
fs.writeFileSync(CACHE + "sample.json", JSON.stringify(sampleRows));
console.log("sample", sampleRows.length);
async function pool(items, k, fn) { let i = 0; await Promise.all(Array.from({ length: k }, async () => { while (i < items.length) { const it = items[i++]; await fn(it); } })); }
const result = [];
let done = 0;
await pool(sampleRows, 5, async (r) => {
  const base = `/bill/${r.congress}/${r.type}/${r.number}`;
  const d = await api(base);
  const bill = d.bill ?? {};
  const actions = [];
  for (let off = 0; ; off += 250) {
    const j = await api(base + "/actions", { limit: 250, offset: off });
    actions.push(...(j.actions ?? []));
    if (!j.pagination?.next) break;
  }
  const s = await api(base + "/summaries");
  result.push({ ...r, bill: { policyArea: bill.policyArea, sponsors: bill.sponsors, laws: bill.laws, latestAction: bill.latestAction, originChamber: bill.originChamber, cosponsors: bill.cosponsors?.count }, actions, summaries: s.summaries ?? [] });
  if (++done % 100 === 0) console.log(done, JSON.stringify(stats));
});
fs.writeFileSync(CACHE + "sample-detail.json", JSON.stringify(result));
console.log("done", JSON.stringify(stats));
