"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { scaleLinear } from "d3-scale";
import { Axis } from "@/components/charts/Axis";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { Tooltip, useTooltip } from "@/components/charts/Tooltip";
import { findExtremes } from "@/lib/chart-extremes";
import { useElementWidth } from "@/lib/use-element-width";
import { REGIONS } from "@/lib/troops-regions";
import { formatCount, formatCountAxis, formatCountCompact, measureLabel, niceCountTicks, termAtQuarter, type RegionStack } from "@/lib/troops-derive";
import { MEASURES } from "@/lib/troops-types";
import { useTroopsState } from "./TroopsState";

const NARROW_W = 520;
const AXIS_H = 18;
const BAND_H = 20;

const MARKER_NOTES = {
  break: {
    title: "Dec 2017: what is counted changes",
    body: "Through Sep 2017 these counts include personnel deployed in support of contingency operations. From Dec 2017 DMDC counts only personnel permanently assigned to a location. Overseas active duty fell by about 53,000 between the two quarters while the U.S. total rose: a reallocation, not a withdrawal. Afghanistan, Iraq and Syria print as blank, not zero, until Sep 2021. Compare across this line with care.",
  },
  army: {
    title: "Dec 2022 to Jun 2023: Army did not report",
    body: "The Army did not provide personnel data for these three quarters (a personnel-system conversion), so there is no all-branch or Army figure. The other branches are shown.",
  },
} as const;
type MarkerId = keyof typeof MARKER_NOTES;

/**
 * Stacked bars by region, one per reported quarter, on a true quarter axis (the Sep 2008 to Sep 2012 tables are
 * annual, so those years have one bar and empty quarters between), with a presidential-term band under the axis.
 * Reads the shared state: the window (President), the branch, and the Country filter (that place's own troops).
 * Click or drag picks the quarter; arrow keys move it when the chart has focus. Two numbered markers (tap to pin)
 * flag the Dec 2017 break and the Army-not-reported quarters.
 */
