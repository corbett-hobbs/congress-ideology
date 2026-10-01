import { describe, expect, it } from "vitest";
import { dayFromFraction, readDebt, readFiscal, readIncome, readMisery, readMonthly, readWeekly } from "./indicator-lookup";
import { dayOf } from "./indicator-time";

const d = (y: number, m: number, day: number) => dayOf(y, m - 1, day);

describe("weekly lookup", () => {
  const gas: [number, number][] = [[d(1991, 1, 21), 1.19], [d(1991, 1, 28), 1.17]];
  it("January 1991 gas gap: no reading before the first observation", () => {
    expect(readWeekly(gas, d(1991, 1, 10)).value).toBeNull();
    expect(readWeekly(gas, d(1991, 1, 10)).caption).toBe("no reading yet");
  });
  it("uses the last observation on or before the date", () => {
    expect(readWeekly(gas, d(1991, 1, 21)).value).toBe(1.19);
    expect(readWeekly(gas, d(1991, 1, 27)).value).toBe(1.19);
    expect(readWeekly(gas, d(1991, 1, 28)).snap).toBe(d(1991, 1, 28));
  });
  it("only within 14 days", () => {
    expect(readWeekly(gas, d(1991, 2, 11)).value).toBe(1.17);
    expect(readWeekly(gas, d(1991, 2, 12)).value).toBeNull();
  });
  it("null date is the latest observation", () => {
    expect(readWeekly(gas, null).caption).toBe("week of Jan 28, 1991");
  });
});

describe("monthly lookup", () => {
  const a = [1, null, 3];
  it("exact month", () => expect(readMonthly(a, d(1991, 3, 31), "x").value).toBe(3));
  it("missing month gives a reason", () => {
    const r = readMonthly(a, d(1991, 2, 15), "not collected");
    expect(r.value).toBeNull();
    expect(r.caption).toBe("February 1991, not collected");
  });
  it("after the last month: not yet released", () => {
    expect(readMonthly(a, d(1991, 4, 1), "x").caption).toBe("April 1991 not yet released");
  });
  it("latest skips trailing nulls", () => {
    expect(readMonthly([1, 2, null], null, "x").caption).toBe("February 1991");
  });
  it("October 2025 gap: not collected", () => {
    const m = (2025 - 1991) * 12 + 9;
    const un: (number | null)[] = Array.from({ length: m + 11 }, () => 4);
    un[m] = null;
    expect(readMonthly(un, d(2025, 10, 15), "not collected").caption).toBe("October 2025, not collected");
    expect(readMonthly(un, d(2025, 11, 15), "not collected").value).toBe(4);
  });
});

describe("misery index", () => {
  it("sums same-month values; null if either is missing", () => {
    expect(readMisery([5, null], [2, 3], d(1991, 1, 1)).value).toBe(7);
    expect(readMisery([5, null], [2, 3], d(1991, 2, 1)).value).toBeNull();
    expect(readMisery([5, 6], [2, null], null).value).toBe(7);
  });
});

describe("annual income", () => {
  const inc = { 2024: 80000, 2025: 82000 };
  it("calendar year, plotted July 1", () => {
    const r = readIncome(inc, d(2024, 12, 31));
    expect(r.value).toBe(80000);
    expect(r.snap).toBe(d(2024, 7, 1));
  });
  it("a later year is not yet published", () => expect(readIncome(inc, d(2026, 1, 1)).caption).toBe("2026 not yet published"));
  it("latest", () => expect(readIncome(inc, null).value).toBe(82000));
});

describe("fiscal-year deficit", () => {
  const def = { 2024: -6, 2025: -5.9 };
  it("September 30 is still the old fiscal year; October 1 rolls over", () => {
    expect(readFiscal(def, d(2024, 9, 30)).value).toBe(-6);
    expect(readFiscal(def, d(2024, 10, 1)).value).toBe(-5.9);
    expect(readFiscal(def, d(2024, 10, 1)).caption).toBe("fiscal 2025");
  });
  it("plots at the middle of the fiscal year", () => expect(readFiscal(def, d(2024, 1, 1)).snap).toBe(d(2024, 4, 1)));
  it("the window's right edge reads fiscal 2026 as not yet reported", () => {
    expect(readFiscal(def, d(2026, 9, 30)).caption).toBe("fiscal 2026 not yet reported");
  });
});

describe("quarterly debt", () => {
  const held = [50, 51, null];
  const tot = [60, 61, 62];
  it("quarter boundaries", () => {
    expect(readDebt(held, tot, d(1991, 3, 31)).value).toBe(50);
    expect(readDebt(held, tot, d(1991, 4, 1)).value).toBe(51);
    expect(readDebt(held, tot, d(1991, 4, 1)).value2).toBe(61);
  });
  it("snaps to quarter start + 45 days", () => expect(readDebt(held, tot, d(1991, 5, 5)).snap).toBe(d(1991, 4, 1) + 45));
  it("missing or later quarters are not yet reported", () => {
    expect(readDebt(held, tot, d(1991, 8, 1)).caption).toBe("Q3 1991 not yet reported");
    expect(readDebt(held, tot, d(1992, 1, 1)).caption).toBe("Q1 1992 not yet reported");
  });
  it("latest skips trailing nulls", () => expect(readDebt(held, tot, null).caption).toBe("held by the public, Q2 1991"));
});

describe("dayFromFraction", () => {
  it("clamps the right edge to the last real day", () => {
    expect(dayFromFraction(1, 13057)).toBe(13056);
    expect(dayFromFraction(0, 13057)).toBe(0);
    expect(dayFromFraction(1.2, 13057)).toBe(13056);
  });
});
