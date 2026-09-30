import { describe, expect, it } from "vitest";
import { layoutSwarm, packLabels, rowCount } from "./justice-swarm-layout";

describe("layoutSwarm", () => {
  const items = Array.from({ length: 40 }, (_, i) => ({ id: i, x: 100 + (i % 7) * 2, r: 5 }));
  const { dots, halfHeight } = layoutSwarm(items);

  it("keeps every dot at its true x", () => {
    dots.forEach((d, i) => expect(d.x).toBe(items[i].x));
  });
  it("leaves no two dots overlapping", () => {
    for (let i = 0; i < dots.length; i++)
      for (let j = i + 1; j < dots.length; j++) {
        const d = Math.hypot(dots[i].x - dots[j].x, dots[i].y - dots[j].y);
        expect(d).toBeGreaterThanOrEqual(10);
      }
  });
  it("reports a half-height that contains every dot", () => {
    for (const d of dots) expect(Math.abs(d.y) + 5).toBeLessThanOrEqual(halfHeight + 1e-9);
  });
  it("is deterministic", () => {
    expect(layoutSwarm(items).dots).toEqual(dots);
  });
});

describe("packLabels", () => {
  it("uses one row for a lone label and stacks overlapping ones", () => {
    expect(rowCount(packLabels([{ id: 1, x: 50, width: 60 }], 300))).toBe(1);
    const out = packLabels(
      [
        { id: 1, x: 100, width: 70 },
        { id: 2, x: 110, width: 70 },
        { id: 3, x: 250, width: 70 },
      ],
      400,
    );
    expect(out.find((o) => o.id === 1)!.row).toBe(0);
    expect(out.find((o) => o.id === 2)!.row).toBe(1);
    expect(out.find((o) => o.id === 3)!.row).toBe(0);
  });
  it("clamps labels inside the width", () => {
    const [a] = packLabels([{ id: 1, x: 2, width: 80 }], 300);
    expect(a.left).toBe(0);
    const [b] = packLabels([{ id: 1, x: 299, width: 80 }], 300);
    expect(b.left).toBe(220);
  });
  it("never overlaps labels in the same row", () => {
    const labels = Array.from({ length: 12 }, (_, i) => ({ id: i, x: 20 + i * 18, width: 62 }));
    const out = packLabels(labels, 400);
    for (const a of out) for (const b of out) {
      if (a.id >= b.id || a.row !== b.row) continue;
      const wa = labels[a.id].width, wb = labels[b.id].width;
      expect(a.left + wa <= b.left || b.left + wb <= a.left).toBe(true);
    }
  });
});
