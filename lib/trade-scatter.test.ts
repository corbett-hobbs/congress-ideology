import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dutiesByCountryRow } from "./trade-entities";
import { buildCountryPayload } from "./trade-payload";
import { buildScatterRows, fmtPct, fmtPp, placeLabels, scatterAxes, scatterWindows, toDot, Y_CAP_PCT, type ScatterInput, type ScatterRow } from "./trade-scatter";
import { monthIndex } from "./trade-derive";

const arr = (n: number, f: (i: number) => number | null) => Array.from({ length: n }, (_, i) => f(i));
const N = monthIndex("2026-07") + 1;
const at = (pairs: Record<string, number | null>) => arr(N, (i) => {
  for (const [p, v] of Object.entries(pairs)) if (monthIndex(p) === i) return v;
  return null;
});
/** One value per month across both windows. */
function months(from: string, to: string, v: number | null): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (let i = monthIndex(from); i <= monthIndex(to); i++) out[`${1991 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`] = v;
  return out;
}

describe("scatterWindows", () => {
  it("uses the last 6 published months against the same calendar months of 2024", () => {
    expect(scatterWindows("2026-07")).toEqual({ baseline: { from: "2024-02", to: "2024-07" }, latest: { from: "2026-02", to: "2026-07" }, months: 6 });
  });
  it("handles a window that spans New Year", () => {
    const w = scatterWindows("2026-02");
    expect(w.latest).toEqual({ from: "2025-09", to: "2026-02" });
    expect(w.baseline).toEqual({ from: "2023-09", to: "2024-02" });
  });
});

describe("buildScatterRows", () => {
  const w = scatterWindows("2026-07");
  const mk = (code: string, d: Record<string, number | null>, v: Record<string, number | null>): ScatterInput => ({ code, name: code, duties: at(d), imports: at(v) });
  const base = months("2024-02", "2024-07", 100);
  const lat = months("2026-02", "2026-07", 200);
  it("computes rate change in points and imports change as a fraction, weighting by imports", () => {
    const r = buildScatterRows([mk("AAA", { ...months("2024-02", "2024-07", 5), ...months("2026-02", "2026-07", 40) }, { ...base, ...lat })], w)[0];
    expect(r.baseRate).toBeCloseTo(0.05, 10);
    expect(r.latestRate).toBeCloseTo(0.2, 10);
    expect(r.rateChangePp).toBeCloseTo(15, 8);
    expect(r.importsChange).toBeCloseTo(1, 10);
    expect(r.plotted).toBe(true);
  });
  it("does not plot a country with a missing month in either window (months covered are reported)", () => {
    const d = { ...months("2024-02", "2024-07", 5), ...months("2026-02", "2026-07", 40), "2026-04": null };
    const r = buildScatterRows([mk("BBB", d, { ...base, ...lat, "2026-04": null })], w)[0];
    expect(r.months).toEqual([6, 5]);
    expect(r.plotted).toBe(false);
    expect(r.rateChangePp).toBeNull();
  });
  it("does not plot a country with no baseline imports; a collapse to zero has no rate so it is not plotted either", () => {
    const none = buildScatterRows([mk("CCC", { ...months("2026-02", "2026-07", 4) }, { ...months("2026-02", "2026-07", 100), ...months("2024-02", "2024-07", 0) })], w)[0];
    expect(none.importsChange).toBeNull();
    const gone = buildScatterRows([mk("DDD", { ...months("2024-02", "2024-07", 5), ...months("2026-02", "2026-07", 0) }, { ...base, ...months("2026-02", "2026-07", 0) })], w)[0];
    expect(gone.importsChange).toBeCloseTo(-1, 10);
    expect(gone.plotted).toBe(false);
  });
});

describe("axes and pinning", () => {
  const row = (x: number | null, y: number | null): ScatterRow => ({ code: "X", name: "X", baseRate: 0, latestRate: 0, rateChangePp: x, baseImports: 1, latestImports: 1, importsChange: y, months: [6, 6], plotted: x !== null && y !== null });
  it("covers the data to the next 5 and never shrinks below -5..15", () => {
    expect(scatterAxes([row(1, 0)])).toMatchObject({ xMin: -5, xMax: 15 });
    expect(scatterAxes([row(-12, 0), row(33.8, 0)])).toMatchObject({ xMin: -15, xMax: 35 });
  });
  it("pins an outlier to the edge but keeps its true value findable", () => {
    const axes = scatterAxes([row(1, 0)]);
    const d = toDot(row(2, 213.27), axes)!;
    expect(d.pinned).toBe("top");
    expect(d.yPct).toBe(Y_CAP_PCT);
    expect(toDot(row(2, 0.5), axes)!.pinned).toBeNull();
    expect(toDot(row(null, 1), axes)).toBeNull();
  });
});

describe("placeLabels", () => {
  it("keeps priority order, drops overlaps and anything off the plot", () => {
    const b = (id: string, x: number, y: number) => ({ id, x, y, width: 50, height: 12 });
    const kept = placeLabels([b("a", 10, 10), b("b", 30, 14), b("c", 100, 10), b("d", 380, 10)], 400, 300).map((l) => l.id);
    expect(kept).toEqual(["a", "c"]);
  });
});

describe("formatting", () => {
  it("uses a true minus", () => {
    expect(fmtPct(-35)).toBe("−35%");
    expect(fmtPct(21326.8)).toBe("+21,327%");
    expect(fmtPp(11.84)).toBe("+11.8 pp");
    expect(fmtPp(-0.9)).toBe("−0.9 pp");
  });
});

describe("real data (committed pipeline output)", () => {
  const O = "pipeline/output/";
  const duties = readdirSync(`${O}duties_by_country`).flatMap((f) => (JSON.parse(readFileSync(`${O}duties_by_country/${f}`, "utf8")) as unknown[]).map((r) => dutiesByCountryRow.parse(r)));
  const nat = JSON.parse(readFileSync(`${O}duties_national.json`, "utf8")) as { period: string }[];
  const w = scatterWindows(nat[nat.length - 1].period);
  const codes = [...new Set(duties.map((d) => d.country_code))];
  const len = monthIndex(nat[nat.length - 1].period) + 1;
  const rows = buildScatterRows(
    codes.map((c) => {
      const p = buildCountryPayload({ country_code: c, name: c }, [], duties.filter((d) => d.country_code === c), len);
      return { code: c, name: c, duties: p.duties, imports: p.dutyImports };
    }),
    w,
  );
  it("plots most countries and China's rate rose while its imports fell", () => {
    expect(rows.filter((r) => r.plotted).length).toBeGreaterThan(200);
    const chn = rows.find((r) => r.code === "CHN")!;
    expect(chn.rateChangePp!).toBeGreaterThan(5);
    expect(chn.importsChange!).toBeLessThan(0);
  });
});
