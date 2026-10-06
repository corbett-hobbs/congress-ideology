"use client";

import { yGutter } from "@/lib/chart-bars";
import { memo, useEffect, useMemo, useState, type ReactNode, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { line } from "d3-shape";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { ExtremeMarks, type ExtremeMark } from "@/components/charts/ExtremeMarks";
import { findExtremes } from "@/lib/chart-extremes";
import { Tooltip, useTooltip } from "@/components/charts/Tooltip";
import { useElementWidth } from "@/lib/use-element-width";
import { dateOfDay, dayOfIso, MONTH_ABBR, MONTH_NAMES } from "@/lib/indicator-time";
import { dayFromFraction } from "@/lib/indicator-lookup";
import { fmtDollars, fmtPercent, fmtPercentTick, monthMidDay, monthStartDay, rateReadingAtDay, termAtDay, termLabel, type Scale } from "@/lib/trade-chart";
import { monthIndex } from "@/lib/trade-derive";
import { lanesUsed, placeFlags, type FlagInput, type PlacedFlag } from "@/lib/trade-flags";
import type { Monthly, TariffFlag } from "@/lib/trade-types";
import { BAND_H, PresidentAndCongress, RecessionLabels, RecessionShading, ROW_H, YearAxis, type Era } from "./EraLayers";
import { activeDay, useTradeActions, useTradeValues } from "./TradeState";


export const AUTHORITY_LABEL: Record<string, string> = {
  section_232: "Section 232",
  section_301: "Section 301",
  ieepa: "IEEPA",
  section_122: "Section 122",
  court: "Court ruling",
  other: "Other authority",
};

const LANE_H = 15;
const COMPACT_W = 600;
const SOURCE_BREAK = monthIndex("2010-01");

interface Props {
  /** Percent per month. */
  main: Monthly;
  duties: Monthly;
  imports: Monthly;
  /** The all-countries rate, drawn faint behind a single country. */
  reference: Monthly | null;
  scale: Scale;
  era: Era;
  flags: readonly TariffFlag[];
  showCong: boolean;
  view: readonly [number, number];
  ariaLabel: string;
  /** Drawn directly under the chart. */
  legend?: ReactNode;
}

const dateText = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTH_ABBR[m - 1]} ${d}, ${y}`;
};

function layout(W: number, view: readonly [number, number], scale: Scale, showCong: boolean, flagInputs: readonly FlagInput[], era: Era) {
  const ml = yGutter(scale.ticks.map(fmtPercentTick)); // y labels sit in a gutter left of the plot
  const mr = 12;
  const pw = W - ml - mr;
  const X = (day: number) => ml + ((day - view[0]) / (view[1] - view[0])) * pw;
  const compact = W < COMPACT_W;
  const placed = placeFlags(flagInputs, { X, viewStart: view[0], viewEnd: view[1], span: era.span, plotLeft: ml, plotRight: ml + pw, labels: !compact, lanes: 3, extraLanes: 2 });
  const lanes = lanesUsed(placed);
  const flagH = lanes ? lanes * LANE_H + 6 : 0;
  const recLabelH = 12;
  const mt = flagH + recLabelH + 4;
  const H = W < 600 ? 190 : 230;
  const axisY = mt + H;
  const bandY = axisY + 23;
  const houseY = bandY + BAND_H + 3;
  const senateY = houseY + ROW_H + 2;
  return {
    ml, pw, mt, H, axisY, bandY, houseY, senateY, flagH, recLabelH, placed, compact, X,
    height: (showCong ? senateY + ROW_H : bandY + BAND_H) + 8,
    Y: (v: number) => mt + ((scale.hi - v) / (scale.hi - scale.lo)) * H,
  };
}

function useFlagInputs(flags: readonly TariffFlag[]): FlagInput[] {
  return useMemo(() => flags.map((f) => ({ id: f.id, day: dayOfIso(f.date), label: f.label, priority: f.priority, dateText: dateText(f.date) })), [flags]);
}

interface StaticProps extends Props {
  W: number;
  flagInputs: readonly FlagInput[];
  onFlag: (ids: string[], e: ReactPointerEvent | ReactMouseEvent, numbered: boolean, click?: boolean) => void;
  onFlagLeave: () => void;
}

const StaticLayer = memo(function StaticLayer({ main, reference, scale, era, showCong, view, W, flagInputs, onFlag, onFlagLeave }: StaticProps) {
  const [vs, ve] = view;
  const g = layout(W, view, scale, showCong, flagInputs, era);
  const { ml, pw, mt, H, axisY, bandY, houseY, senateY, X, Y, placed } = g;
  const clipId = "clip-trade-tariff";
  const pts = (vals: readonly (number | null)[]) => vals.map((v, i) => ({ day: monthMidDay(i), value: v }));
  const gen = line<{ day: number; value: number | null }>()
    .defined((p) => p.value !== null)
    .x((p) => X(p.day))
    .y((p) => Y(p.value as number));
  const first = main.findIndex((v) => v !== null);
  const zoneEnd = first < 0 ? ve : monthStartDay(first);
  const zoneX1 = X(Math.min(ve, zoneEnd));
  const zoneW = zoneX1 - ml;
  const zoneText = first < 0 ? "No calculated duties data" : `Calculated duties data begins ${MONTH_NAMES[first % 12]} ${1991 + Math.floor(first / 12)}`;
  const breakDay = monthStartDay(SOURCE_BREAK);
  const breakVisible = breakDay > vs + 400 && breakDay < ve - 400 && first <= SOURCE_BREAK;

  return (
    <>
      <defs>
        <clipPath id={clipId}>
          <rect x={ml} y={mt - 2} width={pw} height={H + 4} />
        </clipPath>
      </defs>
      <RecessionShading era={era} view={view} X={X} top={mt} height={H} />
      {zoneEnd > vs && (
        <g>
          <rect x={ml} y={mt} width={Math.max(0, zoneW)} height={H} fill="var(--ink)" fillOpacity={0.045} />
          {zoneW >= 150 && (
            <text x={ml + zoneW / 2} y={mt + H / 2} textAnchor="middle" className="fill-ink-muted text-[11px]">{zoneText}</text>
          )}
        </g>
      )}
      {scale.ticks.map((v) => (
        <g key={v}>
          <line x1={ml} x2={ml + pw} y1={Y(v)} y2={Y(v)} className={v === 0 ? "zero-line" : "grid-line"} />
          <text x={ml - 6} y={Y(v) + 3.5} textAnchor="end" className="fill-ink-muted font-mono text-[11px]">{fmtPercentTick(v)}</text>
        </g>
      ))}
      {breakVisible && (
        <g>
          <line x1={X(breakDay)} x2={X(breakDay)} y1={mt} y2={axisY} stroke="var(--ink-muted)" strokeWidth={1} strokeDasharray="2 3" />
          {pw > 500 && (
            <>
              <text x={X(breakDay) - 4} y={axisY - 5} textAnchor="end" className="fill-ink-muted text-[10px]">USITC DataWeb</text>
              <text x={X(breakDay) + 4} y={axisY - 5} className="fill-ink-muted text-[10px]">Census API</text>
            </>
          )}
        </g>
      )}
      <g clipPath={`url(#${clipId})`}>
        {reference && <path d={gen(pts(reference)) ?? ""} fill="none" stroke="var(--ink-faint)" strokeWidth={1.75} strokeLinejoin="round" />}
        <path d={gen(pts(main)) ?? ""} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      </g>

      <YearAxis view={view} X={X} left={ml} plotW={pw} axisY={axisY} />
      <PresidentAndCongress era={era} view={view} X={X} left={ml} bandY={bandY} houseY={houseY} senateY={senateY} showCong={showCong} />
      <RecessionLabels era={era} view={view} X={X} y={mt - 3} />

      {/* Event flags: a dashed line down the plot, its label in a lane above. */}
      {placed.map((p) => {
        const labelY = (p.lane + 1) * LANE_H - 4;
        return (
          <g
            key={p.ids.join("+")}
            data-flag-hit
            className={p.number !== null ? "cursor-pointer" : "cursor-default"}
            onPointerEnter={(e) => e.pointerType === "mouse" && onFlag(p.ids, e, p.number !== null)}
            onPointerMove={(e) => {
              e.stopPropagation();
              if (e.pointerType === "mouse") onFlag(p.ids, e, p.number !== null);
            }}
            onPointerLeave={onFlagLeave}
            onClick={(e) => {
              e.stopPropagation();
              if (p.number !== null) onFlag(p.ids, e, true, true);
            }}
          >
            <line x1={p.x} x2={p.x} y1={labelY + 3} y2={axisY} stroke="var(--accent)" strokeWidth={p.priority === 1 ? 1.4 : 1} strokeDasharray={p.priority === 1 ? undefined : "3 3"} opacity={p.priority === 1 ? 0.9 : 0.65} />
            {p.number !== null ? (
              <>
                <circle cx={p.x} cy={labelY - 3} r={7} fill="var(--accent)" />
                <text x={p.x} y={labelY} textAnchor="middle" className="text-[9px] font-semibold" fill="var(--accent-ink)">{p.number}</text>
              </>
            ) : (
              <>
                <rect x={p.x0 - 2} y={labelY - 11} width={p.x1 - p.x0 + 2} height={14} fill="var(--surface)" fillOpacity={0.85} />
                <circle cx={p.x} cy={labelY - 4} r={2.8} fill="var(--accent)" />
                <text x={p.anchor === "start" ? p.x + 6 : p.x - 6} y={labelY} textAnchor={p.anchor} className={`text-[10.5px] ${p.priority === 1 ? "fill-ink font-medium" : "fill-ink-muted"}`}>{p.text}</text>
              </>
            )}
            {/* a wider invisible target so a dashed line is easy to hover */}
            <rect x={p.x - 5} y={labelY - 12} width={10} height={axisY - labelY + 12} fill="transparent" />
            <title>{p.pastEnd ? "Dated after the last month of data" : ""}</title>
          </g>
        );
      })}
    </>
  );
});

