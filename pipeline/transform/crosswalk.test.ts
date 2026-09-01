import { describe, expect, it } from "vitest";
import type { Legislator } from "../validate/schemas";
import { buildCrosswalk, resolveBioguide } from "./crosswalk";

function leg(bioguide: string, icpsr?: number | number[]): Legislator {
  return {
    id: { bioguide, ...(icpsr === undefined ? {} : { icpsr }) },
    name: { first: "A", last: "B" },
  } as Legislator;
}

describe("buildCrosswalk", () => {
  it("maps icpsr to bioguide, including list-valued icpsr", () => {
    const { byIcpsr, conflicts } = buildCrosswalk([
      leg("A000001", 100),
      leg("B000002", [200, 201]),
      leg("C000003"),
    ]);
    expect(byIcpsr.get(100)).toBe("A000001");
    expect(byIcpsr.get(200)).toBe("B000002");
    expect(byIcpsr.get(201)).toBe("B000002");
    expect(byIcpsr.has(0)).toBe(false);
    expect(conflicts).toEqual([]);
  });

  it("collects a one-to-many icpsr as a conflict instead of picking one", () => {
    const { byIcpsr, conflicts } = buildCrosswalk([
      leg("A000001", 100),
      leg("Z000009", 100),
    ]);
    expect(byIcpsr.has(100)).toBe(false);
    expect(conflicts).toEqual([{ icpsr: 100, bioguides: ["A000001", "Z000009"] }]);
  });
});

describe("resolveBioguide", () => {
  const xwalk = buildCrosswalk([leg("A000001", 100)]);

  it("agree: crosswalk and Voteview column match", () => {
    expect(resolveBioguide(100, "A000001", xwalk)).toEqual({
      ok: true,
      bioguide: "A000001",
      source: "agree",
    });
  });

  it("crosswalk: only the crosswalk has it", () => {
    expect(resolveBioguide(100, undefined, xwalk)).toEqual({
      ok: true,
      bioguide: "A000001",
      source: "crosswalk",
    });
  });

  it("voteview: only Voteview's column has it", () => {
    expect(resolveBioguide(999, "X000999", xwalk)).toEqual({
      ok: true,
      bioguide: "X000999",
      source: "voteview",
    });
  });

  it("mismatch: crosswalk and Voteview disagree", () => {
    expect(resolveBioguide(100, "B000002", xwalk)).toEqual({
      ok: false,
      reason: "mismatch",
      icpsr: 100,
      crosswalk: "A000001",
      voteview: "B000002",
    });
  });

  it("unmapped: neither source resolves the icpsr", () => {
    expect(resolveBioguide(999, "", xwalk)).toEqual({
      ok: false,
      reason: "unmapped",
      icpsr: 999,
    });
  });
});
