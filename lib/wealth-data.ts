import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { financialDisclosure, type FinancialDisclosure } from "./entities";
import { getCurrentMemberIndex } from "./congress-data";
import {
  buildWealthMembers,
  type CurrentMemberFacts,
  type WealthMember,
} from "./wealth-derive";

/**
 * Build-time net worth data layer — the source every wealth view (the
 * `/congress/wealth` page and the profile "Net worth over time" card) reads.
 * The actual data-shaping is in `lib/wealth-derive.ts` (pure, unit-tested);
 * this file only does file I/O and is `"server-only"`, so it's exercised by
 * `pnpm build`, not vitest — the same split as `lib/congress-data.ts` (server
 * file reads) vs `lib/party-palette.ts` (pure, tested). See
 * docs/NET_WORTH_METHODOLOGY.md for the policy this implements.
 */

export * from "./wealth-derive";

let rowsCache: FinancialDisclosure[] | null = null;

/** All rows of `pipeline/output/financial_disclosures.json`, Zod-validated. */
function readFinancialDisclosures(): FinancialDisclosure[] {
  if (rowsCache) return rowsCache;
  const path = join(
    process.cwd(),
    "pipeline",
    "output",
    "financial_disclosures.json",
  );
  const raw = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(raw)) {
    throw new Error("financial_disclosures.json: expected a JSON array");
  }
  rowsCache = raw.map((row, i) => {
    const parsed = financialDisclosure.safeParse(row);
    if (!parsed.success) {
      throw new Error(
        `financial_disclosures.json row ${i} (${row?.bioguide_id}, ${row?.year}): ${parsed.error.message}`,
      );
    }
    return parsed.data;
  });
  return rowsCache;
}

/** First Congress (either chamber) each bioguide_id served, from terms.json. */
function firstCongressByMember(): Map<string, number> {
  const path = join(process.cwd(), "pipeline", "output", "terms.json");
  const terms = JSON.parse(readFileSync(path, "utf8")) as {
    bioguide_id: string;
    congress_number: number;
  }[];
  const first = new Map<string, number>();
  for (const t of terms) {
    const prev = first.get(t.bioguide_id);
    if (prev === undefined || t.congress_number < prev) {
      first.set(t.bioguide_id, t.congress_number);
    }
  }
  return first;
}

let wealthDataCache: WealthMember[] | null = null;

/**
 * Every current member (both chambers) with the site's own definition of
 * "current" — `getCurrentMemberIndex()`, the same set `generateStaticParams`
 * uses for the ~535 profile pages — joined with their usable filing years.
 * Members with zero rows in `financial_disclosures.json` are included with an
 * empty `points`/all-null `series` (the page decides how to render "no
 * data"); this never drops a current member.
 */
export function getWealthData(): WealthMember[] {
  if (wealthDataCache) return wealthDataCache;

  const currentMembers = new Map<string, CurrentMemberFacts>();
  for (const [bioguideId, m] of getCurrentMemberIndex()) {
    currentMembers.set(bioguideId, {
      name: m.name,
      chamber: m.chamber,
      state: m.state,
      district: m.district,
      caucus: m.caucus,
      hasPhoto: m.hasPhoto ?? false,
    });
  }

  wealthDataCache = buildWealthMembers(
    readFinancialDisclosures(),
    currentMembers,
    firstCongressByMember(),
  );
  return wealthDataCache;
}
