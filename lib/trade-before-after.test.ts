import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dutiesByCountryRow } from "./trade-entities";
import { buildCountryPayload } from "./trade-payload";
import { monthIndex } from "./trade-derive";
import { beforeAfterWindows, buildBeforeAfter, rateAxis, sortBeforeAfter, WINDOW_MONTHS, type BeforeAfterInput } from "./trade-before-after";

describe("beforeAfterWindows", () => {
  it("takes five full months each side and leaves out the month that contains the date", () => {
    const w = beforeAfterWindows("2026-02-24", "2026-07");
    expect(WINDOW_MONTHS).toBe(5);
    expect(w.before).toEqual({ from: "2025-09", to: "2026-01" });
    expect(w.after).toEqual({ from: "2026-03", to: "2026-07" });
    expect([w.beforeMonths, w.afterMonths]).toEqual([5, 5]);
  });
  it("a date on the 1st has no transition month", () => {
    const w = beforeAfterWindows("2026-03-01", "2026-08");
    expect(w.before).toEqual({ from: "2025-10", to: "2026-02" });
    expect(w.after).toEqual({ from: "2026-03", to: "2026-07" });
  });
  it("cuts the after-window short when the data ends first, and reports it", () => {
    const w = beforeAfterWindows("2026-02-24", "2026-05");
    expect(w.after).toEqual({ from: "2026-03", to: "2026-05" });
    expect(w.afterMonths).toBe(3);
    expect(w.requested).toBe(5);
  });
  it("has no after-window when no full month follows yet", () => {
    expect(beforeAfterWindows("2026-02-24", "2026-02").after).toBeNull();
  });
});

describe("buildBeforeAfter", () => {
  const N = monthIndex("2026-07") + 1;
  const w = beforeAfterWindows("2026-02-24", "2026-07");
  const series = (f: (i: number) => number | null) => Array.from({ length: N }, (_, i) => f(i));
  const inRange = (i: number, from: string, to: string) => i >= monthIndex(from) && i <= monthIndex(to);
  const mk = (code: string, beforeRate: number | null, afterRate: number | null, missing?: string): BeforeAfterInput => ({
    code,
    name: code,
    imports: series((i) => (i === monthIndex(missing ?? "1900-01") ? null : inRange(i, "2025-09", "2026-07") ? 100 : null)),
    duties: series((i) => (i === monthIndex(missing ?? "1900-01") ? null : inRange(i, "2025-09", "2026-01") ? (beforeRate === null ? null : beforeRate * 100) : inRange(i, "2026-03", "2026-07") ? (afterRate === null ? null : afterRate * 100) : null)),
  });
  it("computes the change in percentage points", () => {
    const [r] = buildBeforeAfter([mk("CHN", 0.3, 0.2)], w);
    expect(r.before).toBeCloseTo(0.3, 10);
    expect(r.after).toBeCloseTo(0.2, 10);
    expect(r.changePp).toBeCloseTo(-10, 8);
    expect(r.plotted).toBe(true);
  });
  it("does not plot a country missing a month in either window; months covered are reported", () => {
    const [r] = buildBeforeAfter([mk("VNM", 0.1, 0.2, "2026-05")], w);
    expect(r.months).toEqual([5, 4]);
    expect(r.plotted).toBe(false);
    expect(r.changePp).toBeNull();
  });
  it("does not plot anything when there is no after-window", () => {
    const [r] = buildBeforeAfter([mk("CAN", 0.1, 0.1)], beforeAfterWindows("2026-02-24", "2026-02"));
    expect(r.plotted).toBe(false);
  });
});

describe("sortBeforeAfter", () => {
  const row = (name: string, pp: number | null) => ({ code: name, name, before: 0.1, after: 0.1, changePp: pp, imports: [1e9, 1e9] as [number, number], months: [5, 5] as [number, number], plotted: pp !== null, material: pp !== null });
  const rows = [row("A", 3), row("B", -8), row("C", 0.5), row("D", null), row("E", -3)];
  const names = (r: { name: string }[]) => r.map((x) => x.name);
  it("biggest change ranks by absolute size, either direction; unplottable rows last", () => {
    expect(names(sortBeforeAfter(rows, { key: "change", reversed: false }))).toEqual(["B", "A", "E", "C", "D"]);
  });
  it("reverses without moving the unplottable rows up", () => {
    expect(names(sortBeforeAfter(rows, { key: "change", reversed: true }))).toEqual(["C", "E", "A", "B", "D"]);
  });
  it("A-Z and its reverse", () => {
    expect(names(sortBeforeAfter(rows, { key: "alpha", reversed: false }))).toEqual(["A", "B", "C", "E", "D"]);
    expect(names(sortBeforeAfter(rows, { key: "alpha", reversed: true }))).toEqual(["E", "C", "B", "A", "D"]);
  });
  it("breaks ties by name", () => {
    expect(names(sortBeforeAfter([row("Z", 2), row("M", -2)], { key: "change", reversed: false }))).toEqual(["M", "Z"]);
  });
});

describe("materiality", () => {
  const w = beforeAfterWindows("2026-02-24", "2026-07");
  const N = monthIndex("2026-07") + 1;
  const flat = (imp: number) => ({ code: "X", name: "X", imports: Array.from({ length: N }, () => imp), duties: Array.from({ length: N }, () => imp * 0.1) });
  it("small partners are plotted-able but not drawn; large ones are", () => {
    const [small] = buildBeforeAfter([flat(1_000_000)], w);
    const [big] = buildBeforeAfter([flat(200_000_000)], w);
    expect(small.plotted).toBe(true);
    expect(small.material).toBe(false);
    expect(big.material).toBe(true);
  });
});

describe("rateAxis", () => {
  it("starts at 0 with round ticks covering the largest rate", () => {
    const a = rateAxis([{ code: "X", name: "X", before: 0.31, after: 0.12, changePp: -19, imports: [1e9, 1e9], months: [5, 5], plotted: true, material: true }]);
    expect(a.ticks[0]).toBe(0);
    expect(a.max).toBeGreaterThanOrEqual(31);
    expect(a.ticks.length).toBeLessThanOrEqual(7);
  });
  it("handles no data", () => expect(rateAxis([]).ticks).toEqual([0, 1]));
});

describe("real data", () => {
  const O = "pipeline/output/";
  const duties = readdirSync(`${O}duties_by_country`).flatMap((f) => (JSON.parse(readFileSync(`${O}duties_by_country/${f}`, "utf8")) as unknown[]).map((r) => dutiesByCountryRow.parse(r)));
  const nat = JSON.parse(readFileSync(`${O}duties_national.json`, "utf8")) as { period: string }[];
  const last = nat[nat.length - 1].period;
  const len = monthIndex(last) + 1;
  const codes = [...new Set(duties.map((d) => d.country_code))];
  const rows = buildBeforeAfter(codes.map((c) => {
    const p = buildCountryPayload({ country_code: c, name: c }, [], duties.filter((d) => d.country_code === c), len);
    return { code: c, name: c, duties: p.duties, imports: p.dutyImports };
  }), beforeAfterWindows("2026-02-24", last));
  it("plots most countries; China's average rate fell after IEEPA tariffs ended", () => {
    expect(rows.filter((r) => r.plotted).length).toBeGreaterThan(200);
    expect(rows.find((r) => r.code === "CHN")!.changePp!).toBeLessThan(0);
  });
});
