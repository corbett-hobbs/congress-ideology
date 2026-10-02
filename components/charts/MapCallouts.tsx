"use client";

import { useEffect, useMemo, useState, type RefObject } from "react";

export interface Callout {
  /** The outline's `data-k` (the trade `country_code`). */
  key: string;
  /** "Mexico 87,298". */
  text: string;
}

/** The viewBox currently rendered, in map units. */
export interface MapView {
  x: number;
  y: number;
  w: number;
  h: number;
}

const FONT = 11;
const CHAR_W = 6.3;
const BOX_H = 15;
/** Label offsets from the anchor (px): right, left, then up and down variants, tried in order. */
const OFFSETS: [number, number][] = [
  [26, -16],
  [-26, -16],
  [26, 18],
  [-26, 18],
  [34, 2],
  [-34, 2],
  [18, -34],
  [-18, -34],
];
const HALO = { stroke: "var(--surface)", strokeWidth: 3, paintOrder: "stroke" } as const;

/**
 * Callouts on a choropleth: a dot on the country, a short leader line and a "Name value" label,
 * for the few countries the caller names (top three to five). Drawn inside the map's <svg>, in
 * map units, but sized and placed in screen pixels so they stay legible at every zoom: the text is
 * a constant 11px, a label that would run off the visible map or onto one already placed is tried
 * at another offset and dropped only if none fit, and a country outside the visible window gets none.
 * Anchors are the middle of each outline's largest piece (so the U.S. is not labelled in the Pacific).
 */
export function MapCallouts({ svgRef, entries, view, max = 3 }: { svgRef: RefObject<SVGSVGElement | null>; entries: readonly Callout[]; view: MapView; max?: number }) {
  const [anchors, setAnchors] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const keys = entries.map((e) => e.key).join("|");

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const out = new Map<string, { x: number; y: number }>();
    const tmp = document.createElementNS("http://www.w3.org/2000/svg", "path");
    tmp.setAttribute("visibility", "hidden");
    svg.appendChild(tmp);
    for (const e of entries) {
      const p = svg.querySelector(`path[data-k="${e.key}"]`);
      const d = p?.getAttribute("d");
      if (!d) continue;
      let best: { a: number; x: number; y: number } | null = null;
      for (const sub of d.split(/(?=M)/).filter(Boolean)) {
        tmp.setAttribute("d", sub);
        const b = tmp.getBBox();
        const a = b.width * b.height;
        if (!best || a > best.a) best = { a, x: b.x + b.width / 2, y: b.y + b.height / 2 };
      }
      if (best) out.set(e.key, { x: best.x, y: best.y });
    }
    svg.removeChild(tmp);
    setAnchors(out);
    // Re-measure only when the named countries change; the outlines themselves never move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, svgRef]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const read = () => {
      const r = svg.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(svg);
    return () => ro.disconnect();
  }, [svgRef]);

  const placed = useMemo(() => {
    if (!size.w || !size.h) return [];
    // The map is drawn "meet": the scale is the smaller of the two fits.
    const scale = Math.min(size.w / view.w, size.h / view.h);
    const W = view.w * scale;
    const H = view.h * scale;
    const kept: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const out: { key: string; ax: number; ay: number; lx: number; ly: number; anchor: "start" | "end"; text: string }[] = [];
    for (const e of entries.slice(0, max)) {
      const a = anchors.get(e.key);
      if (!a) continue;
      const ax = (a.x - view.x) * scale;
      const ay = (a.y - view.y) * scale;
      if (ax < 6 || ay < 6 || ax > W - 6 || ay > H - 6) continue;
      const w = e.text.length * CHAR_W + 6;
      for (const [dx, dy] of OFFSETS) {
        const lx = ax + dx;
        const ly = ay + dy;
        const x0 = dx > 0 ? lx : lx - w;
        const box = { x0, y0: ly - BOX_H + 3, x1: x0 + w, y1: ly + 3 };
        if (box.x0 < 0 || box.x1 > W || box.y0 < 0 || box.y1 > H) continue;
        if (kept.some((k) => box.x0 < k.x1 && k.x0 < box.x1 && box.y0 < k.y1 && k.y0 < box.y1)) continue;
        kept.push(box);
        out.push({ key: e.key, ax, ay, lx, ly, anchor: dx > 0 ? "start" : "end", text: e.text });
        break;
      }
    }
    return out.map((o) => ({ ...o, scale }));
  }, [entries, anchors, size, view, max]);

  return (
    <g pointerEvents="none">
      {placed.map((p) => {
        const u = (v: number) => v / p.scale + 0; // px -> map units
        const lx = view.x + u(p.lx);
        const ly = view.y + u(p.ly);
        const ax = view.x + u(p.ax);
        const ay = view.y + u(p.ay);
        return (
          <g key={p.key}>
            <line x1={ax} y1={ay} x2={lx} y2={ly - u(4)} stroke="var(--ink)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <circle cx={ax} cy={ay} r={u(2.6)} fill="var(--ink)" stroke="var(--surface)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <text x={lx + (p.anchor === "start" ? u(3) : -u(3))} y={ly} textAnchor={p.anchor} className="fill-ink font-medium" style={{ ...HALO, fontSize: u(FONT), strokeWidth: u(3) }}>
              {p.text}
            </text>
          </g>
        );
      })}
    </g>
  );
}
