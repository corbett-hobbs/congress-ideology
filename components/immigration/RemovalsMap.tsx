"use client";

import { useMemo, useRef, useState, type PointerEvent } from "react";
import { MapCallouts } from "@/components/charts/MapCallouts";
import { PillGroup } from "@/components/charts/PillGroup";
import { Tooltip, useTooltip } from "@/components/charts/Tooltip";
import { useZoomPan } from "@/components/charts/use-zoom-pan";
import { ZoomControls } from "@/components/charts/ZoomControls";

export interface MapFeature {
  key: string;
  name: string;
  d: string;
}
export interface MapRow {
  key: string;
  name: string;
  removals: number;
}

type Region = "americas" | "world";
/** Base viewBoxes in the world map's 1000 x 446 units. The default frames Latin America (Mexico to Tierra del Fuego), where almost all of the removals go. */
const VIEW: Record<Region, [number, number, number, number]> = {
  americas: [160, 138, 270, 302],
  world: [0, 0, 1000, 446],
};
const LAND = "color-mix(in oklab, var(--ink) 7%, var(--surface))";
const mix = (pct: number) => `color-mix(in oklab, var(--accent) ${pct}%, var(--surface))`;
/** Fixed absolute bins so the years compare while the slider moves. */
const THRESHOLDS = [500, 2_500, 10_000, 40_000];
export const BIN_LABELS = ["<500", "500–2.5k", "2.5k–10k", "10k–40k", "40k+"];
const BIN_MIX = [16, 34, 56, 78, 100];
const classOf = (v: number) => {
  const i = THRESHOLDS.findIndex((t) => v < t);
  return i === -1 ? THRESHOLDS.length + 1 : i + 1;
};
const n = (v: number) => v.toLocaleString("en-US");

/**
 * The country list as a choropleth: ICE removals by country of citizenship for the selected fiscal
 * year, shaded on fixed bins. Defaults to Latin America (Mexico to Tierra del Fuego, where most removals go), with a
 * World toggle; zoom and pan like the other maps. Click a country to pick it (the rest dim).
 */