export function TroopsChart({ stacks }: { stacks: RegionStack[] }) {
  const { data, pi, range, setPeriod, country, measure } = useTroopsState();
  const { periods, terms, places, breakPeriod } = data.payload;
  const [wrapRef, measured] = useElementWidth<HTMLDivElement>();
  const width = measured || 960;
  const narrow = width < NARROW_W;
  const height = narrow ? 250 : 320;
  const ml = 10;
  const mr = 6;
  const mt = 30;
  const mb = AXIS_H + BAND_H + 6;
  const innerW = width - ml - mr;
  const innerH = height - mt - mb;
  const q0 = periods[range[0]].quarter;
  const q1 = periods[range[1]].quarter;
  const nSlots = q1 - q0 + 1;
  const step = innerW / nSlots;
  const bw = Math.min(Math.max(2, step * 0.72), 40);
  const slotOf = (i: number) => periods[i].quarter - q0;
  const xOf = (i: number) => slotOf(i) * step;
  const tip = useTooltip<number>();
  const [hover, setHover] = useState(-1);
  const down = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const max = Math.max(0, ...stacks.map((s) => s.total));
  const { ticks, top } = niceCountTicks(max);
  const y = scaleLinear().domain([0, top]).range([innerH, 0]);
  const byPi = new Map(stacks.map((s) => [s.pi, s]));
  const nearest = (e: { clientX: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    const slot = (e.clientX - r.left - ml) / step - 0.5;
    let best = range[0];
    for (let i = range[0]; i <= range[1]; i++) if (Math.abs(slotOf(i) - slot) < Math.abs(slotOf(best) - slot)) best = i;
    return best;
  };
  const onDown = (e: PointerEvent<SVGSVGElement>) => {
    down.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const i = nearest(e);
    setPeriod(i);
    tip.show(i, e);
  };
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const i = nearest(e);
    if (down.current) setPeriod(i);
    setHover(i);
    tip.show(i, e);
  };
  const onUp = () => {
    down.current = false;
  };
  const onLeave = () => {
    down.current = false;
    setHover(-1);
    tip.hide();
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const d = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : e.key === "Home" ? -999 : e.key === "End" ? 999 : 0;
    if (!d) return;
    e.preventDefault();
    setPeriod(Math.abs(d) === 999 ? (d < 0 ? range[0] : range[1]) : pi + d);
  };

  // Presidential terms by quarter-end date, so the band is continuous even where a year has no bar.
  const slots = Array.from({ length: nSlots }, (_, s) => termAtQuarter(terms, q0 + s));
  const runs: { term: number; s: number; e: number }[] = [];
  slots.forEach((t, s) => {
    if (t < 0) return;
    const last = runs[runs.length - 1];
    if (last && last.term === t && last.e === s - 1) last.e = s;
    else runs.push({ term: t, s, e: s });
  });

  // Peak and low of the drawn stacks (recomputed for the window, branch and country shown).
  const marks = (() => {
    const { peak, low } = findExtremes(stacks.map((s) => ({ day: s.pi, value: s.unavailable || s.total <= 0 ? null : s.total })));
    return [peak, low].flatMap((p) => (p && p.day !== pi ? [{ i: p.day, text: `${periods[p.day].label}: ${formatCountCompact(byPi.get(p.day)!.total)}` }] : []));
  })();
  const chipLabel = periods[pi].label;
  const chipW = chipLabel.length * 6.6;

  // Numbered markers.
  const markers: { id: MarkerId; n: number; x: number }[] = [];
  if (breakPeriod > range[0] && breakPeriod <= range[1]) markers.push({ id: "break", n: 0, x: xOf(breakPeriod) });
  const gap = data.payload.armyGap.filter((i) => i >= range[0] && i <= range[1]);
  if (gap.length) markers.push({ id: "army", n: 0, x: (xOf(gap[0]) + xOf(gap[gap.length - 1]) + step) / 2 });
  markers.forEach((m, k) => (m.n = k + 1));

  const [hoverMarker, setHoverMarker] = useState<MarkerId | null>(null);
  const [pinned, setPinned] = useState<MarkerId | null>(null);
  useEffect(() => {
    if (!pinned) return;
    const away = (e: Event) => {
      if (!(e.target as Element | null)?.closest("[data-marker]")) setPinned(null);
    };
    const esc = (e: globalThis.KeyboardEvent) => e.key === "Escape" && setPinned(null);
    const off = () => setPinned(null);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", off, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", off);
    };
  }, [pinned]);
  const open = markers.find((m) => m.id === (pinned ?? hoverMarker));

  const anyUnavailable = stacks.some((s) => s.unavailable);
  const countryName = country >= 0 ? places[country].name : null;

  return (
    <div
      ref={wrapRef}
      className="relative touch-scroll outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      tabIndex={0}
      onKeyDown={onKey}
      role="group"
      aria-label="Troops chart. Left and right arrow keys change the quarter."
    >
      <ChartFrame
        width={width}
        height={height}
        margin={{ top: mt, right: mr, bottom: mb, left: ml }}
        ariaLabel={`Stacked bars of active-duty personnel stationed abroad by region, ${periods[range[0]].label} to ${periods[range[1]].label}, ${MEASURES[measure].label}${countryName ? `, ${countryName} only` : ""}`}
        svgRef={svgRef}
        onPointerLeave={onLeave}
        svgProps={{ onPointerDown: onDown, onPointerMove: onMove, onPointerUp: onUp, onPointerCancel: onUp, style: { cursor: "crosshair", touchAction: "pan-y" } }}
      >
        {() => (
          <>
            <Axis scale={y} orientation="left" ticks={ticks} offset={0} gridExtent={innerW} format={formatCountAxis} zeroAt={0} />
            {pi >= range[0] && pi <= range[1] && (
              <rect x={xOf(pi) + (step - bw) / 2 - 2} y={-4} width={bw + 4} height={innerH + 4} rx={2} style={{ fill: "var(--surface-raised)", stroke: "var(--line-strong)" }} />
            )}
            {hover >= range[0] && hover <= range[1] && hover !== pi && (
              <rect x={xOf(hover) + (step - bw) / 2 - 2} y={-4} width={bw + 4} height={innerH + 4} rx={2} style={{ fill: "none", stroke: "var(--line-strong)", strokeDasharray: "3 3" }} />
            )}
            {markers.some((m) => m.id === "break") && (
              <line x1={xOf(breakPeriod)} x2={xOf(breakPeriod)} y1={0} y2={innerH} style={{ stroke: "var(--ink-muted)", strokeDasharray: "4 3", strokeWidth: 1 }} pointerEvents="none" />
            )}
            {stacks.map((s) => {
              const x = xOf(s.pi) + (step - bw) / 2;
              if (s.unavailable) {
                return <rect key={s.pi} x={x} y={4} width={bw} height={innerH - 4} rx={2} style={{ fill: "none", stroke: "var(--ink-faint)", strokeDasharray: "3 3" }} />;
              }
              let acc = 0;
              return (
                <g key={s.pi}>
                  {s.regions.map((v, k) => {
                    if (v <= 0) return null;
                    const y1 = y(acc + v);
                    const h = y(acc) - y1;
                    acc += v;
                    return <rect key={k} x={x} y={y1} width={bw} height={Math.max(h, 0)} style={{ fill: REGIONS[k].color }} />;
                  })}
                </g>
              );
            })}
            <g pointerEvents="none" opacity={hover >= 0 ? 0.25 : 1} style={{ transition: "opacity .12s" }}>
              {marks.map((m) => {
                const w = m.text.length * 6.3;
                const cx = Math.min(Math.max(xOf(m.i) + step / 2, w / 2 + 2), innerW - w / 2 - 2);
                let tall = byPi.get(m.i)!.total;
                for (const s of stacks) if (Math.abs(xOf(s.pi) + step / 2 - cx) <= w / 2 + bw / 2) tall = Math.max(tall, s.total);
                return (
                  <text key={m.i} x={cx} y={y(tall) - 6} textAnchor="middle" className="fill-ink text-[11px] font-medium" style={{ stroke: "var(--surface)", strokeWidth: 3, paintOrder: "stroke" }}>
                    {m.text}
                  </text>
                );
              })}
            </g>
            {/* Axis labels: January-quarter ticks are too dense across 70 quarters, so label whole years. */}
            {Array.from({ length: nSlots }, (_, s) => {
              const q = q0 + s;
              if (q % 4 !== 3) return null; // the Dec quarter closes a calendar year; label by its year
              const yr = Math.floor(q / 4);
              if (nSlots > 24 && yr % 2 !== 0 && s !== 0) return null;
              return (
                <text key={q} className="axis-tick-label" x={s * step + step / 2} y={innerH + 14} textAnchor="middle">
                  {yr}
                </text>
              );
            })}
            <g transform={`translate(0,${innerH + AXIS_H + 2})`}>
              {runs.map(({ term, s, e }) => {
                const t = terms[term];
                const c = t.party === "R" ? "--rep" : "--dem";
                const x = s * step;
                const w = (e - s + 1) * step;
                return (
                  <g key={`${term}-${s}`}>
                    <rect x={x + 0.5} y={0} width={Math.max(0, w - 1)} height={BAND_H} rx={2} style={{ fill: `color-mix(in oklab, var(${c}) 20%, var(--surface))` }} />
                    <rect x={x + 0.5} y={0} width={Math.max(0, w - 1)} height={2.5} style={{ fill: `var(${c})` }} />
                  </g>
                );
              })}
              {(() => {
                let nextStart = innerW + mr;
                const out = [];
                for (let k = runs.length - 1; k >= 0; k--) {
                  const { term, s, e } = runs[k];
                  const t = terms[term];
                  const x = s * step;
                  const w = (e - s + 1) * step;
                  const tw = t.last.length * 6.4;
                  let tx = Math.min(x + w / 2 - tw / 2, nextStart - 3 - tw, x + w - tw - 1);
                  tx = Math.max(tx, x + 1);
                  if ((tx + tw > nextStart - 2 && k < runs.length - 1) || tw > w + 14) continue;
                  nextStart = tx;
                  out.push(
                    <text key={`${term}-${s}`} x={tx} y={BAND_H - 5} style={{ fontSize: 11, fill: "var(--ink)" }}>
                      {t.last}
                    </text>,
                  );
                }
                return out;
              })()}
            </g>
            {pi >= range[0] && pi <= range[1] && (
              <text className="axis-tick-label" x={Math.min(Math.max(xOf(pi) + step / 2, chipW / 2), innerW - chipW / 2)} y={-14} textAnchor="middle" style={{ fill: "var(--ink)", fontWeight: 600 }}>
                {chipLabel}
              </text>
            )}
            {max <= 0 && !anyUnavailable && (
              <text x={innerW / 2} y={innerH / 2} textAnchor="middle" style={{ fill: "var(--ink-muted)", fontSize: 13 }}>
                No troops recorded for these filters in {periods[range[0]].label === periods[range[1]].label ? periods[range[0]].label : `${periods[range[0]].label} to ${periods[range[1]].label}`}.
              </text>
            )}
          </>
        )}
      </ChartFrame>

      {markers.map((m) => (
        <button
          key={m.id}
          type="button"
          data-marker=""
          aria-label={MARKER_NOTES[m.id].title}
          aria-expanded={open?.id === m.id}
          onPointerEnter={(e) => e.pointerType === "mouse" && setHoverMarker(m.id)}
          onPointerLeave={() => setHoverMarker(null)}
          onClick={() => setPinned((p) => (p === m.id ? null : m.id))}
          className="absolute grid size-[18px] -translate-x-1/2 place-items-center rounded-full border border-line-strong bg-surface-raised font-mono text-[0.62rem] font-semibold text-ink hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          style={{ left: ml + m.x, top: 2 }}
        >
          {m.n}
        </button>
      ))}
      {open && (
        <div
          data-marker=""
          role="note"
          className="absolute z-10 w-[min(21rem,calc(100%-1rem))] rounded-md border border-line-strong bg-surface p-3 text-[0.78rem] leading-[1.5] text-ink shadow-md"
          style={{ left: Math.min(Math.max(ml + open.x - 168, 0), Math.max(0, width - 340)), top: 26 }}
        >
          <b className="block font-semibold">{MARKER_NOTES[open.id].title}</b>
          <span className="text-ink-muted">{MARKER_NOTES[open.id].body}</span>
        </div>
      )}

      <Tooltip state={tip.state}>{(i) => <ChartTip i={i} stack={byPi.get(i)} measure={measure} />}</Tooltip>
    </div>
  );
}

