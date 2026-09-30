import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { displayName } from "./display-name";
import {
  financialDisclosure,
  type FinancialDisclosure,
  type Legislator,
} from "./entities";
import {
  annualizedRate,
  buildWealthMembers,
  hasDataGap,
  isListEligible,
  isPinnedOutlier,
  median,
  partyMedians,
  toWealthPayload,
  wealthCohort,
  type CurrentMemberFacts,
  type WealthMember,
} from "./wealth-derive";

/**
 * Builds the same `WealthMember[]` `lib/wealth-data.ts`'s `getWealthData()`
 * would, but by reading `pipeline/output/*.json` directly with plain
 * `node:fs` rather than through `lib/congress-data.ts` (which is
 * `"server-only"` and throws under vitest/Node — see that file's comment).
 * "Current member" is reproduced here exactly as `lib/congress-data.ts`
 * defines it: everyone with a `terms.json` row in each chamber's latest
 * `congress_number`.
 */
function loadRealWealthMembers(): WealthMember[] {
  const outDir = join(process.cwd(), "pipeline", "output");
  const readJson = <T>(name: string): T =>
    JSON.parse(readFileSync(join(outDir, name), "utf8")) as T;

  const rawRows = readJson<unknown[]>("financial_disclosures.json");
  const rows: FinancialDisclosure[] = rawRows.map((row) =>
    financialDisclosure.parse(row),
  );

  const terms = readJson<
    {
      bioguide_id: string;
      congress_number: number;
      chamber: "house" | "senate";
      state: string;
      district: number | null;
      party: string;
      caucus: string | null;
    }[]
  >("terms.json");
  const legislators = readJson<
    { bioguide_id: string; name: Legislator["name"] }[]
  >("legislators.json");
  const legByBioguide = new Map(legislators.map((l) => [l.bioguide_id, l]));
  const { withPhoto } = readJson<{ withPhoto: string[] }>("member-photos.json");
  const hasPhotoSet = new Set(withPhoto);

  const latestByChamber = new Map<string, number>();
  for (const t of terms) {
    const prev = latestByChamber.get(t.chamber);
    if (prev === undefined || t.congress_number > prev) {
      latestByChamber.set(t.chamber, t.congress_number);
    }
  }

  const currentMembers = new Map<string, CurrentMemberFacts>();
  for (const t of terms) {
    if (t.congress_number !== latestByChamber.get(t.chamber)) continue;
    if (currentMembers.has(t.bioguide_id)) continue; // first chamber wins, same as getChamberCurrent order
    const leg = legByBioguide.get(t.bioguide_id);
    const name = leg
      ? displayName(leg.name)
      : t.bioguide_id;
    currentMembers.set(t.bioguide_id, {
      name,
      chamber: t.chamber,
      state: t.state,
      district: t.district,
      caucus: t.caucus ?? t.party,
      hasPhoto: hasPhotoSet.has(t.bioguide_id),
    });
  }

  const firstCongressByMember = new Map<string, number>();
  for (const t of terms) {
    const prev = firstCongressByMember.get(t.bioguide_id);
    if (prev === undefined || t.congress_number < prev) {
      firstCongressByMember.set(t.bioguide_id, t.congress_number);
    }
  }

  return buildWealthMembers(rows, currentMembers, firstCongressByMember);
}

/**
 * Regression fixtures from the net worth plan, section 2 — recomputed
 * directly against `pipeline/output/financial_disclosures.json` on
 * 2026-09-28 (see the Session 1 report), updated after the OCR legend-residue
 * fix (Rogers R000575's bogus 2013 row removed; J000307 now a real outlier). Tolerance is exact match; if the
 * pipeline output changes these numbers, that's a real finding to report,
 * not a fixture to loosen.
 */
