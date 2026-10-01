"use client";

import { memo, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { line } from "d3-shape";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { Tooltip, useTooltip } from "@/components/charts/Tooltip";
import { useElementWidth } from "@/lib/use-element-width";
import { dayOf } from "@/lib/indicator-time";
import { dayFromFraction } from "@/lib/indicator-lookup";
import { fmtMoney, fmtTick, monthMidDay, plotted, readingAtDay, termAtDay, termLabel, type FlowSeries, type Measure, type Scale } from "@/lib/trade-chart";
import { activeDay, useTradeActions, useTradeValues } from "./TradeState";
import { BAND_H, PresidentAndCongress, RecessionLabels, RecessionShading, ROW_H, YearAxis, type Era } from "./EraLayers";

export type { Era };

interface Props {
  series: FlowSeries;
  measure: Measure;
  scale: Scale;
  era: Era;
  showCong: boolean;
  /** Visible window `[start, end)` in axis days. */
  view: readonly [number, number];
  /** The slider year, marked lightly on the plot. */
  year: number;
  ariaLabel: string;
}


function geometry(W: number, view: readonly [number, number], scale: Scale, showCong: boolean) {
  const ml = 58;
  const mr = 12;
  const mt = 14;
  const H = W < 600 ? 190 : 230;
  const pw = W - ml - mr;
  const axisY = mt + H;
  const bandY = axisY + 23;
  const houseY = bandY + BAND_H + 3;
  const senateY = houseY + ROW_H + 2;
  return {
    ml, mr, mt, H, pw, axisY, bandY, houseY, senateY,
    height: (showCong ? senateY + ROW_H : bandY + BAND_H) + 8,
    X: (day: number) => ml + ((day - view[0]) / (view[1] - view[0])) * pw,
    Y: (v: number) => mt + ((scale.hi - v) / (scale.hi - scale.lo)) * H,
  };
}

interface StaticProps extends Props {
  W: number;
}

/** Everything that doesn't change with the hovered date; memoized so a hover frame doesn't rebuild the paths. */
const StaticLayer = memo(function StaticLayer({ series, measure, scale, era, showCong, view, year, W }: StaticProps) {
  const [vs, ve] = view;
  const g = geometry(W, view, scale, showCong);
  const { ml, mt, H, pw, axisY, bandY, houseY, senateY, X, Y } = g;
  const clipped = (a: number, b: number): [number, number] => [X(Math.max(vs, a)), X(Math.min(ve, b))];
  const visibleSpan = (a: number, b: number) => b > vs && a < ve;
  const { main, second } = plotted(series, measure);
  const clipId = "clip-trade-balance";
  const pts = (vals: readonly (number | null)[]) => vals.map((v, i) => ({ day: monthMidDay(i), value: v }));
  const gen = line<{ day: number; value: number | null }>()
    .defined((p) => p.value !== null)
    .x((p) => X(p.day))
    .y((p) => Y(p.value as number));
  const [ys, ye] = [dayOf(year, 0, 1), dayOf(year + 1, 0, 1)];

  return (
    <>
      <defs>
        <clipPath id={clipId}>
          <rect x={ml} y={mt - 2} width={pw} height={H + 4} />
        </clipPath>
      </defs>

      <RecessionShading era={era} view={view} X={X} top={mt} height={H} />
      {visibleSpan(ys, ye) && (() => {
        const [x0, x1] = clipped(ys, ye);
        return <rect x={x0} y={mt} width={Math.max(1, x1 - x0)} height={H} fill="var(--accent)" fillOpacity={0.1} />;
      })()}

      {scale.ticks.map((v) => (
        <g key={v}>
          <line x1={ml} x2={ml + pw} y1={Y(v)} y2={Y(v)} className={v === 0 && scale.lo < 0 ? "zero-line" : "grid-line"} />
          <text x={ml - 7} y={Y(v) + 3.5} textAnchor="end" className="fill-ink-muted font-mono text-[11px]">
            {fmtTick(v)}
          </text>
        </g>
      ))}

      <g clipPath={`url(#${clipId})`}>
        {second && <path d={gen(pts(second)) ?? ""} fill="none" stroke="var(--ink-faint)" strokeWidth={2} strokeDasharray="4 3" strokeLinejoin="round" />}
        <path d={gen(pts(main)) ?? ""} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      </g>

      <YearAxis view={view} X={X} left={ml} plotW={pw} axisY={axisY} />
      <PresidentAndCongress era={era} view={view} X={X} left={ml} bandY={bandY} houseY={houseY} senateY={senateY} showCong={showCong} />
      <RecessionLabels era={era} view={view} X={X} y={mt - 3} />
    </>
  );
});

/** Crosshair and dots for the active date: the only layer that re-renders on hover. */
function Overlay({ W, series, measure, scale, view, showCong }: { W: number; series: FlowSeries; measure: Measure; scale: Scale; view: readonly [number, number]; showCong: boolean }) {
  const v = useTradeValues();
  const day = activeDay(v);
  if (day === null || day < view[0] || day >= view[1]) return null;
  const g = geometry(W, view, scale, showCong);
  const r = readingAtDay(series, day);
  const x = g.X(day);
  const dots: [number | null, string][] =
    measure === "balance" ? [[r?.balance ?? null, "var(--ink)"]] : [[r?.exports ?? null, "var(--ink)"], [r?.imports ?? null, "var(--ink-faint)"]];
  return (
    <g pointerEvents="none">
      <line x1={x} x2={x} y1={g.mt} y2={g.axisY} stroke="var(--accent)" strokeWidth={v.hover === null ? 1.5 : 1} />
      {r && dots.map(([val, fill], i) => (val === null ? null : <circle key={i} cx={g.X(monthMidDay(r.month))} cy={g.Y(val)} r={4} fill={fill} stroke="var(--surface)" strokeWidth={1.5} />))}
    </g>
  );
}

export function TradeBalanceChart(props: Props) {
  const { series, measure, scale, era, showCong, view, ariaLabel } = props;
  const [wrapRef, measured] = useElementWidth<HTMLDivElement>();
  const W = measured || 1140;
  const g = geometry(W, view, scale, showCong);
  const { moveHover, leaveHover, pinDay } = useTradeActions();
  const tip = useTooltip<number>();

  /** Pointer x -> axis day, or null below the plot (the president band has its own click). */
  const dayAt = (e: ReactPointerEvent<SVGSVGElement> | ReactMouseEvent<SVGSVGElement>): number | null => {
    const r = e.currentTarget.getBoundingClientRect();
    const k = W / r.width;
    if ((e.clientY - r.top) * k > g.axisY + 6) return null;
    return dayFromFraction(((e.clientX - r.left) * k - g.ml) / g.pw, view[1] - view[0], view[0]);
  };

  return (
    <div ref={wrapRef}>
      <ChartFrame
        width={W}
        height={g.height}
        margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
        ariaLabel={ariaLabel}
        svgProps={{ style: { touchAction: "pan-y" } }}
        onPointerMove={(e) => {
          if (e.pointerType === "touch") return; // taps pin (onClick); touch scrolling is left alone
          const d = dayAt(e);
          if (d === null) {
            leaveHover();
            tip.hide();
          } else {
            moveHover(d);
            tip.show(d, e);
          }
        }}
        onPointerLeave={() => {
          leaveHover();
          tip.hide();
        }}
        onClick={(e) => {
          const d = dayAt(e);
          if (d !== null) pinDay(d);
        }}
      >
        {() => (
          <>
            <StaticLayer {...props} W={W} />
            <Overlay W={W} series={series} measure={measure} scale={scale} view={view} showCong={showCong} />
          </>
        )}
      </ChartFrame>
      <Tooltip state={tip.state}>
        {(day) => {
          const r = readingAtDay(series, day);
          const t = termAtDay(era.terms, day);
          if (!r) return null;
          return (
            <div className="flex min-w-[9rem] flex-col gap-0.5 text-[0.78rem]">
              <div className="opacity-75">{r.label}</div>
              {measure === "balance" ? (
                <div className="font-mono text-[0.95rem] font-medium">{r.balance === null ? "—" : fmtMoney(r.balance, { signed: true })}</div>
              ) : (
                <>
                  <div>Exports <span className="font-mono">{r.exports === null ? "—" : fmtMoney(r.exports)}</span></div>
                  <div>Imports <span className="font-mono">{r.imports === null ? "—" : fmtMoney(r.imports)}</span></div>
                </>
              )}
              {t && <div className="opacity-75">{termLabel(t)}</div>}
            </div>
          );
        }}
      </Tooltip>
    </div>
  );
}