/** Peak and low of the duty rate inside the window. Fades while a date is hovered or pinned. */
function Marks({ W, main, scale, view, showCong, flagInputs, era }: { W: number; main: Monthly; scale: Scale; view: readonly [number, number]; showCong: boolean; flagInputs: readonly FlagInput[]; era: Era }) {
  const v = useTradeValues();
  const g = layout(W, view, scale, showCong, flagInputs, era);
  const marks = useMemo(() => {
    const pts = main.map((value, i) => ({ day: monthMidDay(i), value })).filter((p) => p.day >= view[0] && p.day < view[1]);
    const { peak, low } = findExtremes(pts);
    const out: ExtremeMark[] = [];
    for (const [p, kind] of [[peak, "peak"], [low, "low"]] as const) {
      if (!p || p.value === null) continue;
      const { year, month } = dateOfDay(p.day);
      out.push({ kind, x: g.X(p.day), y: g.Y(p.value), text: `${MONTH_ABBR[month]} ${year}: ${fmtPercent(p.value)}` });
    }
    return out;
  }, [main, view, g]);
  if (marks.length === 0) return null;
  return <ExtremeMarks marks={marks} left={g.ml} right={g.ml + g.pw} top={g.mt} bottom={g.axisY} faded={activeDay(v) !== null} />;
}

