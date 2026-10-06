import { describe, expect, it } from "vitest";
import { CAPTION_H, PANEL_GAP, panelAtY, stackPanels } from "./energy-chart";

describe("stackPanels", () => {
  it("puts a single panel at the top with no caption", () => {
    const s = stackPanels([{ h: 200, caption: false }], 30);
    expect(s.tops).toEqual([30]);
    expect(s.bottoms).toEqual([230]);
    expect(s.axisY).toBe(230);
    expect(s.captionYs).toEqual([null]);
  });
  it("stacks a second panel under a gap and its caption row", () => {
    const s = stackPanels([{ h: 200, caption: false }, { h: 90, caption: true }], 30);
    expect(s.tops[1]).toBe(230 + PANEL_GAP + CAPTION_H);
    expect(s.captionYs[1]).toBe(230 + PANEL_GAP + CAPTION_H - 4);
    expect(s.axisY).toBe(s.tops[1] + 90);
  });
});

describe("panelAtY", () => {
  it("counts the whole plotted stack (gap included) and a few pixels under it", () => {
    const s = stackPanels([{ h: 100, caption: false }, { h: 50, caption: true }], 20);
    expect(panelAtY(s, 10)).toBe(false);
    expect(panelAtY(s, 125)).toBe(true);
    expect(panelAtY(s, s.axisY + 5)).toBe(true);
    expect(panelAtY(s, s.axisY + 30)).toBe(false);
  });
});

import { placeBandLabels } from "./energy-chart";

const samples = (n: number, thick: (i: number) => number, mid = 100) =>
  Array.from({ length: n }, (_, i) => ({ x: 50 + i * 10, y0: mid + thick(i) / 2, y1: mid - thick(i) / 2 }));

describe("placeBandLabels", () => {
  it("labels a thick band inside, at its thickest stretch, away from the hatched end", () => {
    const m = placeBandLabels([{ key: "coal", width: 40, samples: samples(40, (i) => (i === 20 ? 60 : 30)) }], { maxX: 300, gutterX: 400, useGutter: true });
    const l = m.get("coal")!;
    expect(l.inside).toBe(true);
    expect(l.x).toBeLessThanOrEqual(300 - 20);
  });
  it("sends a band that is never thick enough to the right gutter at its newest midpoint", () => {
    const m = placeBandLabels([{ key: "wind", width: 30, samples: samples(40, () => 6, 80) }], { maxX: 300, gutterX: 400, useGutter: true });
    expect(m.get("wind")).toEqual({ x: 400, y: 80, inside: false });
  });
  it("gives no label when there is no gutter and the band is thin", () => {
    const m = placeBandLabels([{ key: "wind", width: 30, samples: samples(40, () => 6) }], { maxX: 300, gutterX: 400, useGutter: false });
    expect(m.get("wind")).toBeNull();
  });
  it("keeps gutter labels at least `gap` apart", () => {
    const thin = (mid: number) => samples(40, () => 4, mid);
    const m = placeBandLabels(
      [{ key: "a", width: 30, samples: thin(100) }, { key: "b", width: 30, samples: thin(103) }, { key: "c", width: 30, samples: thin(106) }],
      { maxX: 300, gutterX: 400, useGutter: true, gap: 12 },
    );
    const ys = ["a", "b", "c"].map((k) => m.get(k)!.y);
    expect(ys[1] - ys[0]).toBeGreaterThanOrEqual(12);
    expect(ys[2] - ys[1]).toBeGreaterThanOrEqual(12);
  });
});