function ChartTip({ i, stack, measure }: { i: number; stack: RegionStack | undefined; measure: number }) {
  const { data, country } = useTroopsState();
  const { periods, terms, places } = data.payload;
  const p = periods[i];
  const term = terms[p.term]?.last;
  const rowsOut = stack ? stack.regions.map((v, k) => [v, k] as const).filter(([v]) => v > 0).sort((a, b) => b[0] - a[0]) : [];
  return (
    <div>
      <div style={{ fontWeight: 600 }}>
        {p.label}
        {term ? ` · ${term}` : ""}
      </div>
      <div className="tt-mono" style={{ marginBottom: 4 }}>
        {p.basis === "includes_deployed" ? "includes deployed forces" : "permanently assigned only"}
        {country >= 0 ? ` · ${places[country].name}` : ""}
        {measure > 0 ? ` · ${measureLabel(measure)}` : ""}
      </div>
      {stack?.unavailable ? (
        <div>Army did not report this quarter, so there is no {measure === 0 ? "all-branch" : "Army"} figure.</div>
      ) : (
        <>
          {rowsOut.map(([v, k]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 14 }}>
              <span>
                <i style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, marginRight: 6, background: REGIONS[k].color, outline: "1px solid color-mix(in oklab, var(--bg) 40%, transparent)" }} />
                {REGIONS[k].label}
              </span>
              <span className="tt-mono">{formatCount(v)}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14, fontWeight: 600, borderTop: "1px solid color-mix(in oklab, var(--bg) 30%, transparent)", marginTop: 3, paddingTop: 3 }}>
            <span>Abroad</span>
            <span className="tt-mono">{formatCount(stack?.total ?? 0)}</span>
          </div>
          {p.suppressed.length > 0 && country < 0 && (
            <div className="tt-mono" style={{ marginTop: 4, opacity: 0.85 }}>
              Not reported (blank in source): {p.suppressed.map((n) => n).join(", ")}
            </div>
          )}
        </>
      )}
    </div>
  );
}
