"use client";

import { useMemo, useRef, type PointerEvent } from "react";
import { MapCallouts } from "@/components/charts/MapCallouts";
import { Tooltip, useTooltip } from "@/components/charts/Tooltip";
import { useZoomPan } from "@/components/charts/use-zoom-pan";
import { ZoomControls } from "@/components/charts/ZoomControls";
import { fmtMoney } from "@/lib/trade-chart";
import type { TradePageData } from "@/lib/trade-data";
import { BALANCE_BINS, BALANCE_MIX, TOTAL_BINS, TOTAL_MIX, mapFill, type MapModel, type TradeMeasure } from "@/lib/trade-map";
import type { PartnerChartRow } from "@/lib/trade-partners";

const LAND = "color-mix(in oklab, var(--ink) 7%, var(--surface))";
const mix = (base: string, pct: number) => `color-mix(in oklab, ${base} ${pct}%, var(--surface))`;
/** Solid colours, one per side of zero; never the party reds and blues. */
const TOTAL_BASE = "var(--accent)";
const DEFICIT = "var(--cont-asia)";
const SURPLUS = "var(--cont-oceania)";
const MAX_ZOOM = 8;

/**
 * The partners chart as a map: the same year and partners as the list beside it, drawn as a
 * choropleth of total trade or of the balance (whichever the card's toggle picks). Fixed absolute
 * bins so years compare; the picked country is outlined and the rest dimmed; click picks it.
 */
export function TradeMap({
  map,
  model,
  measure,
  shown,
  country,
  onPickCountry,
  loading,
}: {
  map: TradePageData["worldMap"];
  model: MapModel;
  measure: TradeMeasure;
  shown: number;
  country: string | null;
  onPickCountry: (code: string | null) => void;
  loading: boolean;
}) {
  const tip = useTooltip<{ title: string; row: PartnerChartRow | null }>();
  const svgRef = useRef<SVGSVGElement>(null);
  const zoom = useZoomPan({
    svgRef,
    extent: 1,
    maxK: MAX_ZOOM,
    getPlotBox: () => svgRef.current?.getBoundingClientRect() ?? null,
    onViewChange: tip.hide,
  });
  const { k, cx, cy } = zoom.view;
  const vb = { x: ((cx + 1) / 2) * map.width - map.width / (2 * k), y: ((1 - cy) / 2) * map.height - map.height / (2 * k), w: map.width / k, h: map.height / k };

  const fillOf = (row: PartnerChartRow | undefined) => {
    const f = mapFill(row, measure);
    if (!f.cls) return LAND;
    if (measure === "total") return mix(TOTAL_BASE, TOTAL_MIX[f.cls - 1]);
    return mix(f.side === "deficit" ? DEFICIT : SURPLUS, BALANCE_MIX[f.cls - 1]);
  };

  // The three biggest partners on the chosen measure (total trade, or the size of the balance), named on the map.
  const callouts = useMemo(() => {
    const rows = [...model.byCode.values()];
    const size = (r: PartnerChartRow) => (measure === "total" ? r.exports + r.imports : Math.abs(r.balance));
    return rows
      .sort((a, b) => size(b) - size(a))
      .slice(0, 3)
      .map((r) => ({ key: r.code, text: `${r.name} ${measure === "total" ? fmtMoney(r.exports + r.imports) : fmtMoney(r.balance, { signed: true })}` }));
  }, [model, measure]);
  const ordered = useMemo(
    () => [...map.features.filter((f) => f.key !== country), ...map.features.filter((f) => f.key === country)],
    [map, country],
  );
  const hitFor = (el: Element | null) => {
    const key = el?.closest("[data-k]")?.getAttribute("data-k");
    if (!key) return null;
    const row = model.byCode.get(key) ?? null;
    return { key, title: row?.name ?? map.features.find((f) => f.key === key)?.name ?? key, row };
  };
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const h = hitFor(e.target as Element);
    if (h) tip.show(h, e);
    else tip.hide();
  };
  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const h = hitFor(e.target as Element);
    if (!h || !h.row) return;
    onPickCountry(h.key === country ? null : h.key);
  };

  const legend = measure === "total" ? TOTAL_BINS.labels : BALANCE_BINS.labels;
  const swatch = (side: "deficit" | "surplus" | null, i: number) =>
    measure === "total" ? mix(TOTAL_BASE, TOTAL_MIX[i]) : mix(side === "deficit" ? DEFICIT : SURPLUS, BALANCE_MIX[i]);

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[0.75rem] text-ink-muted">
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-[22px] rounded-[2px] border border-line" style={{ background: LAND }} />
          No trade
        </span>
        {measure === "total" ? (
          legend.map((l, i) => (
            <span key={l} className="inline-flex items-center gap-1.5">
              <i className="inline-block h-2.5 w-[22px] rounded-[2px] border border-line" style={{ background: swatch(null, i) }} />
              {l}
            </span>
          ))
        ) : (
          (["deficit", "surplus"] as const).map((side) => (
            <span key={side} className="inline-flex items-center gap-1.5">
              <span className="capitalize">{side}</span>
              {legend.map((l, i) => (
                <span key={l} className="inline-flex items-center gap-1">
                  <i className="inline-block h-2.5 w-[18px] rounded-[2px] border border-line" style={{ background: swatch(side, i) }} />
                  {i === 0 || i === legend.length - 1 ? l : null}
                </span>
              ))}
            </span>
          ))
        )}
      </div>

      <div className={`relative mt-2 flex flex-1 items-center ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
        <div className="relative w-full">
          <svg
            ref={svgRef}
            viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
            role="img"
            aria-label={`World map of U.S. goods ${measure === "total" ? "total trade" : "trade balance"} by partner, ${shown}. The partner chart and the table carry the same figures.`}
            className="block h-auto w-full"
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
            onClick={onClick}
          >
            {ordered.map((f) => {
              const row = model.byCode.get(f.key);
              const sel = f.key === country;
              return (
                <path
                  key={f.key}
                  data-k={f.key}
                  d={f.d}
                  style={{
                    fill: fillOf(row),
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
        {({ title, row }) => (
          <div className="flex min-w-[9rem] flex-col gap-0.5 text-[0.78rem]">
            <div className="font-medium">{title}, {shown}</div>
            {row ? (
              <>
                <div>Total trade <span className="font-mono">{fmtMoney(row.exports + row.imports)}</span></div>
                <div>Imports <span className="font-mono">{fmtMoney(row.imports)}</span></div>
                <div>Exports <span className="font-mono">{fmtMoney(row.exports)}</span></div>
                <div>Balance <span className="font-mono">{fmtMoney(row.balance, { signed: true })}</span></div>
              </>
            ) : (
              <div className="opacity-75">No goods trade recorded</div>
            )}
          </div>
        )}
      </Tooltip>

    </div>
  );
}
