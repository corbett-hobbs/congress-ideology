// Scratch for Session 3: for each Mayhew entry, list the laws of its Congress whose title / enacted summary share the most words with it.
import fs from "node:fs";
const ent = JSON.parse(fs.readFileSync("/tmp/mayhew-all.json", "utf8"));
const R = "pipeline/raw/";
const laws = [];
for (const s of ["congress-gov", "govinfo-billstatus"]) for (const f of fs.readdirSync(R + s).filter((n) => /^\d+\.json$/.test(n))) { const j = JSON.parse(fs.readFileSync(`${R}${s}/${f}`, "utf8")); if (s === "congress-gov" && j.congress === 108) continue; for (const l of j.laws) laws.push(l); }
const stop = new Set("the a an of to and for in on act bill law laws by with that this from as or new over under plan measure package program programs part federal national u.s. us billion million trillion year years 1973 1974 1975 1976 1977 1978 1979 1980 1981 1982 1983 1984 1985 1986 1987 1988 1989 1990 enacted more first made make makes ingredient january february march april may june july august september october november december".split(" "));
const tok = (s) => (s.toLowerCase().replace(/<[^>]+>/g, " ").match(/[a-z][a-z-]{2,}/g) ?? []).filter((w) => !stop.has(w)).map((w) => w.replace(/s$/, ""));
const range = process.argv[2].split("-").map(Number);
for (const e of ent.filter((x) => x.congress >= range[0] && x.congress <= range[1])) {
  const q = new Set(tok(e.quote));
  const cand = laws.filter((l) => l.congress === e.congress).map((l) => {
    const t = new Set(tok(l.title)); const s = new Set(tok((l.summary_html ?? "").slice(0, 500)));
    let sc = 0; for (const w of q) { if (t.has(w)) sc += 3; else if (s.has(w)) sc += 1; }
    return { l, sc };
  }).sort((a, b) => b.sc - a.sc).slice(0, 4);
  console.log(`\n[${e.entry_id}] ${e.quote.slice(0, 110)}`);
  for (const c of cand) console.log(`   ${c.sc.toString().padStart(2)} ${c.l.law_id.replace("-pub-", "-")} ${c.l.became_law[0]} ${c.l.bill_type}${c.l.bill_number} ${c.l.title.slice(0, 85)}`);
}
