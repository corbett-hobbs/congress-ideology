import { describe, expect, it } from "vitest";
import { bandTerms, ordinal, SLIDER_BOUNDS, termSegmentsFor, windowRows } from "./demographics-chart";
import type { DemoCongress, DemoPresident } from "./demographics-types";

const row = (congress: number, termId: string): DemoCongress => ({
  congress,
  date: "",
  year: 1789 + 2 * (congress - 1),
  termId,
  seats: 1,
  age: { D: { median: null, average: null, n: 0 }, R: { median: null, average: null, n: 0 } },
  ageAll: { median: null, average: null, n: 0 },
  ageMissing: 0,
  women: { D: 0, R: 0, O: 0 },
  tenure: [1, 0, 0, 0],
  servedSum: 1,
});
const presidents: DemoPresident[] = [
  { id: "a", president: "Alice Aa", last: "Aa", party: "D" },
  { id: "b", president: "Bob Bb", last: "Bb", party: "R" },
  { id: "c", president: "Cy Cc", last: "Cc", party: "D" },
];
const rows = [row(73, "a"), row(74, "a"), row(75, "b"), row(76, "b"), row(77, "b")]; // 1933, 1935, 1937, 1939, 1941

describe("demographics chart helpers", () => {
  it("draws a Congress when the year it convened is inside the window", () => {
    expect(windowRows(rows, [1935, 1939]).map((r) => r.congress)).toEqual([74, 75, 76]);
    expect(windowRows(rows, SLIDER_BOUNDS)).toHaveLength(5);
    expect(windowRows(rows, [1934, 1934])).toEqual([]);
  });
  it("spans each president over the years of the Congresses they opened, and skips presidents who opened none", () => {
    const t = bandTerms(rows, presidents);
    expect(t.map((x) => [x.id, x.from, x.to])).toEqual([["a", 1933, 1936], ["b", 1937, 1942]]);
  });
  it("makes one term-band run per president, one slot per Congress", () => {
    expect(termSegmentsFor(rows, presidents).map((s) => [s.id, s.s, s.e])).toEqual([["a", 0, 1], ["b", 2, 4]]);
  });
  it("writes ordinals", () => {
    expect([73, 101, 102, 111, 112, 113, 119].map(ordinal)).toEqual(["73rd", "101st", "102nd", "111th", "112th", "113th", "119th"]);
  });
});
