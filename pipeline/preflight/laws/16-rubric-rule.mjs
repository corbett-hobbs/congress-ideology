// Session 3b rule (e): the "significant acts" rubric (four metrics + exclusions) applied by a model to each law's title,
// policy area, CRS summary and Wikipedia lead. The evidence quote must be verbatim in that text. Cached, never overwritten.
// usage: node --env-file=.env.local pipeline/preflight/laws/16-rubric-rule.mjs [fromCongress toCongress]
import fs from "node:fs";
const MODEL = "claude-sonnet-5-5";
const [from = 113, to = 119] = process.argv.slice(2).map(Number);
const laws = JSON.parse(fs.readFileSync("pipeline/output/laws.json", "utf8"));
const acts = JSON.parse(fs.readFileSync("pipeline/raw/wikipedia-laws/acts.json", "utf8"));
const art = new Map(acts.rows.map((r) => [r.law_id, r]));
const raw = new Map();
for (const s of ["congress-gov", "govinfo-billstatus"]) for (const f of fs.readdirSync(`pipeline/raw/${s}`).filter((n) => /^\d+\.json$/.test(n))) {
  const j = JSON.parse(fs.readFileSync(`pipeline/raw/${s}/${f}`, "utf8"));
  if (s === "congress-gov" && j.congress === 108) continue;
  for (const l of j.laws) raw.set(l.law_id.replace("-pub-", "-"), l);
}
const OUT = "pipeline/raw/laws-rubric/rubric-rule.json";
fs.mkdirSync("pipeline/raw/laws-rubric", { recursive: true });
const cache = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
const SYSTEM = `You apply a rubric to one enacted U.S. public law. You are given only its title, CRS policy area, CRS summary and (when it has one) the lead of its Wikipedia article. Judge from that text alone; never use memory. Always answer by calling record_verdict.

A law is a "Significant Act" if it meets at least one criterion:
1. MACROECONOMIC: authorizes or appropriates funds, or overhauls the tax code, with a projected 10-year budget impact above $100 billion. CBO scores are NOT available to you, so meet this only if the text states an amount or effect above $100 billion, or the law is plainly a reconciliation package, an annual omnibus or consolidated appropriations act, a major tax cut/extension, or a major entitlement change.
2. REGULATORY FRONTIERS: a brand-new federal framework for an emergent sector, a change to federal surveillance power, or a reshaping of major law-enforcement agencies (technology/AI regulation, financial-market re-regulation, FISA reauthorization, major Controlled Substances Act revisions).
3. HARD NATIONAL SECURITY: the annual National Defense Authorization Act, a declaration of war or authorization of force, or a sweeping sanctions package against foreign adversaries.
4. GOVERNMENTAL REVERSION: a Congressional Review Act joint resolution of disapproval that invalidates a MAJOR federal regulation (one the text shows to be broad in effect, not a narrow or technical rule).

Always EXCLUDE: commemorative bills (naming post offices, courthouses, buildings, single medals), short-term stopgap funding (continuing resolutions) unless the text shows major permanent provisions, and non-binding resolutions.

significant: true only if a criterion is met on the text. criterion: its number. evidence: the exact words copied verbatim from the text that establish it (for an omnibus, reconciliation or NDAA, the words of the title or summary that say so). If the text is too thin to tell, significant is false.`;
const items = laws.filter((l) => l.congress >= from && l.congress <= to);
const text = (l) => {
  const r = raw.get(`${l.congress}-${l.number}`);
  const sum = (r?.summary_html ?? "").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ").replace(/\s+/g, " ").trim().slice(0, 2500);
  const t = art.get(`${l.congress}-${l.number}`)?.title;
  const lead = t ? (acts.leads[t]?.lead ?? "").slice(0, 1500) : "";
  return `Title: ${l.title}\nPolicy area: ${l.area_id}\nCRS summary: ${sum || "(none)"}${lead ? `\nWikipedia lead: ${lead}` : ""}`;
};
const todo = items.filter((l) => !(`${l.congress}-${l.number}` in cache));
console.log("to do", todo.length, "of", items.length);
let next = 0, done = 0;
async function ask(l) {
  const id = `${l.congress}-${l.number}`, input = text(l);
  const body = { model: MODEL, max_tokens: 400, system: SYSTEM, tool_choice: { type: "auto" },
    tools: [{ name: "record_verdict", description: "Record the verdict.", input_schema: { type: "object", properties: { significant: { type: "boolean" }, criterion: { type: "integer" }, evidence: { type: "string" } }, required: ["significant"] } }],
    messages: [{ role: "user", content: input }] };
  for (let a = 1; a <= 4; a++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" }, body: JSON.stringify(body) });
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 3000 * a)); continue; }
    if (!res.ok) { console.error(id, res.status, (await res.text()).slice(0, 150)); return; }
    const v = (await res.json()).content?.find((c) => c.type === "tool_use")?.input;
    if (!v) return;
    const norm = (s) => s.replace(/\s+/g, " ").trim();
    const ok = !!(v.significant && v.evidence && norm(input).includes(norm(v.evidence)));
    cache[id] = { significant: ok, claimed: !!v.significant, criterion: ok ? v.criterion ?? null : null, evidence: ok ? v.evidence : null, model: MODEL };
    return;
  }
}
await Promise.all(Array.from({ length: 8 }, async () => { while (next < todo.length) { await ask(todo[next++]); if (++done % 100 === 0) { fs.writeFileSync(OUT, JSON.stringify(cache)); console.log(done, "/", todo.length); } } }));
fs.writeFileSync(OUT, JSON.stringify(cache) + "\n");
const v = Object.values(cache);
console.log("done", v.length, "claimed", v.filter((c) => c.claimed).length, "verified", v.filter((c) => c.significant).length);
