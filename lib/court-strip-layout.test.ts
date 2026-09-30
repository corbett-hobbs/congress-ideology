import { describe, expect, it } from "vitest";
import { loadRealCourt } from "./court-test-data";
import {
  auditLayout,
  layoutStrip,
  STRIP_GEOMETRY,
  type Box,
} from "./court-strip-layout";
import { isSeated, scoreAt } from "./court-types";

const c = loadRealCourt();
/** Conservative IBM Plex Sans 12.5px estimate (real text measures narrower). */
const textWidth = (s: string) => s.length * 7.0;
const STRIP = STRIP_GEOMETRY;

function run(width: number, term: number) {
  const L = STRIP.padX;
  const R = STRIP.padX;
  const [d0, d1] = c.domain;
  const x = (v: number) => L + ((v - d0) / (d1 - d0)) * (width - L - R);
  const medianX = x(c.terms[term - c.firstTerm].median);
  const fixed: Box[] = [
    { x0: medianX - 26, x1: medianX + 26, y0: 0, y1: 16 },
    { x0: L, x1: L + 76, y0: STRIP.height - 19, y1: STRIP.height },
    { x0: width - R - 108, x1: width - R, y0: STRIP.height - 19, y1: STRIP.height },
  ];
  const items = c.justices
    .filter((j) => isSeated(j, term))
    .map((j) => ({ id: j.id, x: x(scoreAt(j, term)), label: j.short }));
  const params = { width, ...STRIP, medianX, fixed, textWidth };
  return { layout: layoutStrip(items, params), params };
}

describe("strip layout over every term", () => {
  for (const width of [300, 320, 350, 420, 560, 620]) {
    it(`has no collisions or clipping at ${width}px`, () => {
      const bad: string[] = [];
      for (let t = c.firstTerm; t <= c.lastTerm; t++) {
        const { layout, params } = run(width, t);
        const a = auditLayout(layout, params);
        if (Object.values(a).some((n) => n > 0)) bad.push(`${t}:${JSON.stringify(a)}`);
      }
      expect(bad).toEqual([]);
    });
  }

  it("is deterministic", () => {
    expect(run(560, 2023).layout).toEqual(run(560, 2023).layout);
  });

  it("keeps every dot at its true x", () => {
    const { layout } = run(560, 2023);
    const j = c.justices.find((j) => j.short === "Thomas")!;
    const [d0, d1] = c.domain;
    const want = 28 + ((scoreAt(j, 2023) - d0) / (d1 - d0)) * (560 - 56);
    expect(layout.dots.find((d) => d.id === j.id)?.cx).toBeCloseTo(want, 6);
  });
});
