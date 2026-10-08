import fs from "node:fs";
import { api, CACHE, stats } from "./lib.mjs";
const out = {};
// find earliest Congress with public laws
for (let c = 119; c >= 1; c--) {
  const j = await api(`/law/${c}/pub`, { limit: 1 });
  const n = j.pagination?.count ?? 0;
  out[c] = { count: n };
  if (c <= 80 && n === 0) { console.log("first empty below", c); break; }
}
// private too for 93+
for (let c = 93; c <= 119; c++) { const j = await api(`/law/${c}/priv`, { limit: 1 }); out[c].priv = j.pagination?.count ?? 0; }
fs.writeFileSync(CACHE + "counts.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out));
console.log(stats);
