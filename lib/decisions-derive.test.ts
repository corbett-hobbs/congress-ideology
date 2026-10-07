import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ALL_AREAS_LABEL,
  areaRows,
  bandShare,
  buildDecisionsPayload,
  buildStacks,
  casesPerTerm,
  chiefBandTerms,
  chiefOfTerm,
  chiefSegments,
  isSmallSample,
  median,
  nextAreaSort,
  niceStep,
  sumBucket,
  windowCells,
  windowIndexes,
  windowSum,
} from "./decisions-derive";
import type { DecisionCountRow, DecisionsMeta } from "./decisions-entities";

const read = <T>(f: string): T => JSON.parse(readFileSync(`pipeline/output/${f}`, "utf8")) as T;
const counts = read<DecisionCountRow[]>("decisions_counts.json");
const meta = read<DecisionsMeta>("decisions_meta.json");
const report = read<{ cases: number; bucket_totals: Record<string, number>; cases_by_issue_area: Record<string, number>; terms: string }>("decisions_report.json");
const d = buildDecisionsPayload(counts, meta);
const FULL: [number, number] = [d.terms[0], d.terms[d.terms.length - 1]];

describe("payload", () => {
  it("reconciles to decisions_report.json", () => {
    expect(d.caseCount).toBe(report.cases);
    expect(d.all.reduce((s, b) => s + sumBucket(b), 0)).toBe(report.cases);
    const w = windowSum(d, -1, FULL);
    expect(Object.values(report.bucket_totals)).toEqual([...w]);
    expect(`${d.terms[0]}-${d.terms[d.terms.length - 1]}`).toBe(report.terms);
  });
  it("per-area totals match the report; unclassified cases are in All only", () => {
    d.areas.forEach((a, i) => {
      expect(d.by[i].reduce((s, b) => s + sumBucket(b), 0), a.id).toBe(report.cases_by_issue_area[a.id]);
    });
    const inAreas = d.by.reduce((s, rows) => s + rows.reduce((t, b) => t + sumBucket(b), 0), 0);
    expect(sumBucket(windowSum(d, -1, FULL)) - inAreas).toBe(d.unclassified);
  });
  it("is dense, one slot per term", () => {
    expect(d.terms).toHaveLength(d.all.length);
    d.by.forEach((rows) => expect(rows).toHaveLength(d.terms.length));
    expect(d.terms.every((t, i) => i === 0 || t === d.terms[i - 1] + 1)).toBe(true);
  });
  it("anchors", () => {
    const at = (t: number) => sumBucket(d.all[t - d.terms[0]]);
    expect(at(1946)).toBe(142);
    expect(at(2024)).toBe(61);
    expect(d.all[2015 - 1946][4]).toBe(4);
  });
});

describe("chief spans", () => {
  it("cover every term exactly once", () => {
    for (const t of d.terms) expect(d.chiefs.filter((c) => t >= c.start && t <= c.end), String(t)).toHaveLength(1);
    expect(d.chiefs.map((c) => c.last)).toEqual(["Vinson", "Warren", "Burger", "Rehnquist", "Roberts"]);
    expect(d.chiefs.map((c) => c.party)).toEqual(["D", "R", "R", "R", "R"]);
    expect(chiefOfTerm(d, 1970)?.name).toBe("Warren Burger");
  });
  it("make a slider band and per-slot runs", () => {
    const band = chiefBandTerms(d);
    expect(band[0]).toMatchObject({ last: "Vinson", initials: "FV", from: 1946, to: 1952, party: "D" });
    expect(band[1].label).toContain("appointed Chief Justice by Dwight D. Eisenhower");
    const segs = chiefSegments(d, [1951, 1952, 1953, 1954]);
    expect(segs.map((s) => [s.last, s.s, s.e])).toEqual([["Vinson", 0, 1], ["Warren", 2, 3]]);
  });
});

