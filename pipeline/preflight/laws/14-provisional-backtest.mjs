// Session 3b back-test: score candidate rules for a provisional "major" flag against Mayhew over the 113th-118th.
// usage: node pipeline/preflight/laws/14-provisional-backtest.mjs
import fs from "node:fs";
const laws = JSON.parse(fs.readFileSync("pipeline/output/laws.json", "utf8"));
const acts = JSON.parse(fs.readFileSync("pipeline/raw/wikipedia-laws/acts.json", "utf8"));
const art = new Map(acts.rows.map((r) => [r.law_id, r]));
const test = laws.filter((l) => l.congress >= 113 && l.congress <= 118);
const id = (l) => `${l.congress}-${l.number}`;
const lead = (l) => { const r = art.get(id(l)); return r?.title ? acts.leads[r.title]?.lead ?? "" : ""; };
const KEY = /\b(landmark|major|significant|sweeping|historic|comprehensive|signature|largest|biggest|most (?:important|extensive|far-reaching)|overhaul|reform|stimulus)\b/i;
const rules = {
  "a: has its own article": (l) => !!art.get(id(l))?.title,
  "b: article lead says major/landmark/...": (l) => KEY.test(lead(l)),
  "b2: lead says landmark/major/historic/sweeping only": (l) => /\b(landmark|major|historic|sweeping)\b/i.test(lead(l)),
};
function score(name, f, set) {
  let tp = 0, fp = 0, fn = 0;
  for (const l of set) { const p = f(l), m = l.major === true; if (p && m) tp++; else if (p) fp++; else if (m) fn++; }
  return { name, flagged: tp + fp, mayhew: tp + fn, prec: tp / (tp + fp || 1), rec: tp / (tp + fn || 1) };
}
const fmt = (s) => `${s.name.padEnd(52)} flagged ${String(s.flagged).padStart(4)} / mayhew ${String(s.mayhew).padStart(3)}  precision ${(100 * s.prec).toFixed(1).padStart(5)}%  recall ${(100 * s.rec).toFixed(1).padStart(5)}%`;
for (const [n, f] of Object.entries(rules)) {
  console.log(fmt(score(n, f, test)));
  for (let c = 113; c <= 118; c++) console.log("    " + c + " " + fmt(score(n, f, test.filter((l) => l.congress === c))).slice(52));
}

// ---- (c) size signals: CRS summary length, omnibus / reconciliation wording, plus combinations with (a)
const R = "pipeline/raw/";
const raw = new Map();
for (const s of ["congress-gov", "govinfo-billstatus"]) for (const f of fs.readdirSync(R + s).filter((n) => /^\d+\.json$/.test(n))) {
  const j = JSON.parse(fs.readFileSync(`${R}${s}/${f}`, "utf8"));
  if (s === "congress-gov" && j.congress === 108) continue;
  for (const l of j.laws) raw.set(l.law_id.replace("-pub-", "-"), l);
}
const stext = (l) => (raw.get(id(l))?.summary_html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
console.log("\n(c) size signals");
const sums = test.map((l) => stext(l).length).sort((a, b) => a - b);
console.log("summary length quantiles", [0.5, 0.75, 0.9, 0.95].map((q) => sums[Math.floor(q * sums.length)]).join(" / "), "no summary:", sums.filter((x) => !x).length);
for (const t of [1000, 2000, 3000, 5000, 8000, 12000]) console.log(fmt(score(`c: summary >= ${t} chars`, (l) => stext(l).length >= t, test)));
const OMN = /\b(omnibus|reconciliation|consolidated appropriations|continuing appropriations|authorization act|national defense authorization)\b/i;
console.log(fmt(score("c: omnibus/reconciliation/NDAA wording", (l) => OMN.test(l.title) || OMN.test(stext(l).slice(0, 600)), test)));
for (const t of [2000, 5000]) console.log(fmt(score(`c: summary >= ${t} AND has article`, (l) => stext(l).length >= t && !!art.get(id(l))?.title, test)));
console.log(fmt(score("a AND b (article + lead says major)", (l) => rules["a: has its own article"](l) && KEY.test(lead(l)), test)));
console.log(fmt(score("a OR summary >= 5000", (l) => rules["a: has its own article"](l) || stext(l).length >= 5000, test)));
// misses: Mayhew laws no rule catches
const miss = test.filter((l) => l.major && !art.get(id(l))?.title && stext(l).length < 2000);
console.log("\nMayhew laws with no article and a short summary:", miss.length, "e.g.", miss.slice(0, 6).map((l) => `${id(l)} ${l.title.slice(0, 50)}`));

// ---- (d) model reading the lead under the verbatim-evidence guard (cached in pipeline/raw/wikipedia-laws/model-rule.json)
const mr = JSON.parse(fs.readFileSync("pipeline/raw/wikipedia-laws/model-rule.json", "utf8"));
console.log("\n(d) model + verbatim guard");
const dRule = (l) => { const t = art.get(id(l))?.title; return !!(t && mr[t]?.major); };
console.log(fmt(score("d: model says lead calls it major (quote verbatim)", dRule, test)));
for (let c = 113; c <= 118; c++) console.log("    " + c + " " + fmt(score("d", dRule, test.filter((l) => l.congress === c))).slice(52));
console.log("ceiling: recall if every law with an article were flagged =", (100 * score("x", rules["a: has its own article"], test).rec).toFixed(1) + "%");
