"use client";

import { line } from "d3-shape";
import { ChartFrame } from "@/components/charts/ChartFrame";
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
import type { EconomyTerm } from "@/lib/economy-presidents";
import { JOBS_CAP, fx, type ChartSpec } from "./specs";

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
const HALO = { stroke: "var(--surface)", strokeWidth: 3, paintOrder: "stroke" } as const;

interface Props {
  data: EconomyData;
  spec: ChartSpec;
  hero?: boolean;
  showCong: boolean;
  /** Index into data.terms of the selected president, or null. */
  term: number | null;
}

function termText(t: EconomyTerm, width: number, hero: boolean): string | null {
  const bush = t.last === "Bush";
  const tries = [hero && bush ? t.label : t.last, t.last];
  return tries.find((s) => s.length * EST_CHAR_W + 8 <= width) ?? null;
}

export function EconomyChart({ data, spec, hero = false, showCong, term }: Props) {
  const [wrapRef, measured] = useElementWidth<HTMLDivElement>();
  const W = measured || (hero ? 1140 : 540);
  const ml = hero ? 60 : 44;
  const mr = 12;
  const mt = hero ? 22 : 8;
  const H = hero ? (W < 600 ? 170 : 200) : 150;
  const pw = W - ml - mr;
  const span = data.span;
  const [lo, hi] = spec.domain;
  const X = (day: number) => ml + (day / span) * pw;
  const Y = (v: number) => mt + ((hi - v) / (hi - lo)) * H;
  const axisY = mt + H;
  const bandY = axisY + 23;
  const BAND_H = 18;
  const ROW_H = 12;
  const houseY = bandY + BAND_H + 3;
  const senateY = houseY + ROW_H + 2;
  const height = (showCong ? senateY + ROW_H : bandY + BAND_H) + 8;
  const clipId = `clip-${spec.key}`;

  const pts = chartPoints(data, spec.key);
  const lineGen = line<SeriesPoint>()
    .defined((p) => p.value !== null)
    .x((p) => X(p.day))
    .y((p) => Y(p.value as number));
  const clipped = (a: number, b: number): [number, number] => [X(Math.max(0, a)), X(Math.min(span, b))];
  const sel = term === null ? null : data.terms[term];
  const years: number[] = [];
  for (let y = 1995; dayOf(y, 0, 1) < span; y += 5) years.push(y);

  const lastNonNull = [...pts].reverse().find((p) => p.value !== null);
  const peak = hero ? pts.reduce<SeriesPoint | null>((m, p) => (p.value !== null && (m === null || p.value > (m.value as number)) ? p : m), null) : null;

  return (
    <div ref={wrapRef}>
      <ChartFrame
        width={W}
        height={height}
        margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
        ariaLabel={spec.aria}
        svgProps={{ style: { touchAction: "pan-y" } }}
      >
        {() => (
          <>
            <defs>
              <clipPath id={clipId}>
                <rect x={ml} y={mt - 2} width={pw} height={H + 4} />
              </clipPath>
            </defs>

            {/* Recession shading, behind everything. */}
            {data.rec.map(([s, e]) => {
              const [x0, x1] = clipped(s, e);
              return <rect key={s} x={x0} y={mt} width={Math.max(1, x1 - x0)} height={H} fill="var(--ink)" fillOpacity={0.09} />;
            })}

            {sel && (() => {
              const [x0, x1] = clipped(sel.s, sel.e);
              return <rect x={x0} y={mt} width={x1 - x0} height={H} fill={party(sel.party)} fillOpacity={0.14} />;
            })()}

            {/* Gridlines + y labels */}
            {spec.ticks.map((v) => (
              <g key={v}>
                <line x1={ml} x2={ml + pw} y1={Y(v)} y2={Y(v)} className={v === 0 && lo < 0 ? "zero-line" : "grid-line"} />
                <text x={ml - 7} y={Y(v) + 3.5} textAnchor="end" className="fill-ink-muted font-mono text-[11px]">
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
              pts.map((p) => {
                if (p.value === null || Math.abs(p.value) <= JOBS_CAP) return null;
                const up = p.value > 0;
                const x = X(p.day) + 1.5;
                const y = up ? mt : mt + H;
                const tri = up ? `${x - 4},${y + 6} ${x + 4},${y + 6} ${x},${y - 1}` : `${x - 4},${y - 6} ${x + 4},${y - 6} ${x},${y + 1}`;
                return <polygon key={p.day} points={tri} fill="var(--ink)" />;
              })}
            {spec.kind === "jobs" &&
              (() => {
                const over = pts.filter((p) => p.value !== null && Math.abs(p.value) > JOBS_CAP);
                const big = [
                  over.reduce<SeriesPoint | null>((m, p) => (p.value! > 0 && (m === null || p.value! > m.value!) ? p : m), null),
                  over.reduce<SeriesPoint | null>((m, p) => (p.value! < 0 && (m === null || p.value! < m.value!) ? p : m), null),
                ];
                return big.map((p) => {
                  if (!p) return null;
                  const up = p.value! > 0;
                  const label = `${fmtMonthIndex(monthIndexOfDay(p.day)).slice(0, 3)} ${dateOfDay(p.day).year}: ${up ? "+" : "−"}${(Math.abs(p.value!) / 1000).toFixed(1)}M`;
                  return (
                    <text key={p.day} x={X(p.day) - 8} y={up ? mt + 9 : mt + H - 3} textAnchor="end" className="fill-ink text-[11px] font-medium" style={HALO}>
                      {label}
                    </text>
                  );
                });
              })()}

            {spec.key === "mort" && (
              <g>
                <line x1={X(data.mortBreak)} x2={X(data.mortBreak)} y1={mt} y2={axisY} stroke={MUTED} strokeWidth={1} strokeDasharray="3 3" />
                <text x={X(data.mortBreak) - 5} y={mt + 10} textAnchor="end" className="fill-ink-muted text-[10px]" style={HALO}>
                  Survey method change, Nov 2022
                </text>
              </g>
            )}

            {hero && peak && lastNonNull && (
              <g>
                <circle cx={X(peak.day)} cy={Y(peak.value as number)} r={3.5} fill="var(--ink)" />
                <text
                  x={X(peak.day) + (X(peak.day) + 110 > W - mr ? -9 : 9)}
                  y={Y(peak.value as number) + 4}
                  textAnchor={X(peak.day) + 110 > W - mr ? "end" : "start"}
                  className="fill-ink text-[11px] font-medium"
                  style={HALO}
                >
                  {`${fmtMonthIndex(monthIndexOfDay(peak.day)).slice(0, 3)} ${dateOfDay(peak.day).year}: ${fx(peak.value as number, 1)}`}
                </text>
                <circle cx={X(lastNonNull.day)} cy={Y(lastNonNull.value as number)} r={3.5} fill="var(--ink)" />
                <text x={X(lastNonNull.day) - 8} y={Y(lastNonNull.value as number) - 10} textAnchor="end" className="fill-ink text-[11px] font-medium" style={HALO}>
                  {`${fmtMonthIndex(monthIndexOfDay(lastNonNull.day)).slice(0, 3)} ${dateOfDay(lastNonNull.day).year}: ${fx(lastNonNull.value as number, 1)}`}
                </text>
                {data.rec.map((r) => {
                  const [x0, x1] = clipped(r[0], r[1]);
                  const label = recessionLabel(r, dateOfDay);
                  const startsAtEdge = r[0] <= 0;
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
            {X(dayOf(1995, 0, 1)) - ml >= 40 && (
              <text x={ml} y={axisY + 14} textAnchor="start" className="fill-ink-muted font-mono text-[11px]">1991</text>
            )}
            {years.map((y) => (
              <g key={y}>
                <line x1={X(dayOf(y, 0, 1))} x2={X(dayOf(y, 0, 1))} y1={axisY} y2={axisY + 4} stroke="var(--line-strong)" />
                <text x={X(dayOf(y, 0, 1))} y={axisY + 14} textAnchor="middle" className="fill-ink-muted font-mono text-[11px]">{y}</text>
              </g>
            ))}

            {/* President band (always on) */}
            <text x={ml - 7} y={bandY + 12.5} textAnchor="end" className="fill-ink-muted text-[11px]" opacity={showCong ? 1 : 0}>
              {hero ? "President" : "Pres."}
            </text>
            {data.terms.map((t, i) => {
              const x0 = X(t.s);
              const x1 = X(t.e);
              const text = termText(t, x1 - x0, hero);
              return (
                <g key={t.termId} opacity={term === null || term === i ? 1 : 0.35}>
                  <title>{`${t.full}, ${t.startYear} to ${t.endYear ?? "present"}`}</title>
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
                    <text x={ml - 7} y={y + 9.5} textAnchor="end" className="fill-ink-muted text-[11px]">
                      {ch === "house" ? "House" : "Senate"}
                    </text>
                    {data.control[ch].map((c) => {
                      const x0 = X(c.s);
                      const x1 = X(c.e);
                      return (
                        <g key={c.s}>
                          <rect x={x0} y={y} width={Math.max(0.5, x1 - x0 - 0.5)} height={ROW_H} fill={party(c.party)} />
                          {x1 - x0 >= 16 && (
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
        )}
      </ChartFrame>
    </div>
  );
}
