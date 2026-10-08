// Bill detail (policyArea, sponsor, laws, latestAction) from the API for EVERY 108th and 118th law, to compare with the bulk XML.
import fs from "node:fs";
import { api, CACHE } from "./lib.mjs";
const B = JSON.parse(fs.readFileSync(CACHE + "bulk-laws.json"));
const items = Object.values(B);
const out = {};
let i = 0, done = 0;
await Promise.all(Array.from({ length: 4 }, async () => { while (i < items.length) { const b = items[i++]; const d = await api(`/bill/${b.congress}/${b.type.toLowerCase()}/${b.number}`); out[`${b.congress}${b.type}${b.number}`] = d.bill; if (++done % 100 === 0) console.log(done); } }));
fs.writeFileSync(CACHE + "api-detail-108-118.json", JSON.stringify(out));
console.log("done", done);