describe("window", () => {
  it("sums and clamps", () => {
    expect(windowIndexes(d, [1950, 1960])).toEqual([4, 14]);
    expect(windowIndexes(d, [1900, 3000])).toEqual([0, d.terms.length - 1]);
    const { terms, cells } = windowCells(d, -1, [1950, 1952]);
    expect(terms).toEqual([1950, 1951, 1952]);
    expect(sumBucket(windowSum(d, -1, [1950, 1952]))).toBe(casesPerTerm(cells).reduce((a, b) => a + b, 0));
    expect(sumBucket(windowSum(d, 0, [2024, 2024]))).toBe(sumBucket(d.by[0][2024 - 1946]));
  });
  it("shares sum to 100 within rounding", () => {
    for (const ai of [-1, 0, 7]) {
      const w = windowSum(d, ai, [1980, 2000]);
      const pct = [0, 1, 2, 3, 4].map((k) => Math.round(bandShare(w, k) * 100));
      expect(Math.abs(pct.reduce((a, b) => a + b, 0) - 100)).toBeLessThanOrEqual(2);
      expect([0, 1, 2, 3, 4].reduce((s, k) => s + bandShare(w, k), 0)).toBeCloseTo(1, 10);
    }
  });
});

describe("stacks", () => {
  const { cells } = windowCells(d, -1, [1990, 2000]);
  it("share stacks reach 100 in every term; count stacks reach the term's cases", () => {
    const s = buildStacks(cells, "share", [0, 1, 2, 3, 4]);
    s.up[4].forEach((v) => expect(v).toBeCloseTo(100, 8));
    const c = buildStacks(cells, "count", [0, 1, 2, 3, 4]);
    expect(c.up[4]).toEqual(casesPerTerm(cells));
    expect(c.max).toBe(Math.max(...casesPerTerm(cells)));
  });
  it("an isolated band starts from zero on its own scale", () => {
    const s = buildStacks(cells, "count", [3]);
    expect(s.lo[3].every((v) => v === 0)).toBe(true);
    expect(s.up[3]).toEqual(cells.map((b) => b[3]));
    expect(s.max).toBe(Math.max(1, ...cells.map((b) => b[3])));
  });
  it("niceStep gives round steps", () => {
    expect([niceStep(61), niceStep(156), niceStep(8), niceStep(1)]).toEqual([20, 50, 2, 1]);
  });
});

describe("issue-area rows", () => {
  it("pins All first, drops areas with no cases, and sorts three ways, each reversible", () => {
    const rows = areaRows(d, FULL, { key: "n", reversed: false });
    expect(rows[0]).toMatchObject({ index: -1, label: ALL_AREAS_LABEL, total: d.caseCount });
    const totals = rows.slice(1).map((r) => r.total);
    expect([...totals].sort((a, b) => b - a)).toEqual(totals);
    expect(areaRows(d, FULL, { key: "n", reversed: true }).slice(1).map((r) => r.total)).toEqual([...totals].reverse());
    const u = areaRows(d, FULL, { key: "u", reversed: false }).slice(1).map((r) => bandShare(r.bucket, 0));
    expect([...u].sort((a, b) => b - a)).toEqual(u);
    const f = areaRows(d, FULL, { key: "f", reversed: true }).slice(1).map((r) => bandShare(r.bucket, 4));
    expect([...f].sort((a, b) => a - b)).toEqual(f);
    expect(rows.slice(1).every((r) => r.total > 0)).toBe(true);
    // A one-term window drops areas with nothing that term (Private action has 5 cases in all).
    expect(areaRows(d, [1946, 1946], { key: "n", reversed: false }).length).toBeLessThan(rows.length);
  });
  it("sort clicks: same key reverses, another key resets", () => {
    expect(nextAreaSort({ key: "n", reversed: false }, "n")).toEqual({ key: "n", reversed: true });
    expect(nextAreaSort({ key: "n", reversed: true }, "u")).toEqual({ key: "u", reversed: false });
  });
});

describe("small-sample test", () => {
  it("is on for a thin issue area and never for All", () => {
    const privacy = d.areas.findIndex((a) => a.id === "private-action");
    expect(isSmallSample(d, privacy, FULL)).toBe(true);
    expect(isSmallSample(d, -1, FULL)).toBe(false);
    const crim = d.areas.findIndex((a) => a.id === "criminal-procedure");
    expect(isSmallSample(d, crim, [1960, 1980])).toBe(false);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});
