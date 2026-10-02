"use client";

import { memo, useMemo, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from "react";
import { line } from "d3-shape";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { ExtremeMarks, type ExtremeMark } from "@/components/charts/ExtremeMarks";
import { findExtremes } from "@/lib/chart-extremes";
import { Tooltip, useTooltip } from "@/components/charts/Tooltip";
import { useElementWidth } from "@/lib/use-element-width";
import {
  fiscalBars,
  incomePoints,
  miseryPoints,
  monthlyPoints,
  quarterlyPoints,
  weeklyPoints,
  type SeriesPoint,
} from "@/lib/economy-series";
import type { EconomyData } from "@/lib/indicator-payload";
import { recessionLabel } from "@/lib/indicator-payload";
import { dateOfDay, dayOf, fmtMonthIndex, monthIndexOfDay } from "@/lib/indicator-time";
import { termYearRange } from "@/lib/year-range";
import type { EconomyTerm } from "@/lib/economy-presidents";
import { dayFromFraction, readAll, type Reading } from "@/lib/indicator-lookup";
import { activeDay, useEconomyActions, useEconomyValues } from "./EconomyState";
import { JOBS_CAP, type ChartSpec } from "./specs";

/** Chart points for a spec's main series (the second debt line comes from `chartPoints2`). */
export function chartPoints(d: EconomyData, key: ChartSpec["key"]): SeriesPoint[] {
  switch (key) {
    case "mis": return miseryPoints(d);
    case "gas": return weeklyPoints(d.gas);
    case "mort": return weeklyPoints(d.mort);
    case "jobs": return monthlyPoints(d.jobs);
    case "un": return monthlyPoints(d.un);
    case "infl": return monthlyPoints(d.infl);
    case "inc": return incomePoints(d.inc);
    case "def": return fiscalBars(d.def).map((b) => ({ day: b.mid, value: b.value }));
    case "debt": return quarterlyPoints(d.held);
  }
}

const party = (p: "D" | "R") => (p === "D" ? "var(--dem)" : "var(--rep)");
const MUTED = "var(--ink-muted)";
const EST_CHAR_W = 6.4;
/** Halo so annotation text stays legible where it crosses a line or recession band. */
const YHALO = { stroke: "var(--surface)", strokeWidth: 3, strokeLinejoin: "round", paintOrder: "stroke" } as const;
const HALO = { stroke: "var(--surface)", strokeWidth: 3, paintOrder: "stroke" } as const;

interface Props {
  data: EconomyData;
  spec: ChartSpec;
  hero?: boolean;
  showCong: boolean;
  /** Visible window `[start, end)` in axis days. */
  view: readonly [number, number];
}

function termText(t: EconomyTerm, width: number, hero: boolean): string | null {
  const bush = t.last === "Bush";
  const tries = [hero && bush ? t.label : t.last, t.last];
  return tries.find((s) => s.length * EST_CHAR_W + 8 <= width) ?? null;
}

const BAND_H = 18;
const ROW_H = 12;

/** Pure layout for one chart at one measured width. Shared by the static layer and the crosshair overlay. */
function geometry(W: number, hero: boolean, spec: ChartSpec, view: readonly [number, number], showCong: boolean) {
  const ml = 8; // y labels sit inside the plot
  const mr = 12;
  const mt = hero ? 22 : 8;
  const H = hero ? (W < 600 ? 170 : 200) : 150;
  const pw = W - ml - mr;
  const [lo, hi] = spec.domain;
  const axisY = mt + H;
  const bandY = axisY + 23;
  const houseY = bandY + BAND_H + 3;
  const senateY = houseY + ROW_H + 2;
  return {
    ml, mr, mt, H, pw, lo, hi, axisY, bandY, houseY, senateY,
    height: (showCong ? senateY + ROW_H : bandY + BAND_H) + 8,
    X: (day: number) => ml + ((day - view[0]) / (view[1] - view[0])) * pw,
    Y: (v: number) => mt + ((hi - v) / (hi - lo)) * H,
  };
}

interface StaticProps extends Props {
  W: number;
}

/** Everything that doesn't change with the hovered date. Memoized so a hover frame doesn't rebuild 1,900-point paths nine times. */
const StaticLayer = memo(function StaticLayer({ data, spec, hero = false, showCong, view, W }: StaticProps) {
  const { toggleRange } = useEconomyActions();
  const firstYear = dateOfDay(0).year;
  const lastYear = dateOfDay(data.span - 1).year;
  const [vs, ve] = view;
  const { ml, mt, H, pw, lo, axisY, bandY, houseY, senateY, X, Y } = geometry(W, hero, spec, view, showCong);
  const clipId = `clip-${spec.key}`;

  const pts = chartPoints(data, spec.key);
  /** Points inside the window: annotations (peak, latest, jobs extremes) describe what's on screen. */
  const inView = pts.filter((p) => p.day >= vs && p.day < ve);
  const lineGen = line<SeriesPoint>()
    .defined((p) => p.value !== null)
    .x((p) => X(p.day))
    .y((p) => Y(p.value as number));
  const clipped = (a: number, b: number): [number, number] => [X(Math.max(vs, a)), X(Math.min(ve, b))];
  const visibleSpan = (a: number, b: number) => b > vs && a < ve;
  // Label spacing follows the zoom: every year when zoomed in, every 5 or 10 at full width.
  const yearsShown = (ve - vs) / 365.25;
  const yearStep = [1, 2, 5, 10].find((s) => (pw / yearsShown) * s >= 42 && !(s === 2 && yearsShown > 20)) ?? 10;
  const years: number[] = [];
  for (let y = dateOfDay(vs).year; dayOf(y, 0, 1) < ve; y++) if (y % yearStep === 0 && dayOf(y, 0, 1) >= vs) years.push(y);


  return (
          <>
            <defs>
              <clipPath id={clipId}>
                <rect x={ml} y={mt - 2} width={pw} height={H + 4} />
              </clipPath>
            </defs>

            {/* Recession shading, behind everything. */}
            {data.rec.filter(([s, e]) => visibleSpan(s, e)).map(([s, e]) => {
              const [x0, x1] = clipped(s, e);
              return <rect key={s} x={x0} y={mt} width={Math.max(1, x1 - x0)} height={H} fill="var(--ink)" fillOpacity={0.09} />;
            })}

            {/* Gridlines + y labels */}
            {spec.ticks.map((v) => (
              <g key={v}>
                <line x1={ml} x2={ml + pw} y1={Y(v)} y2={Y(v)} className={v === 0 && lo < 0 ? "zero-line" : "grid-line"} />
                <text x={ml + 4} y={Y(v) - 4} textAnchor="start" className="fill-ink-muted font-mono text-[11px]" style={YHALO}>
                  {spec.tick(v)}
                </text>
              </g>
            ))}

            <g clipPath={`url(#${clipId})`}>
              {spec.kind === "fiscal" &&
                fiscalBars(data.def).map((b) => {
                  const [x0, x1] = clipped(b.s, b.e);
                  const y0 = Y(0);
                  const y1 = Y(b.value);
                  return (
                    <rect
                      key={b.fy}
                      x={x0 + 0.5}
                      width={Math.max(1, x1 - x0 - 1)}
                      y={Math.min(y0, y1)}
                      height={Math.abs(y1 - y0)}
                      fill={b.value < 0 ? "var(--ink)" : "var(--ink-faint)"}
                    >
                      <title>{`Fiscal ${b.fy}: ${spec.head(b.value)} of GDP`}</title>
                    </rect>
                  );
                })}

              {spec.kind === "jobs" &&
                pts.map((p) => {
                  if (p.value === null) return null;
                  const m = monthIndexOfDay(p.day);
                  const next = dayOf(1991 + Math.floor((m + 1) / 12), (m + 1) % 12, 1);
                  const x0 = X(p.day);
                  const w = Math.max(1, X(next) - x0 - 0.4);
                  const v = Math.max(-JOBS_CAP, Math.min(JOBS_CAP, p.value));
                  const y0 = Y(0);
                  const y1 = Y(v);
                  return <rect key={p.day} x={x0} width={w} y={Math.min(y0, y1)} height={Math.max(0.5, Math.abs(y1 - y0))} fill="var(--ink)" />;
                })}

              {(spec.kind === "line" || spec.kind === "income" || spec.kind === "debt") && (
                <>
                  {spec.kind === "debt" && (
                    <path d={lineGen(quarterlyPoints(data.tot)) ?? ""} fill="none" stroke="var(--ink-faint)" strokeWidth={2} strokeDasharray="4 3" strokeLinejoin="round" />
                  )}
                  <path d={lineGen(pts) ?? ""} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                </>
              )}
              {spec.kind === "income" &&
                pts.map((p) => (p.value === null ? null : <circle key={p.day} cx={X(p.day)} cy={Y(p.value)} r={2.5} fill="var(--ink)" />))}
            </g>

            {spec.kind === "jobs" &&
              inView.map((p) => {
                if (p.value === null || Math.abs(p.value) <= JOBS_CAP) return null;
                const up = p.value > 0;
                const x = X(p.day) + 1.5;
                const y = up ? mt : mt + H;
                const tri = up ? `${x - 4},${y + 6} ${x + 4},${y + 6} ${x},${y - 1}` : `${x - 4},${y - 6} ${x + 4},${y - 6} ${x},${y + 1}`;
                return <polygon key={p.day} points={tri} fill="var(--ink)" />;
              })}
            {spec.key === "mort" && data.mortBreak >= vs && data.mortBreak < ve && (
              <g>
                <line x1={X(data.mortBreak)} x2={X(data.mortBreak)} y1={mt} y2={axisY} stroke={MUTED} strokeWidth={1} strokeDasharray="3 3" />
                <text x={X(data.mortBreak) - 5} y={mt + 10} textAnchor="end" className="fill-ink-muted text-[10px]" style={HALO}>
                  Survey method change, Nov 2022
                </text>
              </g>
            )}

            {hero && (
              <g>
                {data.rec.filter((r) => visibleSpan(r[0], r[1])).map((r) => {
                  const [x0, x1] = clipped(r[0], r[1]);
                  const label = recessionLabel(r, dateOfDay);
                  const startsAtEdge = r[0] <= vs;
                  return (
                    <text key={r[0]} x={startsAtEdge ? x0 + 1 : (x0 + x1) / 2} y={14} textAnchor={startsAtEdge ? "start" : "middle"} className="fill-ink-muted text-[10px]">
                      {label}
                    </text>
                  );
                })}
              </g>
            )}

            {/* x axis */}
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

            {/* President band (always on) */}
            {data.terms.map((t) => {
              if (!visibleSpan(t.s, t.e)) return null;
              const [x0, x1] = clipped(t.s, t.e);
              const text = termText(t, x1 - x0, hero);
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
                    <text x={(x0 + x1) / 2} y={bandY + 12.6} textAnchor="middle" className="text-[11px] font-semibold" fill="#ffffff">
                      {text}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Congress control rows (optional) */}
            {showCong &&
              (["house", "senate"] as const).map((ch) => {
                const y = ch === "house" ? houseY : senateY;
                return (
                  <g key={ch}>
                    <title>{ch === "house" ? "House majority" : "Senate majority"}</title>
                    <text x={ml + 4} y={y + 9.5} textAnchor="start" className="text-[10px] font-semibold" fill="#ffffff" pointerEvents="none">
                      {ch === "house" ? "House" : "Senate"}
                    </text>
                    {data.control[ch].map((c) => {
                      if (!visibleSpan(c.s, c.e)) return null;
                      const [x0, x1] = clipped(c.s, c.e);
                      return (
                        <g key={c.s}>
                          <rect x={x0} y={y} width={Math.max(0.5, x1 - x0 - 0.5)} height={ROW_H} fill={party(c.party)} />
                          {x1 - x0 >= 16 && (x0 + x1) / 2 - ml >= 46 && (
                            <text x={(x0 + x1) / 2} y={y + 9} textAnchor="middle" className="text-[9px] font-semibold" fill="#ffffff">
                              {c.party}
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </g>
                );
              })}
          </>
  );
});

/** "Mar 2020", "2019" (yearly series) or "FY2020" (fiscal bars): the date half of a peak/low label. */
function markDate(kind: ChartSpec["kind"], day: number): string {
  const { year } = dateOfDay(day);
  if (kind === "income") return String(year);
  if (kind === "fiscal") return `FY${year}`;
  return fmtMonthIndex(monthIndexOfDay(day)).slice(0, 3) + ` ${year}`;
}

/** The chart's peak and low inside the visible window, drawn on the line. Fades while a date is hovered or pinned. */
function Marks({ data, spec, hero, showCong, view, W }: { data: EconomyData; spec: ChartSpec; hero: boolean; showCong: boolean; view: readonly [number, number]; W: number }) {
  const v = useEconomyValues();
  const { peak, low } = useMemo(() => {
    const pts = chartPoints(data, spec.key).filter((p) => p.day >= view[0] && p.day < view[1]);
    return findExtremes(pts);
  }, [data, spec.key, view]);
  const g = geometry(W, hero, spec, view, showCong);
  const mark = (p: SeriesPoint | null, kind: "peak" | "low"): ExtremeMark[] => {
    if (!p || p.value === null) return [];
    const val = spec.kind === "jobs" ? Math.max(-JOBS_CAP, Math.min(JOBS_CAP, p.value)) : p.value;
    return [{ kind, x: g.X(p.day), y: g.Y(val), text: `${markDate(spec.kind, p.day)}: ${spec.kind === "jobs" && Math.abs(p.value) >= 1000 ? `${p.value > 0 ? "+" : "−"}${(Math.abs(p.value) / 1000).toFixed(1)}M` : spec.head(p.value)}` }];
  };
  const marks = [...mark(peak, "peak"), ...mark(low, "low")];
  if (marks.length === 0) return null;
  return <ExtremeMarks marks={marks} left={g.ml} right={g.ml + g.pw} top={g.mt} bottom={g.axisY} faded={activeDay(v) !== null || v.pin !== null} />;
}

const dotPos = (reading: Reading, spec: ChartSpec, g: ReturnType<typeof geometry>) => {
  if (reading.value === null || reading.snap === null) return null;
  const v = spec.kind === "jobs" ? Math.max(-JOBS_CAP, Math.min(JOBS_CAP, reading.value)) : reading.value;
  return { x: g.X(reading.snap), y: g.Y(v) };
};

/** Crosshair and dots for the active date: the only layer that re-renders on hover. */
function Overlay({ W, hero, spec, view, showCong, reading }: { W: number; hero: boolean; spec: ChartSpec; view: readonly [number, number]; showCong: boolean; reading: Reading }) {
  const v = useEconomyValues();
  const day = activeDay(v);
  const pinInView = v.pin !== null && v.pin >= view[0] && v.pin < view[1];
  if ((day === null || day < view[0] || day >= view[1]) && !pinInView) return null;
  const g = geometry(W, hero, spec, view, showCong);
  const pinX = pinInView && v.hover !== null && v.hover !== v.pin ? g.X(v.pin!) : null;
  if (day === null || day < view[0] || day >= view[1])
    return <g pointerEvents="none"><line x1={g.X(v.pin!)} x2={g.X(v.pin!)} y1={g.mt} y2={g.axisY} stroke="var(--accent)" strokeWidth={1.5} /></g>;
  const dot = dotPos(reading, spec, g);
  const dot2 = reading.value2 !== null && reading.snap !== null ? { x: g.X(reading.snap), y: g.Y(reading.value2) } : null;
  const x = g.X(day);
  return (
    <g pointerEvents="none">
      {pinX !== null && <line x1={pinX} x2={pinX} y1={g.mt} y2={g.axisY} stroke="var(--accent)" strokeWidth={1.5} />}
      <line x1={x} x2={x} y1={g.mt} y2={g.axisY} stroke="var(--accent)" strokeWidth={v.hover === null ? 1.5 : 1} strokeOpacity={pinX !== null ? 0.5 : 1} />
      {dot2 && <circle cx={dot2.x} cy={dot2.y} r={3.5} fill="var(--ink-faint)" stroke="var(--surface)" strokeWidth={1.5} />}
      {dot && <circle cx={dot.x} cy={dot.y} r={4} fill="var(--ink)" stroke="var(--surface)" strokeWidth={1.5} />}
    </g>
  );
}

export function EconomyChart({ data, spec, hero = false, showCong, view, reading }: Props & { reading: Reading }) {
  const [wrapRef, measured] = useElementWidth<HTMLDivElement>();
  const W = measured || (hero ? 1140 : 540);
  const g = geometry(W, hero, spec, view, showCong);
  const { moveHover, leaveHover, pinDay } = useEconomyActions();
  const tip = useTooltip<number>();

  /** Pointer x -> axis day, or null when the pointer is below the plot (the president band has its own click). */
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
        ariaLabel={spec.aria}
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
            <StaticLayer data={data} spec={spec} hero={hero} showCong={showCong} view={view} W={W} />
            <Marks data={data} spec={spec} hero={hero} showCong={showCong} view={view} W={W} />
            <Overlay W={W} hero={hero} spec={spec} view={view} showCong={showCong} reading={reading} />
          </>
        )}
      </ChartFrame>
      <Tooltip state={tip.state}>
        {(day) => {
          const r = readAll(data, day)[spec.key]; // computed from the pointer's own date, not the rAF-throttled shared state
          return (
          <div className="flex min-w-[8rem] flex-col gap-0.5 text-[0.78rem]">
            <div className="opacity-75">{r.caption}</div>
            <div className="font-mono text-[0.95rem] font-medium">{r.value === null ? "\u2014" : spec.head(r.value)}</div>
            {r.value2 !== null && <div className="opacity-75">{`Total ${spec.head(r.value2)}`}</div>}
          </div>
          );
        }}
      </Tooltip>
    </div>
  );
}
