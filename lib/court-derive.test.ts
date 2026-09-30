import { describe, expect, it } from "vitest";
import { loadRealCourt } from "./court-test-data";
import { fitDomain } from "./court-derive";
import { isDimmed, isSeated, termLabel } from "./court-types";

const c = loadRealCourt();
const name = (id: number) => c.justices.find((j) => j.id === id)?.short;
const seated = (t: number) => c.justices.filter((j) => isSeated(j, t));

describe("court payload", () => {
  it("covers every term with no gaps, derived from the data", () => {
    expect(c.firstTerm).toBe(1937);
    expect(c.terms).toHaveLength(c.lastTerm - c.firstTerm + 1);
    c.terms.forEach((t, i) => expect(t.term).toBe(c.firstTerm + i));
  });

  it("seats nine justices except in the documented turnover terms", () => {
    const tens = { 1937: 10, 1938: 10, 1956: 11, 1958: 10, 1961: 10, 1975: 10, 2005: 10 };
    for (const t of c.terms) {
      expect(seated(t.term).length).toBe(
        (tens as Record<number, number>)[t.term] ?? 9,
      );
    }
  });

  it("fits an asymmetric domain that contains every score", () => {
    const all = c.justices.flatMap((j) => j.s);
    expect(c.domain[0]).toBeLessThanOrEqual(Math.min(...all));
    expect(c.domain[1]).toBeGreaterThanOrEqual(Math.max(...all));
    expect(Math.abs(c.domain[0])).toBeGreaterThan(c.domain[1]);
    expect(fitDomain([-1, 1])).toEqual([-1.5, 1.5]);
  });

  it("names who left and joined in the turnover terms", () => {
    const t = (n: number) => c.terms[n - c.firstTerm];
    const names = (ids: number[]) => ids.map(name).sort();
    expect(names(t(1937).left)).toEqual(["Sutherland"]);
    expect(names(t(1937).joined)).toEqual(["Reed"]);
    expect(names(t(1938).left)).toEqual(["Brandeis"]);
    expect(names(t(1938).joined)).toEqual(["Douglas"]);
    expect(names(t(1956).left)).toEqual(["Minton", "Reed"]);
    expect(names(t(1956).joined)).toEqual(["Whittaker"]);
    expect(names(t(1958).left)).toEqual(["Burton"]);
    expect(names(t(1958).joined)).toEqual(["Stewart"]);
    expect(names(t(1961).left)).toEqual(["Whittaker"]);
    expect(names(t(1961).joined)).toEqual(["White"]);
    expect(names(t(1975).left)).toEqual(["Douglas"]);
    expect(names(t(1975).joined)).toEqual(["Stevens"]);
    expect(names(t(2005).left)).toEqual(["O’Connor".replace("’", "'")]);
    expect(names(t(2005).joined)).toEqual(["Alito"]);
    // ordinary terms carry no mid-term change
    for (const x of c.terms) {
      if (![1937, 1938, 1956, 1958, 1961, 1975, 2005].includes(x.term)) {
        expect(x.left).toEqual([]);
        expect(x.joined).toEqual([]);
      }
    }
  });

  it("uses the post-replacement record as the median in split terms", () => {
    expect(name(c.terms[2005 - c.firstTerm].medianJusticeId)).toBe("Kennedy");
    expect(name(c.terms[1938 - c.firstTerm].medianJusticeId)).toBe("Stone");
  });

  it("maps presidents as people, oldest first, every appointee attached", () => {
    expect(c.presidents[0].key).toBe("Wilson");
    expect(c.presidents.at(-1)?.key).toBe("Biden");
    expect(c.presidents.find((p) => p.key === "Hoover")?.justiceIds).toContain(
      c.justices.find((j) => j.short === "Hughes")?.id,
    );
    expect(c.presidents.flatMap((p) => p.justiceIds).sort()).toEqual(
      c.justices.map((j) => j.id).sort(),
    );
  });

  it("disambiguates shared surnames and computes the unweighted career mean", () => {
    const shorts = c.justices.map((j) => j.short);
    expect(new Set(shorts).size).toBe(shorts.length);
    expect(shorts).toContain("K. Jackson");
    const t = c.justices.find((j) => j.short === "Thomas")!;
    expect(t.career).toBeCloseTo(t.s.reduce((a, b) => a + b, 0) / t.s.length, 2);
  });
});

describe("helpers", () => {
  it("labels terms t–(t+1)", () => expect(termLabel(2023)).toBe("2023–2024"));
  it("dims, never removes, on party and president", () => {
    const j = { party: "R" as const, pres: "Reagan" };
    expect(isDimmed(j, { appointed: "all", president: null })).toBe(false);
    expect(isDimmed(j, { appointed: "D", president: null })).toBe(true);
    expect(isDimmed(j, { appointed: "R", president: "Nixon" })).toBe(true);
    expect(isDimmed(j, { appointed: "R", president: "Reagan" })).toBe(false);
  });
});
