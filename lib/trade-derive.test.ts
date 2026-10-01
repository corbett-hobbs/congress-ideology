import { describe, expect, it } from "vitest";
import { balance, dutyRate, monthCount, monthIndex, nextSort, partnerBalance, periodOf, sortByValue, sortPartners, totalTrade, windowRate, yearSum, type SortState } from "./trade-derive";
import type { YearPartnerRow } from "./trade-types";

const row = (code: string, name: string, ex: number, im: number): YearPartnerRow => [code, name, ex, im, null, null];
const rows = [row("CHN", "China", 100, 500), row("CAN", "Canada", 400, 350), row("MEX", "Mexico", 300, 400), row("AUS", "Australia", 200, 100), row("DEU", "Germany", 60, 150)];
const names = (r: YearPartnerRow[]) => r.map((x) => x[1]);

describe("month axis", () => {
  it("round-trips periods", () => {
    expect(monthIndex("1991-01")).toBe(0);
    expect(monthIndex("2026-07")).toBe(35 * 12 + 6);
    for (const p of ["1991-01", "1999-12", "2010-01", "2026-07"]) expect(periodOf(monthIndex(p))).toBe(p);
    expect(monthCount("1991-12")).toBe(12);
  });
  it("rejects a bad period", () => expect(() => monthIndex("2026-7")).toThrow(/bad period/));
});

describe("per-month math", () => {
  it("balance, total and rate propagate nulls", () => {
    expect(balance(10, 25)).toBe(-15);
    expect(balance(null, 25)).toBeNull();
    expect(totalTrade(10, null)).toBeNull();
    expect(dutyRate(5, 100)).toBe(0.05);
    expect(dutyRate(5, 0)).toBeNull();
    expect(dutyRate(null, 100)).toBeNull();
  });
});

describe("windowRate", () => {
  const duties = [10, 20, null, 40];
  const imports = [100, 100, 100, 200];
  it("weights by imports (total duties over total imports), skipping months with a null side", () => {
    const w = windowRate(duties, imports, "1991-01", "1991-04");
    expect(w).toMatchObject({ duties: 70, imports: 400, months: 3, span: 4 });
    expect(w.rate).toBeCloseTo(70 / 400, 10);
    // not the mean of monthly rates ((.1 + .2 + .2) / 3)
    expect(w.rate).not.toBeCloseTo((0.1 + 0.2 + 0.2) / 3, 3);
  });
  it("returns a null rate when no month has data (a country with missing months)", () => {
    const w = windowRate([null, null], [5, 5], "1991-01", "1991-02");
    expect(w).toMatchObject({ rate: null, months: 0, span: 2 });
  });
  it("treats months past the array end as missing", () => {
    expect(windowRate([10], [100], "1991-01", "1991-06").months).toBe(1);
  });
  it("rejects a reversed window", () => expect(() => windowRate([], [], "1991-03", "1991-01")).toThrow(/reversed/));
});

describe("yearSum", () => {
  it("sums a calendar year and is null when empty", () => {
    const s = Array.from({ length: 24 }, (_, i) => (i < 12 ? 1 : null));
    expect(yearSum(s, 1991)).toBe(12);
    expect(yearSum(s, 1992)).toBeNull();
  });
});

describe("partner sorts", () => {
  it("balance: biggest deficit first, surpluses last", () => {
    expect(names(sortPartners(rows, { key: "balance", reversed: false }))).toEqual(["China", "Mexico", "Germany", "Canada", "Australia"]);
    expect(partnerBalance(rows[0])).toBe(-400);
  });
  it("total: largest first; alpha: A to Z", () => {
    expect(names(sortPartners(rows, { key: "total", reversed: false }))).toEqual(["Canada", "Mexico", "China", "Australia", "Germany"]);
    expect(names(sortPartners(rows, { key: "alpha", reversed: false }))).toEqual(["Australia", "Canada", "China", "Germany", "Mexico"]);
  });
  it("every sort reverses exactly", () => {
    for (const key of ["balance", "total", "alpha"] as const) {
      const fwd = names(sortPartners(rows, { key, reversed: false }));
      expect(names(sortPartners(rows, { key, reversed: true }))).toEqual([...fwd].reverse());
    }
  });
  it("breaks ties by name, stably, in both directions", () => {
    const tie = [row("B", "Beta", 1, 2), row("A", "Alpha", 1, 2), row("C", "Gamma", 1, 2)];
    expect(names(sortPartners(tie, { key: "balance", reversed: false }))).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(names(sortPartners(tie, { key: "balance", reversed: true }))).toEqual(["Gamma", "Beta", "Alpha"]);
  });
  it("does not mutate its input", () => {
    const copy = [...rows];
    sortPartners(rows, { key: "alpha", reversed: true });
    expect(rows).toEqual(copy);
  });
  it("clicking the active sort flips it; another sort resets to its default direction", () => {
    let s: SortState = { key: "balance", reversed: false };
    s = nextSort(s, "balance");
    expect(s).toEqual({ key: "balance", reversed: true });
    s = nextSort(s, "balance");
    expect(s.reversed).toBe(false);
    s = nextSort(nextSort(s, "balance"), "total");
    expect(s).toEqual({ key: "total", reversed: false });
  });
});

describe("sortByValue (nullable)", () => {
  const items = [{ n: "a", v: 3 }, { n: "b", v: null }, { n: "c", v: -1 }, { n: "d", v: null }];
  const get = (r: { v: number | null }) => r.v;
  const nm = (r: { n: string }) => r.n;
  it("keeps nulls last in either direction", () => {
    expect(sortByValue(items, get, nm, 1).map(nm)).toEqual(["c", "a", "b", "d"]);
    expect(sortByValue(items, get, nm, -1).map(nm)).toEqual(["a", "c", "b", "d"]);
  });
});
