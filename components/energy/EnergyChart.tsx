"use client";

import { memo, useEffect, useId, useMemo, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { ExtremeMarks, type ExtremeMark } from "@/components/charts/ExtremeMarks";
import { Tooltip, useTooltip } from "@/components/charts/Tooltip";
import { findExtremes, type ExtremePoint } from "@/lib/chart-extremes";
import { yGutter } from "@/lib/chart-bars";
import { dayFromFraction } from "@/lib/indicator-lookup";
import { dateOfDay, MONTH_ABBR } from "@/lib/indicator-time";
import { stackPanels, panelAtY } from "@/lib/energy-chart";
import { flagInputs as toFlagInputs, layoutFlags, laggedNote, AUTHORITY_LABEL, KIND_LABEL, dateText } from "@/lib/energy-derive";
import type { EnergyFlag } from "@/lib/energy-types";
import { lanesUsed } from "@/lib/trade-flags";
import type { Scale } from "@/lib/trade-chart";
import { useElementWidth } from "@/lib/use-element-width";
import { BAND_H, PresidentAndCongress, RecessionLabels, RecessionShading, YearAxis, type Era } from "@/components/trade/EraLayers";
import { activeDay, useEnergyActions, useEnergyValues } from "./EnergyState";

/** What one panel needs to be drawn on the shared axis. */
export interface PanelGeom {
  X: (day: number) => number;
  Y: (value: number) => number;
  ml: number;
  pw: number;
  top: number;
  bottom: number;
  clipId: string;
  /** Narrow chart (phone): no room for a label gutter. */
  compact: boolean;
  /** Pixel x where the hatched preliminary stretch starts (or the plot's right edge when there is none). */
  prelimX: number;
}

export interface Panel {
  id: string;
  /** One line above the plot, longest wording first; the first that fits the plot width is drawn, so a caption is shortened on a phone rather than cut off (rule 10). Required for every panel after the first. */
  caption?: string | readonly string[];
  /** Plot height on wide and on narrow charts. */
  h: number;
  hCompact: number;
  scale: Scale;
  fmtTick: (v: number) => string;
  /** The panel's marks, drawn inside its clip. */
  render: (g: PanelGeom) => ReactNode;
  /** Peak and low of one line inside the window (rule 12). Omit where a chart has several lines or a stack. */
  extremes?: { points: readonly ExtremePoint[]; label: (value: number, month: string) => string };
  /** One example value per line, for a panel with two or more lines: a coloured "Mar 2020: 20.4M" label on each line, picked from the window. */
  examples?: { points: readonly ExtremePoint[]; color: string; label: (value: number, month: string) => string }[];
  /** Labels drawn above the marks and the hatch, outside the clip (so they may sit in the right gutter). */
  renderLabels?: (g: PanelGeom) => ReactNode;
  /** Draw the preliminary hatch over the marks (a filled stack would hide it underneath), in the surface colour. */
  hatchOnTop?: boolean;
  /** Dots on the crosshair at a date. */
  dotsAt?: (day: number) => { day: number; value: number | null; color: string }[];
}

interface Props {
  panels: readonly Panel[];
  era: Era;
  view: readonly [number, number];
  flags: readonly EnergyFlag[];
  /** The preliminary stretch, in axis days (hatched across every panel), or null when every month is final. */
  prelim: { from: number; to: number } | null;
  ariaLabel: string;
  legend?: ReactNode;
  /** Pixels reserved right of the plot for labels, on wide charts only (e.g. band names). */
  rightGutter?: number;
  /** Tooltip content for an axis day. */
  renderTip: (day: number) => ReactNode;
}

const LANE_H = 15;
const COMPACT_W = 600;
const REC_LABEL_H = 12;
const CAPTION_CHAR_W = 6;

function layout(W: number, panels: readonly Panel[], flagIn: ReturnType<typeof toFlagInputs>, view: readonly [number, number], span: number, rightGutter: number) {
  const compact = W < COMPACT_W;
  const ml = yGutter(panels.flatMap((p) => p.scale.ticks.map(p.fmtTick)));
  const mr = 12 + (compact ? 0 : rightGutter);
  const pw = W - ml - mr;
  const X = (day: number) => ml + ((day - view[0]) / (view[1] - view[0])) * pw;
  const placed = layoutFlags(flagIn, { X, viewStart: view[0], viewEnd: view[1], span, plotLeft: ml, plotRight: ml + pw, labels: !compact });
  const lanes = lanesUsed(placed);
  const flagH = lanes ? lanes * LANE_H + 6 : 0;
  const mt = flagH + REC_LABEL_H + 4;
  const captions = panels.map((p) => {
    if (!p.caption) return null;
    const options = typeof p.caption === "string" ? [p.caption] : p.caption;
    return options.find((c) => c.length * CAPTION_CHAR_W <= pw) ?? options[options.length - 1];
  });
  const stack = stackPanels(panels.map((p, i) => ({ h: compact ? p.hCompact : p.h, caption: i > 0 || captions[i] !== null })), mt);
  const bandY = stack.axisY + 23;
  const Ys = panels.map((p, i) => (v: number) => stack.tops[i] + ((p.scale.hi - v) / (p.scale.hi - p.scale.lo)) * (stack.bottoms[i] - stack.tops[i]));
  return { ml, pw, mt, X, Ys, stack, placed, compact, captions, bandY, height: bandY + BAND_H + 8 };
}

type Geo = ReturnType<typeof layout>;

interface StaticProps {
  W: number;
  panels: readonly Panel[];
  era: Era;
  view: readonly [number, number];
  prelim: Props["prelim"];
  geo: Geo;
  uid: string;
  onFlag: (ids: string[], e: ReactPointerEvent | ReactMouseEvent, click?: boolean) => void;
  onFlagLeave: () => void;
}

const StaticLayer = memo(function StaticLayer({ panels, era, view, prelim, geo, uid, onFlag, onFlagLeave }: StaticProps) {
  const { toggleRange } = useEnergyActions();
  const { ml, pw, X, Ys, stack, placed, bandY } = geo;
  const hatchId = `hatch-${uid}`;
  const [vs, ve] = view;
  const hatchX0 = prelim ? X(Math.max(vs, prelim.from)) : 0;
  const hatchX1 = prelim ? X(Math.min(ve, prelim.to)) : 0;
  return (
    <>
      <defs>
        <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" style={{ stroke: "var(--ink)", strokeWidth: 1.2, strokeOpacity: 0.16 }} />
        </pattern>
        <pattern id={`${hatchId}s`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" style={{ stroke: "var(--surface)", strokeWidth: 2.2, strokeOpacity: 0.75 }} />
        </pattern>
        {panels.map((p, i) => (
          <clipPath key={p.id} id={`clip-${uid}-${p.id}`}>
            <rect x={ml} y={stack.tops[i] - 2} width={pw} height={stack.bottoms[i] - stack.tops[i] + 4} />
          </clipPath>
        ))}
      </defs>
      {panels.map((p, i) => (
        <RecessionShading key={`r${p.id}`} era={era} view={view} X={X} top={stack.tops[i]} height={stack.bottoms[i] - stack.tops[i]} />
      ))}
      {panels.map((p, i) => {
        const Y = Ys[i];
        const geom = (k: number): PanelGeom => ({ X, Y: Ys[k], ml, pw, top: stack.tops[k], bottom: stack.bottoms[k], clipId: `clip-${uid}-${panels[k].id}`, compact: geo.compact, prelimX: prelim ? Math.min(ml + pw, X(Math.max(vs, prelim.from))) : ml + pw });
        return (
          <g key={p.id}>
            {geo.captions[i] && stack.captionYs[i] !== null && <text x={ml} y={stack.captionYs[i] as number} className="fill-ink-muted text-[11px]">{geo.captions[i]}</text>}
            {prelim && hatchX1 > hatchX0 && !p.hatchOnTop && (
              <g>
                <rect x={hatchX0} y={stack.tops[i]} width={hatchX1 - hatchX0} height={stack.bottoms[i] - stack.tops[i]} fill={`url(#${hatchId})`} />
                {i === 0 && hatchX1 - hatchX0 >= 70 && (
                  <text x={(hatchX0 + hatchX1) / 2} y={stack.tops[i] + 11} textAnchor="middle" className="fill-ink-muted text-[10px]">Preliminary</text>
                )}
              </g>
            )}
            {p.scale.ticks.map((v) => (
              <g key={v}>
                <line x1={ml} x2={ml + pw} y1={Y(v)} y2={Y(v)} className={v === 0 ? "zero-line" : "grid-line"} />
                <text x={ml - 6} y={Y(v) + 3.5} textAnchor="end" className="fill-ink-muted font-mono text-[11px]">{p.fmtTick(v)}</text>
              </g>
            ))}
            <g clipPath={`url(#clip-${uid}-${p.id})`}>{p.render(geom(i))}</g>
            {prelim && hatchX1 > hatchX0 && p.hatchOnTop && (
              <g pointerEvents="none">
                <rect x={hatchX0} y={stack.tops[i]} width={hatchX1 - hatchX0} height={stack.bottoms[i] - stack.tops[i]} fill={`url(#${hatchId}s)`} />
                {i === 0 && hatchX1 - hatchX0 >= 70 && (
                  <text x={(hatchX0 + hatchX1) / 2} y={stack.tops[i] + 11} textAnchor="middle" className="fill-ink text-[10px] font-medium" style={{ stroke: "var(--surface)", strokeWidth: 3, paintOrder: "stroke" }}>Preliminary</text>
                )}
            {p.renderLabels?.(geom(i))}
              </g>
            )}
          </g>
        );
      })}
      <YearAxis view={view} X={X} left={ml} plotW={pw} axisY={stack.axisY} />
      <PresidentAndCongress era={era} view={view} X={X} left={ml} bandY={bandY} houseY={0} senateY={0} showCong={false} toggleRange={toggleRange} />
      <RecessionLabels era={era} view={view} X={X} y={geo.mt - 3} />

      {/* Action flags: a line down the plot, its label (or number) in a lane above. */}
      {placed.map((p) => {
        const labelY = (p.lane + 1) * LANE_H - 4;
        return (
          <g
            key={p.ids.join("+")}
            data-flag-hit
            className={p.number !== null ? "cursor-pointer" : "cursor-default"}
            onPointerEnter={(e) => e.pointerType === "mouse" && onFlag(p.ids, e)}
            onPointerMove={(e) => {
              e.stopPropagation();
              if (e.pointerType === "mouse") onFlag(p.ids, e);
            }}
            onPointerLeave={onFlagLeave}
            onClick={(e) => {
              e.stopPropagation();
              onFlag(p.ids, e, true);
            }}
          >
            <line x1={p.x} x2={p.x} y1={labelY + 3} y2={stack.axisY} stroke="var(--accent)" strokeWidth={p.priority === 1 ? 1.4 : 1} strokeDasharray={p.priority === 1 ? undefined : "3 3"} opacity={p.priority === 1 ? 0.9 : 0.65} />
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
            <rect x={p.x - 5} y={labelY - 12} width={10} height={stack.axisY - labelY + 12} fill="transparent" />
          </g>
        );
      })}
    </>
  );
});

const EX_CHAR_W = 6.3;
const EX_HALO = { stroke: "var(--surface)", strokeWidth: 3, paintOrder: "stroke" } as const;

/** One example value per line of a multi-line panel, three quarters of the way across the window (clear of the edge and the hatch). The highest line's label sits above it, the rest below. */
function Examples({ panels, geo, view }: { panels: readonly Panel[]; geo: Geo; view: readonly [number, number] }) {
  const v = useEnergyValues();
  const faded = activeDay(v) !== null;
  const target = view[0] + (view[1] - view[0]) * 0.75;
  return (
    <>
      {panels.map((p, i) => {
        if (!p.examples) return null;
        const picks = p.examples.flatMap((ex) => {
          const inView = ex.points.filter((q) => q.value !== null && q.day >= view[0] && q.day < view[1]);
          if (inView.length === 0) return [];
          const pt = inView.reduce((a, b) => (Math.abs(b.day - target) < Math.abs(a.day - target) ? b : a));
          const { year, month } = dateOfDay(pt.day);
          return [{ color: ex.color, x: geo.X(pt.day), value: pt.value as number, text: ex.label(pt.value as number, `${MONTH_ABBR[month]} ${year}`) }];
        });
        const top = Math.max(...picks.map((q) => q.value));
        const left = geo.ml;
        const right = geo.ml + geo.pw;
        return (
          <g key={p.id} pointerEvents="none" opacity={faded ? 0.25 : 1} style={{ transition: "opacity .12s" }}>
            {picks.map((q) => {
              const y = geo.Ys[i](q.value);
              const w = q.text.length * EX_CHAR_W;
              const cx = Math.min(Math.max(q.x, left + w / 2 + 2), right - w / 2 - 2);
              const ty = Math.min(Math.max(q.value === top ? y - 9 : y + 17, geo.stack.tops[i] + 10), geo.stack.bottoms[i] - 4);
              return (
                <g key={q.color + q.x}>
                  <circle cx={q.x} cy={y} r={3.5} fill={q.color} stroke="var(--surface)" strokeWidth={1.5} />
                  <text x={cx} y={ty} textAnchor="middle" className="fill-ink text-[11px] font-medium" style={EX_HALO}>{q.text}</text>
                </g>
              );
            })}
          </g>
        );
      })}
    </>
  );
}

/** Peak and low of each panel's designated line inside the window. Fades while a date is hovered or pinned. */
function Marks({ panels, geo, view }: { panels: readonly Panel[]; geo: Geo; view: readonly [number, number] }) {
  const v = useEnergyValues();
  const marks = useMemo(() => {
    const out: ExtremeMark[][] = panels.map((p, i) => {
      if (!p.extremes) return [];
      const pts = p.extremes.points.filter((q) => q.day >= view[0] && q.day < view[1]);
      const { peak, low } = findExtremes(pts);
      const list: ExtremeMark[] = [];
      for (const [pt, kind] of [[peak, "peak"], [low, "low"]] as const) {
        if (!pt || pt.value === null) continue;
        const { year, month } = dateOfDay(pt.day);
        list.push({ kind, x: geo.X(pt.day), y: geo.Ys[i](pt.value), text: p.extremes.label(pt.value, `${MONTH_ABBR[month]} ${year}`) });
      }
      return list;
    });
    return out;
  }, [panels, geo, view]);
  return (
    <>
      {marks.map((m, i) => m.length > 0 && <ExtremeMarks key={panels[i].id} marks={m} left={geo.ml} right={geo.ml + geo.pw} top={geo.stack.tops[i]} bottom={geo.stack.bottoms[i]} faded={activeDay(v) !== null} />)}
    </>
  );
}

function Overlay({ panels, geo, view }: { panels: readonly Panel[]; geo: Geo; view: readonly [number, number] }) {
  const v = useEnergyValues();
  const day = activeDay(v);
  if (day === null || day < view[0] || day >= view[1]) return null;
  const x = geo.X(day);
  return (
    <g pointerEvents="none">
      <line x1={x} x2={x} y1={geo.stack.tops[0]} y2={geo.stack.axisY} stroke="var(--accent)" strokeWidth={v.hover === null ? 1.5 : 1} />
      {panels.map((p, i) =>
        p.dotsAt?.(day).map((d, j) =>
          d.value === null ? null : <circle key={`${p.id}${j}`} cx={geo.X(d.day)} cy={geo.Ys[i](d.value)} r={4} fill={d.color} stroke="var(--surface)" strokeWidth={1.5} />,
        ),
      )}
    </g>
  );
}

/** Tooltip body for a flag cluster: every action in it, with its authority, what happened, and the "enabled, not caused" note where it applies. */
function FlagNote({ flags }: { flags: readonly EnergyFlag[] }) {
  const sorted = [...flags].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="flex max-w-[22rem] flex-col gap-2.5 text-[0.78rem]">
      {sorted.map((f) => (
        <div key={f.id} className="flex flex-col gap-0.5">
          <div className="font-medium">{dateText(f.date)} · {f.label}</div>
          <div className="opacity-75">{[AUTHORITY_LABEL[f.authority], KIND_LABEL[f.kind]].filter(Boolean).join(" · ")}</div>
          <div>{f.description}</div>
          {f.lagged && <div className="italic opacity-90">{laggedNote(f.date)}</div>}
        </div>
      ))}
    </div>
  );
}

/**
 * The shared energy time chart: one or two panels on one day axis with recession shading, a year axis, the
 * president band, curated action flags (numbered and tap-to-pin on narrow charts, rule 6), a hatched preliminary
 * stretch, peak/low labels and a linked crosshair. Cards supply the panels' marks and the tooltip.
 */
export function EnergyChart({ panels, era, view, flags, prelim, ariaLabel, legend, rightGutter = 0, renderTip }: Props) {
  const uid = useId().replace(/:/g, "");
  const [wrapRef, measured] = useElementWidth<HTMLDivElement>();
  const W = measured || 1140;
  const flagIn = useMemo(() => toFlagInputs(flags), [flags]);
  const geo = useMemo(() => layout(W, panels, flagIn, view, era.span, rightGutter), [W, panels, flagIn, view, era.span, rightGutter]);
  const { moveHover, leaveHover, pinDay } = useEnergyActions();
  const tip = useTooltip<number>();
  const flagTip = useTooltip<string[]>();
  const [pinned, setPinned] = useState(false);
  const { hide: hideFlagTip } = flagTip;
  const unpin = () => {
    setPinned(false);
    hideFlagTip();
  };
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
    if (!panelAtY(geo.stack, (e.clientY - r.top) * k)) return null;
    return dayFromFraction(((e.clientX - r.left) * k - geo.ml) / geo.pw, view[1] - view[0], view[0]);
  };

  return (
    <div ref={wrapRef} className="-mx-3 sm:mx-0">
      <ChartFrame
        width={W}
        height={geo.height}
        margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
        ariaLabel={ariaLabel}
        svgProps={{ style: { touchAction: "pan-y" } }}
        onPointerMove={(e) => {
          const d = dayAt(e);
          if (e.pointerType === "touch") {
            if (d !== null) pinDay(d);
            return;
          }
          if (d === null) {
            leaveHover();
            tip.hide();
          } else {
            moveHover(d);
            if (!pinned) {
              tip.show(d, e);
              hideFlagTip();
            }
          }
        }}
        onPointerLeave={() => {
          leaveHover();
          tip.hide();
          if (!pinned) hideFlagTip();
        }}
        onClick={(e) => {
          const d = dayAt(e);
          if (d !== null) pinDay(d);
        }}
      >
        {() => (
          <>
            <StaticLayer
              W={W}
              panels={panels}
              era={era}
              view={view}
              prelim={prelim}
              geo={geo}
              uid={uid}
              onFlag={(ids, e, click) => {
                tip.hide();
                if (click) {
                  if (pinned && flagTip.state?.data.join() === ids.join()) return unpin();
                  setPinned(true);
                } else if (pinned) return;
                flagTip.show(ids, e);
              }}
              onFlagLeave={() => !pinned && hideFlagTip()}
            />
            <Marks panels={panels} geo={geo} view={view} />
            <Examples panels={panels} geo={geo} view={view} />
            <Overlay panels={panels} geo={geo} view={view} />
          </>
        )}
      </ChartFrame>
      {legend}
      <Tooltip state={tip.state}>{(day) => renderTip(day)}</Tooltip>
      <Tooltip state={flagTip.state}>{(ids) => <FlagNote flags={ids.map((id) => byId.get(id)).filter((f): f is EnergyFlag => !!f)} />}</Tooltip>
    </div>
  );
}

