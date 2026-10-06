import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import {
  EO_TOPICS,
  EO_TOPIC_LABELS,
  type EoTopic,
  type EoTopicCacheEntry,
} from "../../lib/executive-orders-entities";
import { CACHE, oneRowPerLine, readCache, readRaw } from "../transform/executive-orders-run";
import { inheritanceParents, normalizeRaw, parseNotes } from "../transform/executive-orders";

/**
 * Unattended topic labelling for new executive orders. Run by
 * .github/workflows/executive-orders-freshness.yml right after
 * `pnpm classify:eos` (parent-inherit), so what is left uncached is exactly the
 * orders no parent can decide. Each one is sent to the Claude API with the nine
 * topic definitions and a fixed set of already-cached examples, and the answer
 * is recorded as `topic_method: "model"` — the same method as the hand-run
 * `--labels` path, so nothing downstream changes.
 *
 *   ANTHROPIC_API_KEY=... pnpm classify:eos:auto
 *
 * Guard rails (the "never default to other" rule still holds):
 * - existing cache entries are never overwritten;
 * - no key, an API error, or an answer outside the nine topics leaves the order
 *   uncached, so the transform still fails loudly and a human is told;
 * - a low/medium-confidence answer, or a pointer-only title whose parent is
 *   unknown, is stored with `needs_review: true`.
 * Not part of `pnpm transform` / CI: classification stays a committed artifact.
 */
const MODEL = process.env.EO_CLASSIFY_MODEL ?? "claude-sonnet-5-5";
const EXAMPLES = 45;

const DEFINITIONS = `One primary topic per order, by the order's main purpose (not every agency it touches):
- government_operations: federal workforce and hiring, agency organisation, advisory committees, closings, succession orders, procurement and regulatory process, the White House office, faith-based/community offices, law-firm and federal-media-funding orders.
- economy_labor: jobs, wages, unions, business and finance, taxes, housing, technology, AI and R&D (but cyber / critical-infrastructure orders go to national_security).
- trade: tariffs, trade agreements, import/export controls, trade remedies.
- energy_environment: energy supply and permitting, climate, pollution, public lands, wildlife, water, disasters-as-environment.
- health_education: health care, drugs, public health, schools, students, colleges.
- immigration_justice: immigration, border, refugees, policing, courts, prisons, criminal justice.
- foreign_policy: diplomacy, sanctions programmes and foreign-country emergencies, treaties, foreign aid, international organisations.
- national_security: military, defense, intelligence, homeland security, cyber, classified information, nuclear.
- civil_rights_civic: civil rights and equity, tribal and identity orders, culture, commemoration, sports, elections and civic life, English as official language.
There is no "other". Revoking or amending an earlier order is not a topic; classify by what the order is about.`;

interface Row {
  eo_number: number;
  title: string;
  agencies: string[];
  signing_date: string;
  notes: string | null;
}

interface Verdict {
  topic: EoTopic;
  confidence: "high" | "medium" | "low";
}

async function ask(row: Row, examples: string): Promise<Verdict | null> {
  const body = {
    model: MODEL,
    max_tokens: 200,
    system: `You classify U.S. executive orders into one primary topic. Always answer by calling the record_topic tool.\n\n${DEFINITIONS}\n\nLabelled examples (title -> topic):\n${examples}`,
    tools: [
      {
        name: "record_topic",
        description: "Record the primary topic of the executive order.",
        input_schema: {
          type: "object",
          properties: {
            topic: { type: "string", enum: [...EO_TOPICS] },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
          },
          required: ["topic", "confidence"],
        },
      },
    ],
    tool_choice: { type: "auto" },
    messages: [
      {
        role: "user",
        content: `EO ${row.eo_number}, signed ${row.signing_date}\nTitle: ${row.title}\nAgencies: ${row.agencies.join("; ") || "(none listed)"}${row.notes ? `\nFederal Register notes: ${row.notes}` : ""}`,
      },
    ],
  };
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      continue;
    }
    if (!res.ok) {
      console.error(`  EO ${row.eo_number}: API ${res.status} ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const json = (await res.json()) as { content?: { type: string; input?: Record<string, unknown> }[] };
    const input = json.content?.find((c) => c.type === "tool_use")?.input;
    const topic = input?.topic as EoTopic | undefined;
    const confidence = input?.confidence as Verdict["confidence"] | undefined;
    if (!topic || !(EO_TOPICS as readonly string[]).includes(topic) || !confidence) {
      console.error(`  EO ${row.eo_number}: unusable answer ${JSON.stringify(input)}`);
      return null;
    }
    return { topic, confidence };
  }
  console.error(`  EO ${row.eo_number}: API unavailable after 3 attempts`);
  return null;
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.log("classify:eos:auto  ANTHROPIC_API_KEY not set; nothing classified");
  process.exit(0);
}

const cache = existsSync(CACHE) ? await readCache() : new Map<number, EoTopicCacheEntry>();
const { rows } = normalizeRaw(await readRaw());
const pending = rows.filter((r) => !cache.has(r.eo_number));
if (pending.length === 0) {
  console.log("classify:eos:auto  nothing to classify");
  process.exit(0);
}

// Evenly spaced model/manual-labelled rows as examples: deterministic, so a rerun asks the same question.
const labelled = rows.filter((r) => {
  const c = cache.get(r.eo_number);
  return c && c.topic_method !== "parent-inherit" && !c.needs_review;
});
const step = Math.max(1, Math.floor(labelled.length / EXAMPLES));
const examples = labelled
  .filter((_, i) => i % step === 0)
  .slice(0, EXAMPLES)
  .map((r) => `- ${r.title} -> ${cache.get(r.eo_number)!.topic}`)
  .join("\n");

let added = 0;
const flagged: string[] = [];
const failed: number[] = [];
for (const r of pending) {
  const verdict = await ask(
    { eo_number: r.eo_number, title: r.title, agencies: r.agencies.map((a) => a.name ?? a.raw_name), signing_date: r.signing_date, notes: r.executive_order_notes ?? null },
    examples,
  );
  if (!verdict) {
    failed.push(r.eo_number);
    continue;
  }
  const { amends, revokes } = parseNotes(r.executive_order_notes);
  const pointer = inheritanceParents({ title: r.title, amends, revokes }).length > 0;
  const needsReview = pointer || verdict.confidence !== "high";
  cache.set(r.eo_number, { eo_number: r.eo_number, topic: verdict.topic, topic_method: "model", needs_review: needsReview });
  added++;
  console.log(`  ${r.eo_number}  ${EO_TOPIC_LABELS[verdict.topic]} (${verdict.confidence}${needsReview ? ", needs_review" : ""})  ${r.title}`);
  if (needsReview) flagged.push(`${r.eo_number}`);
}

const out = [...cache.values()].sort((a, b) => a.eo_number - b.eo_number);
await writeFile(CACHE, oneRowPerLine(out));
console.log(`classify:eos:auto  +${added} model (${flagged.length} flagged needs_review), ${failed.length} left unclassified${failed.length ? `: ${failed.join(", ")}` : ""}`);
