"use client";

import { memo, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { line } from "d3-shape";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { Tooltip, useTooltip } from "@/components/charts/Tooltip";
import { useElementWidth } from "@/lib/use-element-width";
import type { EconomyTerm } from "@/lib/economy-presidents";
import type { ControlSpan } from "@/lib/congress-control";
import { dateOfDay, dayOf } from "@/lib/indicator-time";
import { dayFromFraction } from "@/lib/indicator-lookup";
import { recessionLabel } from "@/lib/indicator-payload";
import { termYearRange } from "@/lib/year-range";
import { fmtMoney, fmtTick, monthMidDay, plotted, readingAtDay, termAtDay, termLabel, type FlowSeries, type Measure, type Scale } from "@/lib/trade-chart";
import { activeDay, useTradeActions, useTradeValues } from "./TradeState";

export interface Era {
  span: number;
  rec: [number, number][];
  terms: EconomyTerm[];
  control: { house: ControlSpan[]; senate: ControlSpan[] };
}

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

const party = (p: "D" | "R") => (p === "D" ? "var(--dem)" : "var(--rep)");
const EST_CHAR_W = 6.4;
const BAND_H = 18;
const ROW_H = 12;

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

const termText = (t: EconomyTerm, width: number): string | null =>
  [t.last, t.label].filter((s, i, a) => a.indexOf(s) === i).reverse().find((s) => s.length * EST_CHAR_W + 8 <= width) ?? null;

interface StaticProps extends Props {
  W: number;
}

/** Everything that doesn't change with the hovered date; memoized so a hover frame doesn't rebuild the paths. */
const StaticLayer = memo(function StaticLayer({ series, measure, scale, era, showCong, view, year, W }: StaticProps) {
  const { toggleRange } = useTradeActions();
  const [vs, ve] = view;
  const g = geometry(W, view, scale, showCong);
  const { ml, mt, H, pw, axisY, bandY, houseY, senateY, X, Y } = g;
  const firstYear = 1991;
  const lastYear = dateOfDay(era.span - 1).year;
  const { main, second } = plotted(series, measure);
  const clipId = "clip-trade-balance";
  const clipped = (a: number, b: number): [number, number] => [X(Math.max(vs, a)), X(Math.min(ve, b))];
  const visibleSpan = (a: number, b: number) => b > vs && a < ve;
  const pts = (vals: readonly (number | null)[]) => vals.map((v, i) => ({ day: monthMidDay(i), value: v }));
  const gen = line<{ day: number; value: number | null }>()
    .defined((p) => p.value !== null)
    .x((p) => X(p.day))
    .y((p) => Y(p.value as number));
  const yearsShown = (ve - vs) / 365.25;
  const yearStep = [1, 2, 5, 10].find((s) => (pw / yearsShown) * s >= 42 && !(s === 2 && yearsShown > 20)) ?? 10;
  const years: number[] = [];
  for (let y = dateOfDay(vs).year; dayOf(y, 0, 1) < ve; y++) if (y % yearStep === 0 && dayOf(y, 0, 1) >= vs) years.push(y);
  const [ys, ye] = [dayOf(year, 0, 1), dayOf(year + 1, 0, 1)];

  return (
    <>
      <defs>
        <clipPath id={clipId}>
          <rect x={ml} y={mt - 2} width={pw} height={H + 4} />
        </clipPath>
      </defs>

      {era.rec.filter(([s, e]) => visibleSpan(s, e)).map(([s, e]) => {
        const [x0, x1] = clipped(s, e);
        return <rect key={s} x={x0} y={mt} width={Math.max(1, x1 - x0)} height={H} fill="var(--ink)" fillOpacity={0.09} />;
      })}
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

      <line x1={ml} x2={ml + pw} y1={axisY} y2={axisY} stroke="var(--line-strong)" />
      {vs === 0 && X(dayOf(1995, 0, 1)) - ml >= 40 && (
        <text x={ml} y={axisY + 14} textAnchor="start" className="fill-ink-muted font-mono text-[11px]">1991</text>
      )}
      {years.map((y) => (
        <g key={y}>
          <line x1={X(dayOf(y, 0, 1))} x2={X(dayOf(y, 0, 1))} y1={axisY} y2={axisY + 4} stroke="var(--line-strong)" />
          <text x={X(dayOf(y, 0, 1))} y={axisY + 14} textAnchor="middle" className="fill-ink-muted font-mono text-[11px]">{y}</text>
        </g>
      ))}

      <text x={ml - 7} y={bandY + 12.5} textAnchor="end" className="fill-ink-muted text-[11px]" opacity={showCong ? 1 : 0}>Pres.</text>
      {era.terms.map((t) => {
        if (!visibleSpan(t.s, t.e)) return null;
        const [x0, x1] = clipped(t.s, t.e);
        const text = termText(t, x1 - x0);
        return (
          <g
            key={t.termId}
            className="cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              toggleRange(termYearRange(t.startYear, t.endYear, firstYear, lastYear), [firstYear, lastYear]);
            }}
          >
            <title>{`${t.full}, ${t.startYear} to ${t.endYear ?? "present"}. Click to show only these years.`}</title>
            <rect x={x0} y={bandY} width={x1 - x0 - 0.5} height={BAND_H} fill={party(t.party)} />
            {text && (
              <text x={(x0 + x1) / 2} y={bandY + 12.6} textAnchor="middle" className="text-[11px] font-semibold" fill="#ffffff">{text}</text>
            )}
          </g>
        );
      })}

      {showCong &&
        (["house", "senate"] as const).map((ch) => {
          const y = ch === "house" ? houseY : senateY;
          return (
            <g key={ch}>
              <title>{ch === "house" ? "House majority" : "Senate majority"}</title>
              <text x={ml - 7} y={y + 9.5} textAnchor="end" className="fill-ink-muted text-[11px]">{ch === "house" ? "House" : "Senate"}</text>
              {era.control[ch].map((c) => {
                if (!visibleSpan(c.s, c.e)) return null;
                const [x0, x1] = clipped(c.s, c.e);
                return (
                  <g key={c.s}>
                    <rect x={x0} y={y} width={Math.max(0.5, x1 - x0 - 0.5)} height={ROW_H} fill={party(c.party)} />
                    {x1 - x0 >= 16 && <text x={(x0 + x1) / 2} y={y + 9} textAnchor="middle" className="text-[9px] font-semibold" fill="#ffffff">{c.party}</text>}
                  </g>
                );
              })}
            </g>
          );
        })}
      {era.rec.filter(([s, e]) => visibleSpan(s, e)).map((r) => {
        const [x0, x1] = clipped(r[0], r[1]);
        if (x1 - x0 < 14) return null;
        return (
          <text key={`l${r[0]}`} x={r[0] <= vs ? x0 + 1 : (x0 + x1) / 2} y={mt - 3} textAnchor={r[0] <= vs ? "start" : "middle"} className="fill-ink-muted text-[10px]">
            {recessionLabel(r, dateOfDay)}
          </text>
        );
      })}
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
