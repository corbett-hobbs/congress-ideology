import { describe, expect, it } from "vitest";
import { assetBandBounds, filingRange, liabilityBandBounds } from "./wealth-bands";

describe("assetBandBounds / liabilityBandBounds", () => {
  it("gives a closed band its literal edges", () => {
    expect(assetBandBounds("$1,001 - $15,000")).toEqual({
      kind: "closed",
      lo: 1001,
      hi: 15000,
    });
    expect(liabilityBandBounds("$10,001 - $15,000")).toEqual({
      kind: "closed",
      lo: 10001,
      hi: 15000,
    });
  });

  it("treats 'None', '--' and 'Unascertainable' as zero", () => {
    for (const label of [
      "None (or less than $1,001)",
      "--",
      "Unascertainable",
    ]) {
      expect(assetBandBounds(label)).toEqual({ kind: "zero", lo: 0, hi: 0 });
    }
  });

  it("gives the open-ended top band a floor and no ceiling", () => {
    expect(assetBandBounds("Over $50,000,000")).toEqual({
      kind: "open-ended",
      lo: 50_000_001,
      hi: null,
    });
  });

  it("gives the spouse/dependent open-ended band its own floor", () => {
    expect(
      assetBandBounds(
        "Over $1,000,000 and held independently by spouse or dependent child",
      ),
    ).toEqual({ kind: "open-ended", lo: 1_000_001, hi: null });
    expect(
      liabilityBandBounds(
        "Over $1,000,000 (asset held independently by spouse or dependent child)",
      ),
    ).toEqual({ kind: "open-ended", lo: 1_000_001, hi: null });
  });

  it("marks an unrecognized/mangled label unavailable", () => {
    expect(assetBandBounds("$29")).toEqual({
      kind: "unavailable",
      lo: null,
      hi: null,
    });
    expect(assetBandBounds("$1")).toEqual({
      kind: "unavailable",
      lo: null,
      hi: null,
    });
  });
});

describe("filingRange", () => {
  it("computes lo/hi from asset and liability band counts", () => {
    // assets: 4x $1,001-$15,000; liabilities: 1x $250,001-$500,000
    const r = filingRange(
      { "$1,001 - $15,000": 4 },
      { "$250,001 - $500,000": 1 },
    );
    expect(r).toEqual({
      lo: 4 * 1001 - 500000,
      hi: 4 * 15000 - 250001,
      openEnded: false,
      unavailable: false,
    });
  });

  it("is open-ended when an asset band has no ceiling", () => {
    const r = filingRange({ "Over $50,000,000": 1 }, {});
    expect(r.unavailable).toBe(false);
    expect(r.openEnded).toBe(true);
    expect(r.hi).toBeNull();
    expect(r.lo).toBe(50_000_001);
  });

  it("is unavailable when a liability band has no ceiling (can't bound hi)", () => {
    // An open-ended liability caps how low net worth could go (`lo`), but
    // caps `hi` on the wrong side (we'd need the liability's own ceiling,
    // which doesn't exist) — treated as unavailable rather than invented.
    const r = filingRange({ "$1,001 - $15,000": 1 }, { "Over $50,000,000": 1 });
    expect(r.unavailable).toBe(true);
    expect(r.lo).toBeNull();
    expect(r.hi).toBeNull();
  });

  it("is unavailable when any band label is unrecognized", () => {
    const r = filingRange({ "$29": 1, "$1,001 - $15,000": 2 }, {});
    expect(r.unavailable).toBe(true);
    expect(r.lo).toBeNull();
    expect(r.hi).toBeNull();
  });

  it("handles an empty filing (all zero)", () => {
    expect(filingRange({}, {})).toEqual({
      lo: 0,
      hi: 0,
      openEnded: false,
      unavailable: false,
    });
  });
});
