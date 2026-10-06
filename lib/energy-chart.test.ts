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