export function RemovalsMap({
  features,
  rows,
  country,
  onPick,
  fy,
}: {
  features: readonly MapFeature[];
  rows: readonly MapRow[];
  country: string | null;
  onPick: (key: string | null) => void;
  fy: number;
}) {
  const [region, setRegion] = useState<Region>("americas");
  const tip = useTooltip<{ title: string; removals: number | null }>();
  const svgRef = useRef<SVGSVGElement>(null);
  const zoom = useZoomPan({ svgRef, extent: 1, maxK: 8, getPlotBox: () => svgRef.current?.getBoundingClientRect() ?? null, onViewChange: tip.hide });
  const { k, cx, cy } = zoom.view;
  const [bx, by, bw, bh] = VIEW[region];
  const vb = { x: bx + ((cx + 1) / 2) * bw - bw / (2 * k), y: by + ((1 - cy) / 2) * bh - bh / (2 * k), w: bw / k, h: bh / k };
  const callouts = useMemo(() => [...rows].sort((a, b) => b.removals - a.removals).slice(0, 3).map((r) => ({ key: r.key, text: `${r.name} ${n(r.removals)}` })), [rows]);
  const byKey = useMemo(() => new Map(rows.map((r) => [r.key, r])), [rows]);
  const drawn = useMemo(() => new Set(features.map((f) => f.key)), [features]);
  const undrawn = rows.filter((r) => !drawn.has(r.key));
  const ordered = useMemo(() => [...features.filter((f) => f.key !== country), ...features.filter((f) => f.key === country)], [features, country]);

  const hitFor = (el: Element | null) => {
    const key = el?.closest("[data-k]")?.getAttribute("data-k");
    if (!key) return null;
    const row = byKey.get(key);
    return { key, title: row?.name ?? features.find((f) => f.key === key)?.name ?? key, removals: row?.removals ?? null };
  };
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const h = hitFor(e.target as Element);
    if (h) tip.show(h, e);
    else tip.hide();
  };

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-[0.75rem] text-ink-muted">
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2.5 w-[22px] rounded-[2px] border border-line" style={{ background: LAND }} />
            None
          </span>
          {BIN_LABELS.map((l, i) => (
            <span key={l} className="inline-flex items-center gap-1.5">
              <i className="inline-block h-2.5 w-[22px] rounded-[2px] border border-line" style={{ background: mix(BIN_MIX[i]) }} />
              {l}
            </span>
          ))}
        </div>
        <PillGroup<Region>
          ariaLabel="Map region"
          value={region}
          onChange={(r) => {
            setRegion(r);
            zoom.reset();
          }}
          options={[
            { value: "americas", label: "Latin America" },
            { value: "world", label: "World" },
          ]}
        />
      </div>
      <div className="relative mt-2 flex flex-1 items-center justify-center">
        <div className="relative w-full">
          <svg
            ref={svgRef}
            viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
            role="img"
            aria-label={`Map of ICE removals by country of citizenship, FY${fy}. The ranked list and table carry the same figures.`}
            className="mx-auto block h-auto max-h-[30rem] w-full"
            preserveAspectRatio="xMidYMid meet"
            style={{ touchAction: zoom.zoomed ? "none" : "pan-y", cursor: zoom.zoomed ? "grab" : undefined }}
            {...zoom.svgProps}
            onPointerMove={(e) => {
              zoom.svgProps.onPointerMove(e);
              if (e.buttons === 0 || e.pointerType !== "mouse") onMove(e);
              else tip.hide();
            }}
            onPointerDown={(e) => {
              zoom.svgProps.onPointerDown(e);
              onMove(e);
            }}
            onPointerLeave={tip.hide}
            onClick={(e) => {
              const h = hitFor(e.target as Element);
              if (h && h.removals !== null) onPick(h.key === country ? null : h.key);
            }}
          >
            {ordered.map((f) => {
              const row = byKey.get(f.key);
              const sel = f.key === country;
              return (
                <path
                  key={f.key}
                  data-k={f.key}
                  d={f.d}
                  style={{
                    fill: row ? mix(BIN_MIX[classOf(row.removals) - 1]) : LAND,
                    stroke: sel ? "var(--accent)" : "var(--surface)",
                    strokeWidth: sel ? 1.7 : 0.5,
                    vectorEffect: "non-scaling-stroke",
                    opacity: country && !sel ? 0.4 : 1,
                    cursor: row ? "pointer" : "default",
                    transition: "opacity .12s",
                  }}
                />
              );
            })}
            <MapCallouts svgRef={svgRef} entries={callouts} view={vb} />
          </svg>
          <ZoomControls onZoomIn={zoom.zoomIn} onZoomOut={zoom.zoomOut} onReset={zoom.reset} canZoomIn={zoom.canZoomIn} zoomed={zoom.zoomed} />
        </div>
      </div>
      <Tooltip state={tip.state}>
        {({ title, removals }) => (
          <div className="flex min-w-[8rem] flex-col gap-0.5 text-[0.78rem]">
            <div className="font-medium">{title}, FY{fy}</div>
            <div>{removals === null ? <span className="opacity-75">No removals recorded</span> : <>Removals <span className="font-mono">{n(removals)}</span></>}</div>
          </div>
        )}
      </Tooltip>
      {undrawn.length > 0 && (
        <p className="sr-only">{`Not drawn on the map: ${undrawn.map((r) => `${r.name} ${n(r.removals)}`).join(", ")}.`}</p>
      )}
    </div>
  );
}

/** Rows with no outline (ICE categories like Unknown, small or former states): counted for the Data note. */
export function undrawnRemovals(features: readonly MapFeature[], rows: readonly MapRow[]) {
  const drawn = new Set(features.map((f) => f.key));
  const miss = rows.filter((r) => !drawn.has(r.key));
  return { count: miss.length, removals: miss.reduce((a, r) => a + r.removals, 0) };
}
