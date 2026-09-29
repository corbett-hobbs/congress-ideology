import "server-only";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { disclosureLineItem, type DisclosureLineItem } from "./entities";

/**
 * Build-time reader for `pipeline/output/line-items/<year>.json` — the only
 * *sharded*-by-year pipeline output today (every other file under
 * `pipeline/output/` is one flat array; see `lib/wealth-data.ts`,
 * `lib/congress-data.ts`, `lib/committee-data.ts`). Read once, indexed by
 * `bioguide_id` then `year`, so a profile page's per-member lookup is O(1)
 * after the first call.
 *
 * A filing only has a row here if Session 5's reconciliation gate accepted
 * it (`pipeline/financial_disclosures/build_line_items.py`) — most, but not
 * all, usable `financial_disclosures.json` rows do. Absence is normal, not
 * an error: callers fall back to the band-count totals already in
 * `financial_disclosures.json` (via `lib/wealth-data.ts`) for a year with no
 * line-item row, per the Session 6 plan's "do not fake items" rule.
 */

const LINE_ITEMS_DIR = join(process.cwd(), "pipeline", "output", "line-items");

let cache: Map<string, Map<number, DisclosureLineItem>> | null = null;

function loadAll(): Map<string, Map<number, DisclosureLineItem>> {
  if (cache) return cache;

  const byMember = new Map<string, Map<number, DisclosureLineItem>>();
  let files: string[] = [];
  try {
    files = readdirSync(LINE_ITEMS_DIR).filter((f) => /^\d{4}\.json$/.test(f));
  } catch {
    // The directory doesn't exist until build_line_items.py has run at
    // least once (e.g. a fresh checkout before Session 5's build) — degrade
    // to "no line items anywhere" rather than failing the build.
    files = [];
  }

  for (const file of files) {
    const path = join(LINE_ITEMS_DIR, file);
    const raw = JSON.parse(readFileSync(path, "utf8"));
    if (!Array.isArray(raw)) {
      throw new Error(`line-items/${file}: expected a JSON array`);
    }
    raw.forEach((row, i) => {
      const parsed = disclosureLineItem.safeParse(row);
      if (!parsed.success) {
        throw new Error(
          `line-items/${file} row ${i} (${row?.bioguide_id}, ${row?.year}): ${parsed.error.message}`,
        );
      }
      const byYear = byMember.get(parsed.data.bioguide_id) ?? new Map();
      byYear.set(parsed.data.year, parsed.data);
      byMember.set(parsed.data.bioguide_id, byYear);
    });
  }

  cache = byMember;
  return cache;
}

/** Every reconciled line-item row for one member, keyed by year. Empty when
 *  none reconciled (or Session 5's output isn't present in this checkout). */
export function getMemberLineItems(bioguideId: string): Map<number, DisclosureLineItem> {
  return loadAll().get(bioguideId) ?? new Map();
}
