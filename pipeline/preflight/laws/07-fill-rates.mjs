// Items 2, 3, 7: fill rates by Congress, signing date vs list date, sponsor ids vs legislators files.
import fs from "node:fs";
import { CACHE } from "./lib.mjs";
const S = JSON.parse(fs.readFileSync(CACHE + "sample-detail.json"));
const ids = new Set();
for (const f of ["legislators-current.yaml", "legislators-historical.yaml"]) {
  const t = fs.readFileSync(new URL(`../../raw/congress-legislators/${f}`, import.meta.url), "utf8");
  for (const m of t.matchAll(/^\s+bioguide: (\S+)/gm)) ids.add(m[1]);
}
console.log("legislator bioguide ids:", ids.size);
const pct = (a, b) => (b ? (100 * a / b).toFixed(0) + "%" : "-");
const rows = {};
const dateDiffs = [], diffRows = [], overrides = [], missingSponsors = [];
for (const r of S) {
  const o = (rows[r.congress] ??= { n: 0, policy: 0, sponsor: 0, summary: 0, sumText: 0, became: 0, sponsorInLeg: 0, sameDate: 0, hasBilldetail: 0 });
  o.n++;
  const b = r.bill ?? {};
  if (b.policyArea?.name) o.policy++;
  const sp = b.sponsors?.[0];
  if (sp?.bioguideId) { o.sponsor++; if (ids.has(sp.bioguideId)) o.sponsorInLeg++; else missingSponsors.push([r.congress, r.type + r.number, sp.bioguideId, sp.fullName]); }
  if (r.summaries.length) o.summary++;
  if (r.summaries.some((s) => (s.text ?? "").replace(/<[^>]+>/g, "").trim().length > 40)) o.sumText++;
  const bl = r.actions.filter((a) => a.type === "BecameLaw");
  if (bl.length) {
    o.became++;
    const d = bl.map((a) => a.actionDate).sort().pop();
    const ld = r.listAction?.actionDate;
    if (d === ld) o.sameDate++; else { const diff = Math.round((Date.parse(ld) - Date.parse(d)) / 864e5); dateDiffs.push(diff); diffRows.push([r.congress, r.type + r.number, d, ld, diff, r.listAction?.text]); }
  }
  if (r.actions.some((a) => /veto/i.test(a.text))) overrides.push([r.congress, r.type + r.number, r.actions.filter((a) => /veto|became public|signed by|override/i.test(a.text)).map((a) => `${a.actionDate} [${a.type}] ${a.text.slice(0, 100)}`)]);
}
const tab = Object.entries(rows).map(([c, o]) => ({ congress: +c, n: o.n, policyArea: pct(o.policy, o.n), sponsorId: pct(o.sponsor, o.n), sponsorInLegislators: pct(o.sponsorInLeg, o.sponsor), summary: pct(o.summary, o.n), summary40chars: pct(o.sumText, o.n), becameLawAction: pct(o.became, o.n), listDateEqual: pct(o.sameDate, o.became) }));
console.table(tab);
const dec = {};
for (const [c, o] of Object.entries(rows)) { const d = Math.floor((1789 + 2 * (c - 1)) / 10) * 10 + "s"; const x = (dec[d] ??= { n: 0, policy: 0, sponsor: 0, summary: 0, sumText: 0, became: 0 }); for (const k of Object.keys(x)) x[k] += o[k]; }
console.table(Object.entries(dec).map(([d, o]) => ({ decade: d, n: o.n, policyArea: pct(o.policy, o.n), sponsorId: pct(o.sponsor, o.n), summary: pct(o.summary, o.n), sumText: pct(o.sumText, o.n), became: pct(o.became, o.n) })));
console.log("date diffs (list latestAction - BecameLaw date, days):", dateDiffs.length, "of", S.length, "abs median", dateDiffs.map(Math.abs).sort((a, b) => a - b)[Math.floor(dateDiffs.length / 2)], "max", Math.max(...dateDiffs.map(Math.abs)));
console.log(diffRows.slice(0, 25));
console.log("sponsors not in legislators:", missingSponsors.length, missingSponsors.slice(0, 20));
console.log("veto examples", overrides.length); for (const o of overrides.slice(0, 6)) console.log(JSON.stringify(o));
fs.writeFileSync(CACHE + "fill-rates.json", JSON.stringify({ tab, dec }, null, 1));
