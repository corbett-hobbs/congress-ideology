import { describe, expect, it } from "vitest";
import { AidDataError } from "../../lib/foreign-aid-entities";
import type { RawMeta, RawRow, RawYear } from "../fetch/foreign-assistance-lib";
import { buildAid, isPartialYear, reconcile, resolveRecipient, validateAid, type TradeCountry } from "./foreign-aid";

const trade: TradeCountry[] = [
  { country_code: "UKR", name: "Ukraine", is_aggregate: false },
  { country_code: "SRB", name: "Serbia", is_aggregate: false },
  { country_code: "XKX", name: "Kosovo", is_aggregate: false },
  { country_code: "CSK", name: "Czechoslovakia", is_aggregate: false },
  { country_code: "AGG_0003", name: "European Union", is_aggregate: true },
];
const tradeMap = new Map(trade.map((c) => [c.country_code, c]));

const rawMeta = (over: Partial<RawMeta> = {}): RawMeta => ({
  fetched_at: "2026-10-02T00:00:00Z",
  data_through: "2026-09-30",
  expected_records: { sector: { "2": 1, "3": 3 }, military: {} },
  categories: [{ id: 1, name: "Peace and Security" }, { id: 3, name: "Health" }],
  sectors: [],
  ...over,
});
const row = (code: string | null, name: string, cat: number, tx: 2 | 3, amount: number): RawRow => [code, name, cat, 1, tx, amount];

describe("resolveRecipient", () => {
  it("maps a shared ISO code to itself", () => {
    expect(resolveRecipient("UKR", "Ukraine", tradeMap).recipient).toEqual({ recipient_type: "country", country_key: "UKR", recipient_name: "Ukraine" });
  });
  it("applies explicit rules (Kosovo, Czechoslovakia) and leaves West Bank and Gaza without a trade key", () => {
    expect(resolveRecipient("CS-KM", "Kosovo", tradeMap).recipient.country_key).toBe("XKX");
    expect(resolveRecipient(null, "Czechoslovakia (former)", tradeMap).recipient.country_key).toBe("CSK");
    const g = resolveRecipient("PSE", "West Bank and Gaza", tradeMap);
    expect(g.recipient).toMatchObject({ recipient_type: "country", country_key: null });
    expect(g.entry.how).toBe("rule");
  });
  it("classifies World and Region rows without a country key", () => {
    expect(resolveRecipient("WLD", "World", tradeMap).recipient.recipient_type).toBe("global");
    expect(resolveRecipient("SSN", "Sub-Saharan Africa Region", tradeMap).recipient.recipient_type).toBe("regional");
  });
  it("reports an unknown code as unmapped, never dropping it", () => {
    const r = resolveRecipient("TUV", "Tuvalu", tradeMap);
    expect(r.entry.how).toBe("unmapped");
    expect(r.recipient.country_key).toBeNull();
  });
  it("does not identity-map to a trade aggregate", () => {
    expect(resolveRecipient("AGG_0003", "European Union", tradeMap).entry.how).toBe("unmapped");
  });
  it("refuses a regional code that collides with a trade country_code", () => {
    expect(() => resolveRecipient("SRB", "Odd Region", tradeMap)).toThrow(AidDataError);
  });
});

describe("isPartialYear", () => {
  it("marks a year partial until the reporting lag has passed", () => {
    expect(isPartialYear(2026, "2026-09-30")).toBe(true);
    expect(isPartialYear(2025, "2026-09-30")).toBe(false);
    expect(isPartialYear(2026, "2026-11-13")).toBe(true);
    expect(isPartialYear(2026, "2026-11-14")).toBe(false);
  });
});

