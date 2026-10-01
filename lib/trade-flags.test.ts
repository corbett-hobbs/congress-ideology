import { describe, expect, it } from "vitest";
import { dayOf } from "./indicator-time";
import { lanesUsed, placeFlags, rangeText, type FlagInput, type PlaceOptions } from "./trade-flags";

const SPAN = dayOf(2026, 7, 1);
const PLOT_LEFT = 58;
const PLOT_RIGHT = 1130;
const X = (day: number) => PLOT_LEFT + (day / SPAN) * (PLOT_RIGHT - PLOT_LEFT);
const opts = (over: Partial<PlaceOptions> = {}): PlaceOptions => ({ X, viewStart: 0, viewEnd: SPAN, span: SPAN, plotLeft: PLOT_LEFT, plotRight: PLOT_RIGHT, labels: true, ...over });
const f = (id: string, y: number, m: number, d: number, label: string, priority: 1 | 2 = 1): FlagInput => ({ id, day: dayOf(y, m - 1, d), label, priority, dateText: `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${d}, ${y}` });

const FEB20 = f("court", 2026, 2, 20, "Supreme Court: IEEPA does not authorize tariffs", 2);
const FEB24 = f("cutover", 2026, 2, 24, "IEEPA tariffs end; temporary 10% §122 tariff begins", 1);

describe("grouping", () => {
  it("merges flags a few pixels apart into one, led by the highest priority, with a date range", () => {
    const out = placeFlags([FEB20, FEB24], opts());
    expect(out).toHaveLength(1);
    expect(out[0].ids).toEqual(["court", "cutover"]);
    expect(out[0].text).toBe("Feb 20–24, 2026 · IEEPA tariffs end; temporary 10% §122 tariff begins");
    expect(out[0].priority).toBe(1);
  });
  it("flags months apart that land close on a wide timeline show the lead's own date plus a count, not a misleading range", () => {
    const out = placeFlags([f("x", 2025, 3, 12, "Steel tariffs widen", 2), f("y", 2025, 4, 5, "10% baseline begins", 1)], opts({ groupPx: 40 }));
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe("Apr 5, 2025 · 10% baseline begins (+1 more)");
  });
  it("keeps flags that are far apart separate", () => {
    expect(placeFlags([f("a", 2018, 7, 6, "A"), f("b", 2025, 4, 5, "B")], opts())).toHaveLength(2);
  });
  it("range text handles months and years", () => {
    expect(rangeText("Feb 20, 2026", "Feb 24, 2026")).toBe("Feb 20–24, 2026");
    expect(rangeText("Jan 30, 2026", "Feb 2, 2026")).toBe("Jan 30–Feb 2, 2026");
    expect(rangeText("Dec 30, 2025", "Jan 2, 2026")).toBe("Dec 30, 2025–Jan 2, 2026");
  });
});

describe("right edge", () => {
  it("anchors a label that would pass the plot edge to the left of its flag line", () => {
    const [p] = placeFlags([f("late", 2026, 6, 20, "A fairly long event label for the edge")], opts());
    expect(p.anchor).toBe("end");
    expect(p.x1).toBeLessThanOrEqual(PLOT_RIGHT + 1);
  });
  it("shows a flag dated after the axis end, pinned to the right edge", () => {
    const [p] = placeFlags([f("past", 2026, 8, 22, "Canada section 338 duties begin")], opts());
    expect(p.pastEnd).toBe(true);
    expect(p.x).toBe(PLOT_RIGHT);
    expect(p.anchor).toBe("end");
  });
  it("hides a past-end flag when the window does not reach the end of the axis", () => {
    expect(placeFlags([f("past", 2026, 8, 22, "x")], opts({ viewEnd: dayOf(2020, 0, 1) }))).toHaveLength(0);
  });
});

describe("stacking and priority", () => {
  const close = [f("a", 2025, 4, 5, "Ten percent baseline begins on that date"), f("b", 2025, 8, 7, "Country specific rates take effect"), f("c", 2026, 2, 24, "IEEPA tariffs end; temporary 10% §122 tariff begins")];
  it("stacks overlapping labels into lanes", () => {
    const out = placeFlags(close, opts());
    expect(out).toHaveLength(3);
    expect(new Set(out.map((p) => p.lane)).size).toBeGreaterThan(1);
    for (const l of [0, 1, 2]) {
      const row = out.filter((p) => p.lane === l).sort((a, b) => a.x0 - b.x0);
      for (let i = 1; i < row.length; i++) expect(row[i].x0).toBeGreaterThanOrEqual(row[i - 1].x1);
    }
  });
  it("never lets two labels in a lane overlap, even with many flags", () => {
    const many = Array.from({ length: 12 }, (_, i) => f(`p${i}`, 2018 + Math.floor(i / 2), 1 + (i % 2) * 6, 10, `Event number ${i} with a label`, i % 3 === 0 ? 1 : 2));
    const out = placeFlags(many, opts());
    for (let l = 0; l < 6; l++) {
      const row = out.filter((p) => p.lane === l).sort((a, b) => a.x0 - b.x0);
      for (let i = 1; i < row.length; i++) expect(row[i].x0).toBeGreaterThanOrEqual(row[i - 1].x1);
    }
  });
  it("drops priority-2 flags before priority-1 ones when lanes are full, and still shows every priority-1", () => {
    const p1 = Array.from({ length: 4 }, (_, i) => f(`one${i}`, 2024, 1 + i, 1, "Priority one event label here", 1));
    const p2 = Array.from({ length: 6 }, (_, i) => f(`two${i}`, 2024, 1 + i, 15, "Priority two event label here", 2));
    const out = placeFlags([...p1, ...p2], opts({ viewStart: dayOf(2024, 0, 1), viewEnd: dayOf(2024, 7, 1), X: (d) => PLOT_LEFT + ((d - dayOf(2024, 0, 1)) / (dayOf(2024, 7, 1) - dayOf(2024, 0, 1))) * (PLOT_RIGHT - PLOT_LEFT), lanes: 1, extraLanes: 3 }));
    expect(out.filter((p) => p.priority === 1).flatMap((p) => p.ids).sort()).toEqual(["one0", "one1", "one2", "one3"]);
    expect(lanesUsed(out)).toBeGreaterThanOrEqual(1);
  });
  it("a zoomed-in window has room for priority-2 flags that a full view drops", () => {
    const flags = [f("p1", 2018, 7, 6, "China §301 begins", 1), f("p2", 2019, 1, 10, "Rate rises", 2)];
    const full = placeFlags(flags, opts({ lanes: 1, extraLanes: 0 }));
    const v0 = dayOf(2018, 0, 1), v1 = dayOf(2020, 0, 1);
    const zoom = placeFlags(flags, opts({ lanes: 1, extraLanes: 0, viewStart: v0, viewEnd: v1, X: (d) => PLOT_LEFT + ((d - v0) / (v1 - v0)) * (PLOT_RIGHT - PLOT_LEFT) }));
    expect(zoom.length).toBeGreaterThan(full.length);
  });
});

describe("compact mode", () => {
  it("returns numbered markers in date order with no label text", () => {
    const out = placeFlags([f("b", 2025, 4, 5, "B"), f("a", 2018, 7, 6, "A")], opts({ labels: false }));
    expect(out.map((p) => p.number)).toEqual([1, 2]);
    expect(out.every((p) => p.text === "")).toBe(true);
    expect(out[0].ids).toEqual(["a"]);
  });
});
