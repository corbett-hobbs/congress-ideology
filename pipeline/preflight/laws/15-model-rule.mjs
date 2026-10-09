// Session 3b rule (d): a model reads the Wikipedia lead and says whether the law is described as major; the evidence quote
// must appear verbatim in the lead (the checkAiSummary guard). Cached in the scratchpad-style raw file, never overwritten.
// usage: node --env-file=.env.local pipeline/preflight/laws/15-model-rule.mjs
import fs from "node:fs";
const MODEL = "claude-sonnet-5-5";
const acts = JSON.parse(fs.readFileSync("pipeline/raw/wikipedia-laws/acts.json", "utf8"));
const OUT = "pipeline/raw/wikipedia-laws/model-rule.json";
const cache = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
const SYSTEM = `You are given the opening of a Wikipedia article about a U.S. federal law. Decide whether THE TEXT ITSELF describes the law as major, landmark, historic, sweeping or among the most significant laws of its kind. Never use what you remember. Always answer by calling record_verdict. major_stated is true only if the text says so in its own words; a text that merely describes what the law does, or only names a topic, is false. When true, evidence is the exact words copied verbatim from the text.`;
const items = acts.rows.filter((r) => r.title && +r.law_id.split("-")[0] >= 113 && +r.law_id.split("-")[0] <= 118);
const titles = [...new Set(items.map((r) => r.title))].filter((t) => acts.leads[t]?.lead && !(t in cache));
let next = 0;
async function ask(title) {
  const lead = acts.leads[title].lead;
  const body = { model: MODEL, max_tokens: 400, system: SYSTEM, tool_choice: { type: "auto" },
    tools: [{ name: "record_verdict", description: "Record the verdict.", input_schema: { type: "object", properties: { major_stated: { type: "boolean" }, evidence: { type: "string" } }, required: ["major_stated"] } }],
    messages: [{ role: "user", content: `Article: ${title}\n\n${lead}` }] };
  for (let a = 1; a <= 3; a++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" }, body: JSON.stringify(body) });
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 2000 * a)); continue; }
    if (!res.ok) { console.error(title, res.status, (await res.text()).slice(0, 150)); return; }
    const v = (await res.json()).content?.find((c) => c.type === "tool_use")?.input;
    if (!v) return;
    const ok = v.major_stated && v.evidence && lead.replace(/\s+/g, " ").includes(v.evidence.replace(/\s+/g, " ").trim());
    cache[title] = { major: !!ok, claimed: !!v.major_stated, evidence: ok ? v.evidence : null, model: MODEL };
    return;
  }
}
await Promise.all(Array.from({ length: 4 }, async () => { while (next < titles.length) { await ask(titles[next++]); if (next % 50 === 0) { fs.writeFileSync(OUT, JSON.stringify(cache, null, 1)); console.log(next, "/", titles.length); } } }));
fs.writeFileSync(OUT, JSON.stringify(cache, null, 1) + "\n");
console.log("done", Object.keys(cache).length, "claimed", Object.values(cache).filter((c) => c.claimed).length, "verified", Object.values(cache).filter((c) => c.major).length);
