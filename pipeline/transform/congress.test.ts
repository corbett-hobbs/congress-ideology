import { describe, expect, it } from "vitest";
import {
  congressOnDate,
  congressStartDate,
  congressesForTerm,
} from "./congress";

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("congressStartDate", () => {
  it("uses March 4 through the 73rd Congress, January 3 from the 74th", () => {
    expect(iso(congressStartDate(1))).toBe("1789-03-04");
    expect(iso(congressStartDate(73))).toBe("1933-03-04");
    expect(iso(congressStartDate(74))).toBe("1935-01-03");
    expect(iso(congressStartDate(113))).toBe("2013-01-03");
    expect(iso(congressStartDate(119))).toBe("2025-01-03");
  });
});

describe("congressOnDate", () => {
  it("returns null before the 1st Congress", () => {
    expect(congressOnDate(new Date(Date.UTC(1789, 0, 1)))).toBeNull();
  });

  it("maps dates to the Congress in session", () => {
    expect(congressOnDate(new Date(Date.UTC(2013, 0, 3)))).toBe(113);
    expect(congressOnDate(new Date(Date.UTC(2014, 5, 1)))).toBe(113);
    expect(congressOnDate(new Date(Date.UTC(2015, 0, 2)))).toBe(113);
    expect(congressOnDate(new Date(Date.UTC(2015, 0, 3)))).toBe(114);
    expect(congressOnDate(new Date(Date.UTC(2025, 6, 4)))).toBe(119);
  });

  it("handles the March-4 boundary for pre-1935 Congresses", () => {
    expect(congressOnDate(new Date(Date.UTC(1801, 2, 3)))).toBe(6);
    expect(congressOnDate(new Date(Date.UTC(1801, 2, 4)))).toBe(7);
  });
});

describe("congressesForTerm", () => {
  it("expands a 6-year Senate term to three Congresses", () => {
    expect(congressesForTerm("2013-01-03", "2019-01-03", 119)).toEqual([
      113, 114, 115,
    ]);
  });

  it("treats end as exclusive (a term ending on a convening date)", () => {
    // House term for the 116th only, even though it ends on the 117th's start.
    expect(congressesForTerm("2019-01-03", "2021-01-03", 119)).toEqual([116]);
  });

  it("counts a Congress a term ends partway through (death, resignation)", () => {
    expect(congressesForTerm("2015-01-03", "2016-06-15", 119)).toEqual([114]);
  });

  it("counts only the Congress a mid-term appointee actually joins", () => {
    expect(congressesForTerm("2018-04-10", "2019-01-03", 119)).toEqual([115]);
  });

  it("clamps to capCongress for a term running past current data", () => {
    expect(congressesForTerm("2025-01-03", "2031-01-03", 119)).toEqual([119]);
  });
});
