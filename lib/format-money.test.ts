import { describe, expect, it } from "vitest";
import {
  formatCompactUSD,
  formatOpenEndedUSD,
  formatSignedCompactUSD,
} from "./format-money";

describe("formatCompactUSD", () => {
  it("formats sub-$1K as a plain integer", () => {
    expect(formatCompactUSD(950)).toBe("$950");
    expect(formatCompactUSD(0)).toBe("$0");
  });

  it("formats thousands with 1 decimal, trimmed", () => {
    expect(formatCompactUSD(56_667)).toBe("$56.7K");
    expect(formatCompactUSD(57_000)).toBe("$57K");
  });

  it("formats millions with up to 2 decimals, trimmed", () => {
    expect(formatCompactUSD(1_360_000)).toBe("$1.36M");
    expect(formatCompactUSD(3_400_000)).toBe("$3.4M");
    expect(formatCompactUSD(512_000_000)).toBe("$512M");
  });

  it("formats billions", () => {
    expect(formatCompactUSD(1_237_445_056)).toBe("$1.24B");
  });

  it("keeps a leading minus for negatives, never parens", () => {
    expect(formatCompactUSD(-38_500_000)).toBe("-$38.5M");
  });
});

describe("formatSignedCompactUSD", () => {
  it("always signs non-zero values", () => {
    expect(formatSignedCompactUSD(56_667)).toBe("+$56.7K");
    expect(formatSignedCompactUSD(-31_487_262)).toBe("-$31.49M");
    expect(formatSignedCompactUSD(0)).toBe("$0");
  });
});

describe("formatOpenEndedUSD", () => {
  it("appends a trailing +", () => {
    expect(formatOpenEndedUSD(1_237_445_056)).toBe("$1.24B+");
    expect(formatOpenEndedUSD(512_374_100)).toBe("$512.37M+");
  });
});
