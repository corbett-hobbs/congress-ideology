import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { financialDisclosure, type FinancialDisclosure, type DisclosureLineItem } from "./entities";
import { getCurrentMemberIndex } from "./congress-data";
import {
  buildProfileYears,
  buildWealthMembers,
  type CurrentMemberFacts,
  type ProfileYearStatus,
  type WealthMember,
} from "./wealth-derive";
import { getMemberLineItems } from "./line-items-data";

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

export interface MemberWealthProfile {
  /** One entry per 2013–2025, classified per `buildProfileYears` — the
   *  profile card's chart reads this directly. */
  years: ProfileYearStatus[];
  /** Every reconciled line-item row for this member (Session 5), sorted by
   *  year. Can be shorter than `years` — a usable year with no row here
   *  falls back to the band-count totals already on `years[i]`. */
  lineItemRows: DisclosureLineItem[];
}

/**
 * The profile "Net worth over time" card's data for one member — every
 * `financial_disclosures.json` row for them (not just usable ones, unlike
 * `getWealthData()`) plus whatever line-item rows reconciled for them.
 * `null` when the member has no financial_disclosures.json rows at all (the
 * card doesn't render — see Session 6 plan, "No card if the member has no
 * filing rows at all").
 */
export function getMemberWealthProfile(bioguideId: string): MemberWealthProfile | null {
  const rows = readFinancialDisclosures().filter((r) => r.bioguide_id === bioguideId);
  if (rows.length === 0) return null;

  const lineItems = getMemberLineItems(bioguideId);
  return {
    years: buildProfileYears(rows),
    lineItemRows: Array.from(lineItems.values()).sort((a, b) => a.year - b.year),
  };
}
