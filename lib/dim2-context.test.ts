import { describe, expect, it } from "vitest";
import { DIM2_MODERN_ERA_FROM, dim2Context } from "./dim2-context";

describe("dim2Context", () => {
  it("uses the historical reading before the threshold", () => {
    expect(dim2Context(DIM2_MODERN_ERA_FROM - 1).tag).toBe(
      "DIMENSION 2 · HISTORICAL",
    );
    expect(dim2Context(1).body).toContain("slavery, currency, nativism");
  });

  it("uses the current-era reading from the threshold on", () => {
    expect(dim2Context(DIM2_MODERN_ERA_FROM).tag).toBe(
      "DIMENSION 2 · CURRENT ERA",
    );
    expect(dim2Context(119).body).toContain("establishment vs. anti-establishment");
    expect(dim2Context(119).sourceHref).toContain("fivethirtyeight.com");
  });
});
