"use client";

import { memo, useMemo, useRef, useState, type PointerEvent } from "react";
import { MethodologyNote } from "@/components/MethodologyNote";
import { PillGroup } from "@/components/charts/PillGroup";
import { TABLE_TOGGLE } from "@/components/charts/table-toggle";
import { Tooltip, useTooltip } from "@/components/charts/Tooltip";
import { useZoomPan } from "@/components/charts/use-zoom-pan";
import { ZoomControls } from "@/components/charts/ZoomControls";
import { MONTH_NAMES } from "@/lib/indicator-time";
import { fmtMoney } from "@/lib/trade-chart";
import type { TradePageData } from "@/lib/trade-data";
import { BALANCE_BINS, BALANCE_MIX, TOTAL_BINS, TOTAL_MIX, buildMapModel, mapFill, type TradeMeasure } from "@/lib/trade-map";
import type { PartnerChartRow } from "@/lib/trade-partners";
import type { TradeYearPayload } from "@/lib/trade-types";

const LAND = "color-mix(in oklab, var(--ink) 7%, var(--surface))";
const mix = (base: string, pct: number) => `color-mix(in oklab, ${base} ${pct}%, var(--surface))`;
/** Solid colours, one per side of zero; never the party reds and blues. */
const TOTAL_BASE = "var(--accent)";
const DEFICIT = "var(--cont-asia)";
const SURPLUS = "var(--cont-oceania)";
const MAX_ZOOM = 8;

const DataTable = memo(function DataTable({ rows, year }: { rows: PartnerChartRow[]; year: number }) {
  return (
    <details className="mt-3">
      <summary className={TABLE_TOGGLE}>View as table</summary>
      <p className="m-0 mt-1.5 text-[0.75rem] text-ink-muted">Partner, total trade and balance for {year}, for screen readers and copying.</p>
      <div className="mt-2 max-h-72 overflow-auto">
        <table className="w-full border-collapse text-left text-[0.75rem] tabular-nums">
          <caption className="sr-only">{`U.S. goods trade with each partner, ${year}`}</caption>
          <thead className="sticky top-0 bg-surface-raised">
            <tr className="font-mono text-[0.65rem] uppercase tracking-[0.05em] text-ink-muted">
              <th scope="col" className="px-2 py-1.5">Partner</th>
              <th scope="col" className="px-2 py-1.5">Total trade</th>
              <th scope="col" className="px-2 py-1.5">Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code} className="border-t border-line">
                <th scope="row" className="px-2 py-1 font-normal">{r.name}</th>
                <td className="px-2 py-1">{fmtMoney(r.exports + r.imports)}</td>
                <td className="px-2 py-1">{fmtMoney(r.balance, { signed: true })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
});

/**
 * The partners chart as a map: the same year, the same partners, drawn as a choropleth of total
 * trade or of the balance. Fixed absolute bins so the years compare; the picked country is
 * outlined and the rest dimmed; click a country to pick it in the filter bar.
 */
export function TradeMapCard({
  map,
  payload,
  year,
  lastPeriod,
  country,
  onPickCountry,
  loading,
}: {
  map: TradePageData["worldMap"];
  payload: TradeYearPayload | null;
  year: number;
  lastPeriod: string;
  country: string | null;
  onPickCountry: (code: string | null) => void;
  loading: boolean;
}) {
  const [measure, setMeasure] = useState<TradeMeasure>("total");
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
  const shown = payload?.year ?? year;
  const outlineKeys = useMemo(() => new Set(map.features.map((f) => f.key)), [map]);
  const model = useMemo(() => buildMapModel(payload?.partners ?? [], outlineKeys), [payload, outlineKeys]);
  const rows = useMemo(() => [...model.byCode.values()], [model]);
  const partial = shown === Number(lastPeriod.slice(0, 4)) && lastPeriod.slice(5) !== "12";
  const through = MONTH_NAMES[Number(lastPeriod.slice(5)) - 1];

  const fillOf = (row: PartnerChartRow | undefined) => {
    const f = mapFill(row, measure);
    if (!f.cls) return LAND;
    if (measure === "total") return mix(TOTAL_BASE, TOTAL_MIX[f.cls - 1]);
    return mix(f.side === "deficit" ? DEFICIT : SURPLUS, BALANCE_MIX[f.cls - 1]);
  };

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
    <section className="flex h-full min-w-0 flex-col rounded-[10px] border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="m-0 font-serif text-[1.6rem] font-medium leading-tight">Trade on the map, {shown}{partial ? " so far" : ""}</h2>
        <PillGroup<TradeMeasure>
          ariaLabel="Map measure"
          value={measure}
          onChange={setMeasure}
          options={[
            { value: "total", label: "Total trade" },
            { value: "balance", label: "Balance" },
          ]}
        />
      </div>
      <p className="m-0 mt-3 text-[0.875rem] leading-[1.5] text-ink-muted">
        {measure === "total" ? (
          <>Imports plus exports of goods with each partner, the same year as the partner chart.</>
        ) : (
          <>Exports minus imports with each partner: orange where the U.S. runs a deficit, teal where it runs a surplus.</>
        )}
        {partial ? ` ${shown} covers January to ${through}.` : ""}
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[0.75rem] text-ink-muted">
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
            viewBox={`${((cx + 1) / 2) * map.width - map.width / (2 * k)} ${((1 - cy) / 2) * map.height - map.height / (2 * k)} ${map.width / k} ${map.height / k}`}
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

      <MethodologyNote>
        <p>
          Census Bureau goods trade, Census basis, on fixed bins so the years compare. The year follows the partner chart beside it. Click a country to pick it above; drag to pan and use the + and − buttons to zoom.
          {model.undrawn.length > 0
            ? ` Not drawn: ${model.undrawn.length} small partners with no outline on the map (${fmtMoney(model.undrawn.reduce((a, r) => a + r.exports + r.imports, 0))} of ${fmtMoney(model.totals.total)} total trade); they are in the partner chart and the table.`
            : ""}
        </p>
      </MethodologyNote>
      {rows.length > 0 && <DataTable rows={rows} year={shown} />}
    </section>
  );
}
