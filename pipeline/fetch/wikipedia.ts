import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import {
  wikipediaApiSummary,
  wikipediaSummary,
  type WikipediaSummary,
} from "../validate/schemas";
import { needsReview, trimExtract } from "../wikipedia/trim";
import { RAW_DIR, run } from "./lib";

/**
 * A short Wikipedia bio per current member, for the profile header.
 *
 * Reads `id.wikipedia` (the English article title) from congress-legislators'
 * `legislators-current.yaml`, calls the Wikipedia REST summary endpoint, trims
 * the lead to two sentences (pipeline/wikipedia/trim.ts — trim only, never
 * rewritten) and writes `pipeline/output/wikipedia_summaries.json`, keyed by
 * `bioguide_id`. Build-time only: the app never calls Wikipedia at request
 * time.
 *
 * - A member with no `id.wikipedia`, a 404, or a non-"standard" page
 *   (disambiguation, etc.) gets NO record — never a placeholder.
 * - A fetch that still fails after retries (429 / 5xx / network) aborts the
 *   run without touching the file, so a flaky night can't silently delete
 *   bios from the committed output.
 * - `fetched_at` is carried over from the committed record when nothing else
 *   about it changed, so an unchanged article produces an unchanged file and
 *   the weekly workflow only opens a PR for a real diff. `revision` is in the
 *   record, so text changes (and vandalism) show up in review.
 */
const LEGISLATORS = `${RAW_DIR}/congress-legislators/legislators-current.yaml`;
const OUT = "pipeline/output/wikipedia_summaries.json";

/** Wikimedia asks for a descriptive UA with a way to reach the operator. */
const USER_AGENT =
  "congress-ideology/0.1 (https://github.com/corbett-hobbs/congress-ideology)";
const API = "https://en.wikipedia.org/api/rest_v1/page/summary";
const CONCURRENCY = 5;
const MAX_ATTEMPTS = 6;

const yamlEntry = z.looseObject({
  id: z.looseObject({
    bioguide: z.string(),
    wikipedia: z.string().optional(),
  }),
  name: z.looseObject({ official_full: z.string().optional(), last: z.string() }),
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Outcome =
  | { kind: "ok"; body: unknown }
  | { kind: "skip"; reason: string };

/** GET one summary, retrying 429/5xx/network errors with backoff. */
async function getSummary(title: string): Promise<Outcome> {
  const url = `${API}/${encodeURIComponent(title.replace(/ /g, "_"))}`;
  let lastError = "";
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let wait = 1000 * 2 ** attempt;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      });
      if (res.ok) return { kind: "ok", body: await res.json() };
      if (res.status === 404) return { kind: "skip", reason: "404 not found" };
      lastError = `${res.status} ${res.statusText}`;
      if (res.status !== 429 && res.status < 500) {
        throw new Error(`GET ${url} -> ${lastError}`); // 4xx: not retryable
      }
      const retryAfter = Number(res.headers.get("retry-after"));
      if (Number.isFinite(retryAfter) && retryAfter > 0) {
        wait = Math.max(wait, retryAfter * 1000);
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("GET ")) throw err;
      lastError = err instanceof Error ? err.message : String(err);
    }
    await sleep(wait);
  }
  throw new Error(`GET ${url} -> gave up after ${MAX_ATTEMPTS} attempts (${lastError})`);
}

async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(n, queue.length) }, async () => {
      let item: T | undefined;
      while ((item = queue.shift()) !== undefined) await fn(item);
    }),
  );
}

await run("wikipedia", async () => {
  const entries = (parseYaml(await readFile(LEGISLATORS, "utf8")) as unknown[]).map(
    (e, i) => {
      const r = yamlEntry.safeParse(e);
      if (!r.success) {
        throw new Error(`${LEGISLATORS}: entry ${i} failed schema\n${z.prettifyError(r.error)}`);
      }
      return r.data;
    },
  );

  const previous = new Map<string, WikipediaSummary>();
  if (existsSync(OUT)) {
    for (const r of JSON.parse(await readFile(OUT, "utf8")) as unknown[]) {
      const rec = wikipediaSummary.parse(r);
      previous.set(rec.bioguide_id, rec);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const records: WikipediaSummary[] = [];
  const noId: string[] = [];
  const skipped: string[] = [];
  const failures: string[] = [];

  const todo = entries.filter((e) => {
    if (e.id.wikipedia) return true;
    noId.push(e.name.official_full ?? e.name.last);
    return false;
  });

  let done = 0;
  await pool(todo, CONCURRENCY, async (e) => {
    const label = `${e.name.official_full ?? e.name.last} (${e.id.bioguide}, "${e.id.wikipedia}")`;
    try {
      const out = await getSummary(e.id.wikipedia!);
      if (out.kind === "skip") {
        skipped.push(`${label}: ${out.reason}`);
        return;
      }
      const parsed = wikipediaApiSummary.safeParse(out.body);
      if (!parsed.success) {
        throw new Error(`unexpected response shape\n${z.prettifyError(parsed.error)}`);
      }
      const api = parsed.data;
      if (api.type !== "standard") {
        skipped.push(`${label}: type "${api.type}"`);
        return;
      }
      const extract = trimExtract(api.extract);
      if (!extract) {
        skipped.push(`${label}: empty extract`);
        return;
      }
      const draft = {
        bioguide_id: e.id.bioguide,
        title: api.title,
        extract,
        url: api.content_urls.desktop.page,
        revision: api.revision,
        needs_review: needsReview(extract),
      };
      const prev = previous.get(draft.bioguide_id);
      const unchanged =
        prev &&
        prev.title === draft.title &&
        prev.extract === draft.extract &&
        prev.url === draft.url &&
        prev.revision === draft.revision &&
        prev.needs_review === draft.needs_review;
      const record = wikipediaSummary.safeParse({
        ...draft,
        fetched_at: unchanged ? prev.fetched_at : today,
      });
      if (!record.success) {
        throw new Error(`record failed schema\n${z.prettifyError(record.error)}`);
      }
      records.push(record.data);
    } catch (err) {
      failures.push(`${label}: ${err instanceof Error ? err.message : err}`);
    } finally {
      done += 1;
      if (done % 100 === 0) console.log(`  ${done}/${todo.length}`);
    }
  });

  if (failures.length) {
    throw new Error(
      `${failures.length} member(s) failed; ${OUT} left untouched:\n  ${failures.sort().join("\n  ")}`,
    );
  }

  records.sort((a, b) => a.bioguide_id.localeCompare(b.bioguide_id));
  await writeFile(OUT, JSON.stringify(records, null, 2) + "\n");

  const review = records.filter((r) => r.needs_review);
  console.log(
    `  ${records.length} bios, ${noId.length} missing id.wikipedia, ${skipped.length} skipped, ${review.length} need review`,
  );
  if (noId.length) console.log(`  no id.wikipedia: ${noId.join(", ")}`);
  for (const s of skipped.sort()) console.log(`  skipped: ${s}`);
  for (const r of review) console.log(`  needs_review: ${r.bioguide_id} ${r.title}`);
});
