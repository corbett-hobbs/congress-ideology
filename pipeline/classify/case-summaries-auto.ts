import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { z } from "zod";
import { caseArticleRow } from "../../lib/decisions-entities";
import { RAW_DIR } from "../fetch/lib";
import { CASE_SUMMARIES_AI, aiSummaryCache, checkAiSummary, summarizeLead, type AiSummaryEntry } from "../transform/wikipedia-case-summaries";

/**
 * One-sentence case summaries for the linked cases whose Wikipedia article does not open with a ruling sentence the plain
 * picker (`summarizeLead`) can take. Each such article's lead is sent to the Claude API, which writes one sentence, grounded
 * only in that text, saying what the case was about and how the Court ruled; if the lead does not say how the Court ruled it
 * answers that it does not and the case gets no sentence. The model must also quote the words of the lead that state the ruling;
 * `checkAiSummary` rejects any sentence whose quote is not in the lead or whose wording strays from it (a model left to itself
 * writes rulings from memory, and gets some wrong). The answer is stored by article title in `pipeline/classification/case_summaries.json`
 * (`summary: null` when the lead states no ruling, so nobody is asked twice). Run by .github/workflows/wikipedia-cases-freshness.yml after the
 * lists, the leads and a first transform, so what is left uncached is the newly decided and newly written-up cases.
 *
 *   ANTHROPIC_API_KEY=... pnpm summarize:cases      # (or put the key in the git-ignored .env.local)
 *   pnpm summarize:cases -- --limit 20              # try a few
 *
 * Guard rails: cached entries are never overwritten; no key, an API error or a sentence that fails `checkAiSummary` leaves the case uncached and it is asked again next run; the transform labels these rows
 * "claude" in the report and the page's Data notes count them. Not part of `pnpm transform` / CI: the cache is a committed artifact.
 */
const MODEL = process.env.CASE_SUMMARY_MODEL ?? "claude-sonnet-5-5";
const PARALLEL = 4;
const OUT = "pipeline/output";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* no .env.local (CI passes the secret as an env var) */
}

const SYSTEM = `You write one line of a table about U.S. Supreme Court cases. You are given the opening of the case's Wikipedia article. Always answer by calling the record_summary tool.

Set ruling_stated to true ONLY if the text itself says how the Court decided the case (held, ruled, struck down, upheld, reversed, ...). A text that only names the issue, the question, the parties or the case's importance does NOT state a ruling: set ruling_stated to false and leave the other fields empty. Never use what you remember about the case; many leads give no ruling and the right answer is false.

When true:
- evidence: the exact words from the text, copied verbatim, that state the ruling.
- sentence: ONE sentence, 300 characters or fewer, in plain past tense, saying what the case was about and how the Court ruled, using only facts in the text. Start with the context or "The Court". Do not start with or repeat the case name or its citation. No vote counts, dates or names that the text does not give.`;

interface Verdict {
  ruling_stated?: boolean;
  evidence?: string;
  sentence?: string;
}

/** The checked sentence, null when the lead states no ruling, undefined when the call or the answer was unusable. */
async function ask(title: string, lead: string): Promise<string | null | undefined> {
  const body = {
    model: MODEL,
    max_tokens: 500,
    system: SYSTEM,
    tools: [
      {
        name: "record_summary",
        description: "Record whether the text states the ruling and, if so, the one-sentence summary.",
        input_schema: {
          type: "object",
          properties: { ruling_stated: { type: "boolean" }, evidence: { type: "string" }, sentence: { type: "string" } },
          required: ["ruling_stated"],
        },
      },
    ],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: `Article: ${title}\n\n${lead}` }],
  };
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
    });
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      continue;
    }
    if (!res.ok) {
      console.error(`  ${title}: API ${res.status} ${(await res.text()).slice(0, 200)}`);
      return undefined;
    }
    const json = (await res.json()) as { content?: { type: string; input?: Verdict }[] };
    const v = json.content?.find((c) => c.type === "tool_use")?.input;
    if (!v) return undefined;
    if (!v.ruling_stated) return null;
    // The model says it found a ruling; the checks decide. A sentence that fails them is "no ruling in the lead", not a retry.
    return v.sentence && v.evidence && checkAiSummary(v.sentence.trim(), v.evidence, lead) ? v.sentence.trim() : null;
  }
  console.error(`  ${title}: API unavailable after 3 attempts`);
  return undefined;
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.log("summarize:cases  ANTHROPIC_API_KEY not set; nothing summarised");
  process.exit(0);
}

const read = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
const articles = z.array(caseArticleRow).parse(read(`${OUT}/decisions_articles.json`));
const leads = (read(`${RAW_DIR}/wikipedia-cases/leads.json`) as { leads: Record<string, string> }).leads;
const cache = new Map((existsSync(CASE_SUMMARIES_AI) ? aiSummaryCache.parse(read(CASE_SUMMARIES_AI)) : []).map((e) => [e.title, e] as const));

const limitAt = process.argv.indexOf("--limit");
const limit = limitAt > 0 ? Number(process.argv[limitAt + 1]) : Infinity;
// Linked titles with a lead the plain picker cannot use and no answer yet, in a stable order.
const pending = [...new Set(articles.flatMap((a) => (a.title ? [a.title] : [])))]
  .filter((t) => leads[t] && !cache.has(t) && !summarizeLead(leads[t]))
  .sort()
  .slice(0, limit);
if (pending.length === 0) {
  console.log("summarize:cases  nothing to summarise");
  process.exit(0);
}

const save = () => writeFile(CASE_SUMMARIES_AI, `[\n${[...cache.values()].sort((a, b) => a.title.localeCompare(b.title)).map((e) => JSON.stringify(e)).join(",\n")}\n]\n`);
let added = 0;
let none = 0;
let failed = 0;
let next = 0;
async function worker() {
  while (next < pending.length) {
    const title = pending[next++]!;
    const answer = await ask(title, leads[title]!);
    if (answer === undefined) {
      failed++;
      continue;
    }
    const entry: AiSummaryEntry = { title, summary: answer, model: MODEL };
    cache.set(title, entry);
    if (answer === null) none++;
    else added++;
    if ((added + none) % 50 === 0) {
      console.log(`  ${added + none} / ${pending.length}`);
      await save();
    }
  }
}
await Promise.all(Array.from({ length: PARALLEL }, worker));
await save();
console.log(`summarize:cases  +${added} sentences, ${none} NONE (the lead does not say how the Court ruled), ${failed} left for the next run, model ${MODEL}`);
