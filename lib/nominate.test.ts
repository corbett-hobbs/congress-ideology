import { describe, expect, it } from "vitest";
import {
  NOMINATE_METRICS,
  careerMetric,
  driftMetric,
  familyForView,
  nominateMetric,
} from "./nominate";

describe("nominateMetric", () => {
  it("maps family + dim to the CSV column name", () => {
    expect(nominateMetric("nominate", 1).column).toBe("nominate_dim1");
    expect(nominateMetric("nokken_poole", 2).column).toBe("nokken_poole_dim2");
  });

  it("flags only nokken_poole as varying by Congress", () => {
    expect(nominateMetric("nominate", 1).variesByCongress).toBe(false);
    expect(nominateMetric("nominate", 2).variesByCongress).toBe(false);
    expect(nominateMetric("nokken_poole", 1).variesByCongress).toBe(true);
    expect(nominateMetric("nokken_poole", 2).variesByCongress).toBe(true);
  });
});

describe("NOMINATE_METRICS", () => {
  it("has all four metrics with unique columns", () => {
    expect(NOMINATE_METRICS).toHaveLength(4);
    expect(new Set(NOMINATE_METRICS.map((m) => m.column)).size).toBe(4);
  });
});

describe("career vs drift", () => {
  it("careerMetric is the static family", () => {
    expect(careerMetric(1).family).toBe("nominate");
    expect(careerMetric(1).variesByCongress).toBe(false);
  });

  it("driftMetric is the per-Congress family", () => {
    expect(driftMetric(1).family).toBe("nokken_poole");
    expect(driftMetric(1).variesByCongress).toBe(true);
  });

  it("familyForView routes time-based views to nokken_poole", () => {
    expect(familyForView("overall")).toBe("nominate");
    expect(familyForView("drift")).toBe("nokken_poole");
  });
});
