import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { WikipediaBio } from "./wikipedia-types";

let cache: Map<string, WikipediaBio> | null = null;

/**
 * The trimmed Wikipedia lead for a member, from the build-time file
 * `pipeline/fetch/wikipedia.ts` writes. `null` for a member with no record
 * (no `id.wikipedia`, 404, non-article page) and when the file is absent — the
 * header then omits the bio entirely, no placeholder.
 */
export function getMemberWikipediaBio(bioguideId: string): WikipediaBio | null {
  if (!cache) {
    cache = new Map();
    try {
      const path = join(process.cwd(), "pipeline", "output", "wikipedia_summaries.json");
      const rows = JSON.parse(readFileSync(path, "utf8")) as (WikipediaBio & {
        bioguide_id: string;
      })[];
      for (const r of rows) cache.set(r.bioguide_id, { extract: r.extract, url: r.url });
    } catch {
      // graceful before the step has been run
    }
  }
  return cache.get(bioguideId) ?? null;
}