describe("buildAid", () => {
  const year = (sector_rows: RawRow[], military_rows: RawRow[] = [], fiscal_year = 2025): RawYear => ({ fiscal_year, sector_rows, military_rows });

  it("sums sectors to category, keeps obligations nullable, and carries the military subset", () => {
    const y = year(
      [row("UKR", "Ukraine", 1, 3, 100), row("UKR", "Ukraine", 3, 2, 7), row("WLD", "World", 1, 3, 10)],
      [row("UKR", "Ukraine", 1, 3, 60)],
    );
    // second Peace and Security sector row for Ukraine disbursements must add into the same cell
    y.sector_rows.push(["UKR", "Ukraine", 1, 2, 3, 25]);
    const { rows } = buildAid([y], rawMeta(), trade);
    const ps = rows.find((r) => r.recipient_name === "Ukraine" && r.sector_category === "Peace and Security")!;
    expect(ps).toMatchObject({ disbursements_usd: 125, obligations_usd: null, military_disbursements_usd: 60, country_key: "UKR" });
    const health = rows.find((r) => r.sector_category === "Health")!;
    expect(health).toMatchObject({ disbursements_usd: 0, obligations_usd: 7 });
    expect(rows.find((r) => r.recipient_type === "global")!.country_key).toBeNull();
  });

  it("fails if a military line has no matching sector row", () => {
    expect(() => buildAid([year([row("UKR", "Ukraine", 1, 3, 1)], [row("UKR", "Ukraine", 3, 3, 1)])], rawMeta(), trade)).toThrow(/no matching row/);
  });

  it("fails on a category missing from the taxonomy", () => {
    expect(() => buildAid([year([row("UKR", "Ukraine", 9, 3, 1)])], rawMeta(), trade)).toThrow(/taxonomy/);
  });

  it("flags only the latest year as partial when data is through the end of that year", () => {
    const { meta } = buildAid([year([row("UKR", "Ukraine", 1, 3, 1)], [], 2025), year([row("UKR", "Ukraine", 1, 3, 1)], [], 2026)], rawMeta(), trade);
    expect(meta.years).toEqual([{ fiscal_year: 2025, is_partial: false }, { fiscal_year: 2026, is_partial: true }]);
  });
});

describe("validateAid", () => {
  const mk = (sector_rows: RawRow[]) => {
    const raw: RawYear[] = [{ fiscal_year: 2025, sector_rows, military_rows: [] }];
    const meta = rawMeta({ expected_records: { sector: { "2": sector_rows.filter((r) => r[4] === 2).length, "3": sector_rows.filter((r) => r[4] === 3).length }, military: {} } });
    return { raw, meta, built: buildAid(raw, meta, trade) };
  };
  it("passes clean data", () => {
    const { raw, meta, built } = mk([row("UKR", "Ukraine", 1, 3, 5), row("UKR", "Ukraine", 1, 2, 5)]);
    expect(() => validateAid(built.rows, built.meta, meta, raw)).not.toThrow();
  });
  it("fails when a year's national total is not positive", () => {
    const { raw, meta, built } = mk([row("UKR", "Ukraine", 1, 3, -5), row("UKR", "Ukraine", 1, 2, 5)]);
    expect(() => validateAid(built.rows, built.meta, meta, raw)).toThrow(/not positive/);
  });
  it("fails on a truncated snapshot (row count differs from the source's own total)", () => {
    const { raw, built } = mk([row("UKR", "Ukraine", 1, 3, 5)]);
    expect(() => validateAid(built.rows, built.meta, rawMeta(), raw)).toThrow(/truncated or stale/);
  });
  it("fails on a duplicate grain key", () => {
    const { raw, meta, built } = mk([row("UKR", "Ukraine", 1, 3, 5), row("UKR", "Ukraine", 1, 2, 5)]);
    expect(() => validateAid([...built.rows, built.rows[0]], built.meta, meta, raw)).toThrow(/duplicate grain key/);
  });
});

describe("reconcile", () => {
  it("grades by the thresholds and treats FY2026 as sanity only", () => {
    const out = reconcile([]);
    expect(out.find((r) => r.label.startsWith("FY2026 total"))!.status).toBe("sanity");
    expect(out.find((r) => r.label === "FY2025 Health")!.status).toBe("stop");
  });
});
