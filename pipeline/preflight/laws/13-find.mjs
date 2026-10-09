// usage: node 13-find.mjs <congress> <regex> [more "congress regex" pairs...]  -> laws whose title or summary matches
import fs from "node:fs";
const R = "pipeline/raw/";
const laws = [];
for (const s of ["congress-gov", "govinfo-billstatus"]) for (const f of fs.readdirSync(R + s).filter((n) => /^\d+\.json$/.test(n))) { const j = JSON.parse(fs.readFileSync(`${R}${s}/${f}`, "utf8")); if (s === "congress-gov" && j.congress === 108) continue; for (const l of j.laws) laws.push(l); }
const a = process.argv.slice(2);
for (let i = 0; i < a.length; i += 2) {
  const c = Number(a[i]), re = new RegExp(a[i + 1], "i");
  console.log(`-- ${c} /${a[i + 1]}/`);
  for (const l of laws.filter((x) => x.congress === c && (re.test(x.title) || re.test((x.summary_html ?? "").replace(/<[^>]+>/g, " ").slice(0, 400)))).slice(0, 6)) console.log(`   ${l.law_id.replace("-pub-", "-")} ${l.became_law[0]} ${l.bill_type}${l.bill_number} ${l.title.slice(0, 95)}`);
}