function Overlay({ W, main, scale, view, showCong, flagInputs, era }: { W: number; main: Monthly; scale: Scale; view: readonly [number, number]; showCong: boolean; flagInputs: readonly FlagInput[]; era: Era }) {
  const v = useTradeValues();
  const day = activeDay(v);
  if (day === null || day < view[0] || day >= view[1]) return null;
  const g = layout(W, view, scale, showCong, flagInputs, era);
  const x = g.X(day);
  const { year, month: mo } = dateOfDay(day);
  const month = (year - 1991) * 12 + mo;
  const val = main[month] ?? null;
  return (
    <g pointerEvents="none">
      <line x1={x} x2={x} y1={g.mt} y2={g.axisY} stroke="var(--accent)" strokeWidth={v.hover === null ? 1.5 : 1} />
      {val !== null && <circle cx={g.X(monthMidDay(month))} cy={g.Y(val)} r={4} fill="var(--ink)" stroke="var(--surface)" strokeWidth={1.5} />}
    </g>
  );
}

export function TradeTariffChart(props: Props) {
  const { main, duties, imports, scale, era, flags, showCong, view, ariaLabel, legend } = props;
  const [wrapRef, measured] = useElementWidth<HTMLDivElement>();
  const W = measured || 1140;
  const flagInputs = useFlagInputs(flags);
  const g = layout(W, view, scale, showCong, flagInputs, era);
  const { moveHover, leaveHover, pinDay } = useTradeActions();
  const tip = useTooltip<number>();
  const flagTip = useTooltip<string[]>();
  // A numbered flag opened by tap or click stays up until the next tap elsewhere, Esc, or scroll.
  const [pinned, setPinned] = useState(false);
  const unpin = () => {
    setPinned(false);
    flagTip.hide();
  };
  const { hide: hideFlagTip } = flagTip;
  useEffect(() => {
    if (!pinned) return;
    const close = () => {
      setPinned(false);
      hideFlagTip();
    };
    const onDown = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest("[data-flag-hit]")) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, { passive: true, capture: true });
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
    };
  }, [pinned, hideFlagTip]);
  const byId = useMemo(() => new Map(flags.map((f) => [f.id, f])), [flags]);

  const dayAt = (e: ReactPointerEvent<SVGSVGElement> | ReactMouseEvent<SVGSVGElement>): number | null => {
    const r = e.currentTarget.getBoundingClientRect();
    const k = W / r.width;
    const y = (e.clientY - r.top) * k;
    if (y > g.axisY + 6 || y < g.mt) return null;
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
          if (e.pointerType === "touch") {
            const d = dayAt(e);
            if (d !== null) pinDay(d);
            return;
          }
          const d = dayAt(e);
          if (d === null) {
            leaveHover();
            tip.hide();
          } else {
            moveHover(d);
            if (!pinned) {
              tip.show(d, e);
              flagTip.hide();
            }
          }
        }}
        onPointerLeave={() => {
          leaveHover();
          tip.hide();
          if (!pinned) flagTip.hide();
        }}
        onClick={(e) => {
          const d = dayAt(e);
          if (d !== null) pinDay(d);
        }}
      >
        {() => (
          <>
            <StaticLayer {...props} W={W} flagInputs={flagInputs} onFlag={(ids, e, _numbered, click) => {
              tip.hide();
              if (click) {
                if (pinned && flagTip.state?.data.join() === ids.join()) return unpin();
                setPinned(true);
              } else if (pinned) return;
              flagTip.show(ids, e);
            }} onFlagLeave={() => !pinned && flagTip.hide()} />
            <Marks W={W} main={main} scale={scale} view={view} showCong={showCong} flagInputs={flagInputs} era={era} />
            <Overlay W={W} main={main} scale={scale} view={view} showCong={showCong} flagInputs={flagInputs} era={era} />
          </>
        )}
      </ChartFrame>

      {legend}

      <Tooltip state={tip.state}>
        {(day) => {
          const r = rateReadingAtDay(duties, imports, day);
          const t = termAtDay(era.terms, day);
          if (!r) return null;
          return (
            <div className="flex min-w-[10rem] flex-col gap-0.5 text-[0.78rem]">
              <div className="opacity-75">{r.label}</div>
              <div className="font-mono text-[0.95rem] font-medium">{r.rate === null ? "—" : fmtPercent(r.rate)}</div>
              {r.duties !== null && r.imports !== null && (
                <>
                  <div>Calculated duties <span className="font-mono">{fmtDollars(r.duties)}</span></div>
                  <div>Imports <span className="font-mono">{fmtDollars(r.imports)}</span></div>
                </>
              )}
              {t && <div className="opacity-75">{termLabel(t)}</div>}
              {r.rate !== null && <div className="opacity-60">{r.month < SOURCE_BREAK ? "Source: USITC DataWeb" : "Source: Census Bureau"}</div>}
            </div>
          );
        }}
      </Tooltip>
      <Tooltip state={flagTip.state}>
        {(ids) => (
          <div className="flex max-w-[22rem] flex-col gap-2 text-[0.78rem]">
            {(() => {
              // Only the lead event (highest priority, then earliest) that the chart labels; merged neighbors are left out.
              const f = ids
                .map((id) => byId.get(id))
                .filter((x): x is TariffFlag => !!x)
                .sort((a, b) => a.priority - b.priority || a.date.localeCompare(b.date))[0];
              return f ? (
                <div className="flex flex-col gap-0.5">
                  <div className="font-medium">{dateText(f.date)} · {f.label}</div>
                  <div>{f.description}</div>
                </div>
              ) : null;
            })()}
          </div>
        )}
      </Tooltip>
    </div>
  );
}

export type { PlacedFlag };
