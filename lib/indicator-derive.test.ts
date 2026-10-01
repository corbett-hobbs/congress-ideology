import { describe, expect, it } from "vitest";
import {
  congressForDate,
  congressForFiscalYear,
  monthlyChange,
  periodEnd,
  termIdForDate,
  windowPoints,
  yearOverYearPercent,
  type Point,
} from "./indicator-derive";
import { INDICATORS_DISPLAY_START } from "./indicator-entities";

const monthly = (start: string, values: number[]): Point[] => {
  let [y, m] = start.split("-").map(Number);
  return values.map((value) => {
    const date = `${y}-${String(m).padStart(2, "0")}-01`;
    if (++m > 12) {
      m = 1;
      y++;
    }
    return { date, value };
  });
};

describe("monthlyChange (jobs added)", () => {
  it("is the month-over-month difference, null for the first point", () => {
    expect(monthlyChange(monthly("2020-11-01", [100, 110, 105]))).toEqual([
      { date: "2020-11-01", value: null },
      { date: "2020-12-01", value: 10 },
      { date: "2021-01-01", value: -5 },
    ]);
  });
  it("uses the pre-window month: windowing after deriving keeps the first in-window change", () => {
    const pts = monthly("1990-12-01", [1000, 1010, 1025]);
    const windowed = windowPoints(monthlyChange(pts), "monthly", "1991-01-01");
    expect(windowed[0]).toEqual({ date: "1991-01-01", value: 10 });
  });
  it("is null (not a two-month change) when the prior month is missing", () => {
    const pts = [
      { date: "2025-09-01", value: 100 },
      { date: "2025-11-01", value: 103 },
    ];
    expect(monthlyChange(pts)[1].value).toBeNull();
  });
});

describe("yearOverYearPercent (inflation)", () => {
  it("is the percent change from 12 months earlier", () => {
    const pts = monthly("1990-01-01", [100, ...Array(11).fill(101), 103]);
    const out = yearOverYearPercent(pts);
    expect(out[11].value).toBeNull();
    expect(out[12].value).toBeCloseTo(3, 10);
  });
  it("has its 12-month lookback available before the window starts", () => {
    // Window starts 1991-01; the Jan 1991 inflation needs Jan 1990, which is pre-window.
    const pts = monthly("1990-01-01", Array.from({ length: 13 }, (_, i) => 100 + i));
    const windowed = windowPoints(yearOverYearPercent(pts), "monthly", "1991-01-01");
    expect(windowed).toHaveLength(1);
    expect(windowed[0].value).toBeCloseTo(12, 10);
  });
  it("is null where the observation a year earlier is missing (e.g. the Oct 2025 gap)", () => {
    const pts = [
      { date: "2024-10-01", value: 100 },
      { date: "2025-09-01", value: 103 },
      { date: "2025-11-01", value: 104 },
      { date: "2026-10-01", value: 106 },
    ];
    const out = yearOverYearPercent(pts);
    expect(out.find((p) => p.date === "2026-10-01")!.value).toBeNull();
    expect(out.find((p) => p.date === "2025-11-01")!.value).toBeNull();
  });
});

describe("windowPoints / periodEnd", () => {
  it("includes a value whose period overlaps the window", () => {
    expect(periodEnd("1991-01-01", "annual")).toBe("1991-12-31");
    const pts = [{ date: "1990-01-01" }, { date: "1991-01-01" }];
    expect(windowPoints(pts, "annual")).toEqual([{ date: "1991-01-01" }]);
  });
  it("handles monthly and quarterly period ends", () => {
    expect(periodEnd("1991-01-01", "monthly")).toBe("1991-01-31");
    expect(periodEnd("1996-02-01", "monthly")).toBe("1996-02-29");
    expect(periodEnd("1991-01-01", "quarterly")).toBe("1991-03-31");
    expect(periodEnd("1991-10-01", "quarterly")).toBe("1991-12-31");
  });
  it("uses the shared display-start constant by default", () => {
    expect(windowPoints([{ date: "1991-01-14" }, { date: INDICATORS_DISPLAY_START }], "weekly")).toEqual([
      { date: INDICATORS_DISPLAY_START },
    ]);
  });
});

describe("congressForDate", () => {
  it("maps Jan 3 starts exactly", () => {
    expect(congressForDate("1991-01-03")).toBe(102);
    expect(congressForDate("1991-01-02")).toBe(101);
    expect(congressForDate("2025-01-03")).toBe(119);
    expect(congressForDate("2025-01-02")).toBe(118);
    expect(congressForDate("1935-01-03")).toBe(74);
  });
  it("treats the second year of a Congress as the same Congress", () => {
    expect(congressForDate("1992-06-15")).toBe(102);
    expect(congressForDate("2026-09-30")).toBe(119);
    expect(congressForDate("2027-01-02")).toBe(119);
    expect(congressForDate("2027-01-03")).toBe(120);
  });
  it("refuses dates before 1935-01-03", () => {
    expect(() => congressForDate("1934-12-31")).toThrow(/March 4/);
    expect(() => congressForDate("nope")).toThrow();
  });
  it("maps a fiscal year to the Congress in session when it ends", () => {
    expect(congressForFiscalYear(2023)).toBe(118);
    expect(congressForFiscalYear(2024)).toBe(118);
    expect(congressForFiscalYear(2025)).toBe(119);
  });
});

describe("termIdForDate", () => {
  const admins = [
    { term_id: "2017-01-20", president: "Donald Trump", president_slug: "donald-trump", party: "Republican", start: "2017-01-20", end: "2021-01-19" },
    { term_id: "2021-01-20", president: "Joe Biden", president_slug: "joe-biden", party: "Democratic", start: "2021-01-20", end: "2025-01-19" },
    { term_id: "2025-01-20", president: "Donald Trump", president_slug: "donald-trump", party: "Republican", start: "2025-01-20", end: null },
  ] as const;
  it("maps by inauguration boundaries", () => {
    expect(termIdForDate("2021-01-19", admins)).toBe("2017-01-20");
    expect(termIdForDate("2021-01-20", admins)).toBe("2021-01-20");
    expect(termIdForDate("2026-09-01", admins)).toBe("2025-01-20");
    expect(termIdForDate("2010-01-01", admins)).toBeNull();
  });
});
