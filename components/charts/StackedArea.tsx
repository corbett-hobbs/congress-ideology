"use client";

import { useMemo, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { scaleLinear } from "d3-scale";
import { Axis } from "./Axis";
import { ChartFrame } from "./ChartFrame";
import { ControlRowsSvg, controlRowsHeight, type ControlRow } from "./ControlRowsSvg";
import { Tooltip, useStickyTooltip } from "./Tooltip";
import { TERM_BAND_H, TermBandSvg, type TermSegment } from "./TermBandSvg";
import { SEGMENT_LABEL_STYLE, Y_GUTTER, yearLabelEvery } from "@/lib/chart-bars";
import { niceStep, type Stack } from "@/lib/decisions-derive";
import { placeBandLabels } from "@/lib/energy-chart";
import { useElementWidth } from "@/lib/use-element-width";

const AXIS_H = 34;
const TOP = 22;
const GUTTER_W = 92;
const WIDE_W = 520;
const CAPTION_CHAR_W = 6;

export interface StackedAreaProps {
  /** One key per slot, left to right (a term, a Congress). */
  slots: readonly number[];
  /** Cumulative edges per band, from `buildStacks`; `vis` lists the bands drawn. */
  stacks: Stack;
  vis: readonly number[];
  mode: "share" | "count";
  colors: readonly string[];
  /** Short names, drawn in the band or the right gutter. */
  shortLabels: readonly string[];
  /** Long names, for the gutter button's accessible name. */
  longLabels: readonly string[];
  /** Axis captions for this mode, longest first; the first that fits is drawn. */
  captions: readonly string[];
  segments: readonly TermSegment[];
  /** Years a slot spans (a Congress = 2): year labels then fall every few slots from the first. */
  slotYears?: number;
  /** Label under a slot's tick; defaults to the key. */
  tickLabel?: (slot: number) => string;
  controlRows?: readonly ControlRow[];
  hover: number | null;
  pin: number | null;
  moveHover: (slot: number) => void;
  leaveHover: () => void;
  togglePin: (slot: number) => void;
  pinTerm: (slot: number) => void;
  clearPin: () => void;
  /** The band drawn alone, if any; a gutter name click calls `onIso`. */
  iso: number | null;
  onIso: (band: number) => void;
  ariaLabel: string;
  pickLabel: string;
  renderTooltip: (slot: number) => ReactNode;
}

/**
 * A stacked area over slots (Decisions: one per term; Laws: one per Congress): bands as a share of the slot or as a count.
 * Band names sit inside the band where it is thick enough (`placeBandLabels`, the same placement the electricity chart uses) and
 * otherwise in a right gutter on wide charts. An isolated band draws alone from zero on its own axis. Hover, pin, the
 * presidential-term band and optional party-control strips are shared with the card above it.
 */
export function StackedArea({
  slots: terms,
  stacks,
  vis,
  mode: eff,
  colors,
  shortLabels,
  longLabels,
  captions,
  segments: segs,
  slotYears = 1,
  tickLabel = String,
  controlRows,
  hover,
  pin,
  moveHover,
  leaveHover,
  togglePin,
  pinTerm,
  clearPin,
  iso,
  onIso,
  ariaLabel,
  pickLabel,
  renderTooltip,
}: StackedAreaProps) {
  const [wrapRef, measured] = useElementWidth<HTMLDivElement>();
  const tip = useStickyTooltip<number>();
  const width = measured || 960;
  const wide = width >= WIDE_W;

  const ctlH = controlRowsHeight(controlRows);
  const ph = width < 560 ? 230 : 290;
  const margin = { top: TOP, left: Y_GUTTER, right: wide ? GUTTER_W : 6, bottom: AXIS_H + TERM_BAND_H + 6 + ctlH };
  const height = ph + margin.top + margin.bottom;
  const n = terms.length;
  const pw = width - margin.left - margin.right;
  const step = pw / Math.max(1, n);
  const X = (i: number) => i * step + step / 2;

  const stepY = eff === "share" ? 25 : niceStep(stacks.max);
  const top = eff === "share" ? 100 : Math.ceil(stacks.max / stepY) * stepY;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += stepY) ticks.push(v);
  const y = scaleLinear().domain([0, top]).range([ph, 0]);
  const Yv = (v: number) => y(v);
  const caption = captions.find((c) => c.length * CAPTION_CHAR_W <= pw) ?? captions[captions.length - 1];
  const every = yearLabelEvery(step / slotYears);
  const tickEvery = slotYears > 1 ? Math.ceil(every / slotYears) : every;

  const placed = useMemo(
    () =>
      placeBandLabels(
        vis.map((k) => ({
          key: String(k),
          width: shortLabels[k].length * 6.8 + 14,
          samples: terms.map((_, i) => ({ x: X(i), y0: Yv(stacks.lo[k][i]), y1: Yv(stacks.up[k][i]) })),
        })),
        { maxX: pw, gutterX: pw + 14, useGutter: wide },
      ),
    // X, Yv are pure functions of the deps below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vis, terms, stacks, pw, wide, ph, top, step],
  );

  const termAt = (e: { clientX: number; currentTarget: Element }) => {
    const b = e.currentTarget.getBoundingClientRect();
    const i = Math.min(n - 1, Math.max(0, Math.floor(((e.clientX - b.left) / Math.max(1, b.width)) * n)));
    return terms[i];
  };
  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const t = termAt(e);
    if (e.pointerType === "mouse") moveHover(t);
    if (e.pointerType === "mouse" || e.buttons) tip.show(t, e);
    tip.move(e);
  };
  const onKey = (e: KeyboardEvent<SVGRectElement>) => {
    if (e.key === "Escape") return clearPin();
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const i = pin === null ? -1 : terms.indexOf(pin);
    pinTerm(i < 0 ? (dir > 0 ? terms[0] : terms[n - 1]) : terms[Math.min(n - 1, Math.max(0, i + dir))]);
  };

  const lineAt = (t: number | null, strong: boolean) => {
    const i = t === null ? -1 : terms.indexOf(t);
    return i < 0 ? null : (
      <line x1={X(i)} x2={X(i)} y1={0} y2={ph} stroke="var(--ink)" strokeWidth={strong ? 1.5 : 1.25} strokeDasharray={strong ? "4 3" : "3 3"} opacity={strong ? 0.85 : 0.5} pointerEvents="none" />
    );
  };

  return (
    <div ref={wrapRef} data-sticky-tip className="relative -mx-3 sm:mx-0">
      <ChartFrame
        width={width}
        height={height}
        margin={margin}
        ariaLabel={ariaLabel}
        onPointerLeave={(e) => {
          tip.leave(e);
          if (e.pointerType === "mouse") leaveHover();
        }}
      >
        {() => (
          <>
            <Axis scale={y} orientation="left" ticks={ticks} offset={0} gridExtent={pw} format={(v) => (eff === "share" ? (v === 0 ? "0" : `${v}%`) : String(v))} zeroAt={0} />
            <text className="axis-caption" x={0} y={-8} textAnchor="start">
              {caption}
            </text>

            {vis.map((k) => {
              const pts = (arr: readonly number[]) => [[0, arr[0]], ...arr.map((v, i) => [X(i), v]), [pw, arr[n - 1]]] as const;
              const U = pts(stacks.up[k]);
              const L = [...pts(stacks.lo[k])].reverse();
              const d = `M${U.map((p) => `${p[0].toFixed(1)} ${Yv(p[1]).toFixed(1)}`).join("L")}L${L.map((p) => `${p[0].toFixed(1)} ${Yv(p[1]).toFixed(1)}`).join("L")}Z`;
              return <path key={k} d={d} fill={colors[k]} stroke="var(--surface)" strokeWidth={0.6} strokeLinejoin="round" />;
            })}

            {/* Band names: inside where the band is thick enough, else in the right gutter (wide charts; phones use the legend). */}
            <g>
              {vis.map((k) => {
                const l = placed.get(String(k));
                if (!l) return null;
                return l.inside ? (
                  <text key={k} x={l.x} y={l.y + 4} textAnchor="middle" style={SEGMENT_LABEL_STYLE}>
                    {shortLabels[k]}
                  </text>
                ) : (
                  <g key={k} className="cursor-pointer" role="button" tabIndex={0} aria-label={`Show only ${longLabels[k]}`} aria-pressed={iso === k} onClick={() => onIso(k)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onIso(k))} opacity={iso !== null && iso !== k ? 0.4 : 1}>
                    <rect x={l.x - 8} y={l.y - 5} width={8} height={10} rx={1.5} fill={colors[k]} />
                    <text x={l.x + 3} y={l.y + 4} className="fill-ink text-[11px]">
                      {shortLabels[k]}
                    </text>
                  </g>
                );
              })}
            </g>

            {lineAt(hover !== pin ? hover : null, false)}
            {lineAt(pin, true)}

            {/* Year ticks (rule 10h) and the presidential-term band (rule 10j). */}
            {terms.map((t, i) =>
              (slotYears > 1 ? i % tickEvery === 0 : t % every === 0) ? (
                <g key={t} transform={`translate(${X(i)},${ph})`}>
                  <line className="grid-line" y1={0} y2={5} />
                  <text className="axis-tick-label" y={18} textAnchor="middle">
                    {tickLabel(t)}
                  </text>
                </g>
              ) : null,
            )}
            <TermBandSvg segments={segs} x0={0} step={step} y={ph + AXIS_H + 6} />
            {controlRows && controlRows.length > 0 && <ControlRowsSvg rows={controlRows} x0={0} step={step} y={ph + AXIS_H + 6 + TERM_BAND_H + 6} />}

            <rect
              x={0}
              y={0}
              width={pw}
              height={ph}
              fill="transparent"
              role="button"
              tabIndex={0}
              aria-label={pickLabel}
              className="cursor-pointer outline-none focus-visible:[stroke:var(--focus)] focus-visible:[stroke-width:2]"
              onPointerMove={onMove}
              onPointerDown={(e) => {
                if (e.pointerType === "mouse") return;
                const t = termAt(e);
                tip.down(e, tip.state?.data === t);
                tip.show(t, e);
              }}
              onPointerUp={tip.up}
              onPointerCancel={tip.moved}
              onClick={(e) => togglePin(termAt(e))}
              onKeyDown={onKey}
            />
          </>
        )}
      </ChartFrame>
      <Tooltip state={tip.state}>{renderTooltip}</Tooltip>
    </div>
  );
}
