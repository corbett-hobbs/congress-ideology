// Fetch the full public-law list for every Congress 93..119 (limit 250/page). Cached.
import fs from "node:fs";
import { api, CACHE, stats } from "./lib.mjs";
const all = {};
for (let c = 93; c <= 119; c++) {
  const rows = [];
  for (let off = 0; ; off += 250) {
    const j = await api(`/law/${c}/pub`, { limit: 250, offset: off });
    rows.push(...j.bills);
    if (!j.pagination.next) break;
  }
  all[c] = rows;
}
fs.writeFileSync(CACHE + "lists.json", JSON.stringify(all));
const out = [];
for (const c of Object.keys(all)) {
  const rows = all[c];
  const nums = rows.flatMap((b) => b.laws.filter((l) => l.type === "Public Law").map((l) => Number(l.number.split("-")[1])));
  const set = new Set(nums);
  const max = Math.max(...nums);
  const dupes = nums.length - set.size;
  const missing = []; for (let i = 1; i <= max; i++) if (!set.has(i)) missing.push(i);
  const multi = rows.filter((b) => b.laws.length !== 1).length;
  out.push({ congress: +c, rows: rows.length, lawNumbers: nums.length, max, dupes, missing: missing.length, missingList: missing.slice(0, 8).join(","), billsWithNot1Law: multi });
}
console.table(out);
console.log(stats);