describe("wealth data fixtures", () => {
  const members = loadRealWealthMembers();
  const cohort = wealthCohort(members);
  const byChamber = (c: "house" | "senate") =>
    cohort.filter((m) => m.chamber === c);

  it("has the expected cohort size (2+ usable years)", () => {
    expect(cohort.length).toBe(421);
    expect(byChamber("house").length).toBe(340);
    expect(byChamber("senate").length).toBe(81);
  });

  function shareAndMedian(pool: WealthMember[]) {
    const rates = pool.map(annualizedRate);
    const positive = rates.filter((r) => r > 0).length;
    return {
      sharePositivePct: Math.round((positive / rates.length) * 100),
      medianRate: median(rates)!,
    };
  }

  it("matches the annualized-rate fixtures (within $1, floating-point rounding)", () => {
    const both = shareAndMedian(cohort);
    expect(both.sharePositivePct).toBe(72);
    expect(Math.round(both.medianRate)).toBeCloseTo(57_083, -1);

    const house = shareAndMedian(byChamber("house"));
    expect(house.sharePositivePct).toBe(70);
    expect(Math.round(house.medianRate)).toBeCloseTo(48_625, -1);

    const senate = shareAndMedian(byChamber("senate"));
    expect(senate.sharePositivePct).toBe(80);
    expect(Math.round(senate.medianRate)).toBeCloseTo(186_209, -1);
  });

  it("matches the 2025 party-median fixtures", () => {
    const asMillions = (n: number) => Math.round(n / 1000) / 1000; // nearest $1K

    const both = partyMedians(members, 2025);
    expect(asMillions(both.dem.median!)).toBeCloseTo(1.38, 2);
    expect(both.dem.count).toBe(239);
    expect(asMillions(both.rep.median!)).toBeCloseTo(2.09, 2);
    expect(both.rep.count).toBe(252);

    const house = partyMedians(
      members.filter((m) => m.chamber === "house"),
      2025,
    );
    expect(asMillions(house.dem.median!)).toBeCloseTo(1.1, 2);
    expect(house.dem.count).toBe(194);
    expect(asMillions(house.rep.median!)).toBeCloseTo(1.5, 2);
    expect(house.rep.count).toBe(201);

    const senate = partyMedians(
      members.filter((m) => m.chamber === "senate"),
      2025,
    );
    expect(asMillions(senate.dem.median!)).toBeCloseTo(2.99, 2);
    expect(senate.dem.count).toBe(45);
    expect(asMillions(senate.rep.median!)).toBeCloseTo(4.46, 2);
    expect(senate.rep.count).toBe(51);
  });

  it("flags the expected count of gapped cohort members", () => {
    expect(cohort.filter(hasDataGap).length).toBe(58);
  });

  it("pins exactly the expected 5 outliers, beyond +/-$15M/yr", () => {
    const pinned = cohort.filter((m) => isPinnedOutlier(annualizedRate(m)));
    expect(pinned.map((m) => m.bioguideId).sort()).toEqual(
      ["F000110", "G000599", "J000307", "R000618", "S001217"].sort(),
    );
  });

  it("gives every current member a row, even with zero filings", () => {
    const noData = members.filter((m) => m.points.length === 0);
    expect(noData.length).toBeGreaterThan(0);
    for (const m of noData) {
      expect(m.series.every((v) => v === null)).toBe(true);
    }
  });

  it("keeps single-filing members out of the cohort but present in the roster", () => {
    const singleFiling = members.filter((m) => m.points.length === 1);
    expect(singleFiling.length).toBeGreaterThan(0);
    for (const m of singleFiling) {
      expect(wealthCohort([m])).toEqual([]);
    }
  });

  it("counts list-eligible members correctly (latest usable year >= 2023)", () => {
    const eligible = members.filter(isListEligible);
    expect(eligible.length).toBe(500);
  });

  it("reconciles the range midpoint against the pipeline net_worth for every closed-range point", () => {
    let checked = 0;
    for (const m of members) {
      for (const p of m.points) {
        if (p.range.unavailable || p.range.openEnded) continue;
        checked++;
        expect((p.range.lo! + p.range.hi!) / 2).toBeCloseTo(p.midpoint, 1);
      }
    }
    expect(checked).toBeGreaterThan(3000);
  });

  it("keeps the compact client payload within the plan's size budget", () => {
    // Measured ~88KB raw / ~25KB gzipped for 553 current members — see the
    // Session 1 summary. Budget here is the plan's own target (<130KB raw,
    // <35KB gzipped), not a loosened one.
    const payload = toWealthPayload(members);
    const raw = JSON.stringify(payload);
    const gz = gzipSync(raw);
    expect(raw.length).toBeLessThan(130_000);
    expect(gz.length).toBeLessThan(35_000);
  });
});
