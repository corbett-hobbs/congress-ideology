"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { scaleLinear } from "d3-scale";
import { Axis } from "@/components/charts/Axis";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { Tooltip, useTooltip } from "@/components/charts/Tooltip";
import { findExtremes } from "@/lib/chart-extremes";
import { useElementWidth } from "@/lib/use-element-width";
import { REGIONS } from "@/lib/troops-regions";
import { formatCount, formatCountAxis, formatCountCompact, measureLabel, niceCountTicks, type RegionStack } from "@/lib/troops-derive";
import { MEASURES } from "@/lib/troops-types";
import { useTroopsState } from "./TroopsState";

const NARROW_W = 520;
const AXIS_H = 18;
const BAND_H = 20;

const MARKER_NOTES = {
  break: {
    title: "FY2018 on: what is counted changes",
    body: "Through the Sep 2017 table (FY2017) these counts include personnel deployed in support of contingency operations. From the Dec 2017 table on, DMDC counts only personnel permanently assigned to a location, so FY2018 and later are on a different basis. Overseas active duty fell by about 53,000 between Sep and Dec 2017 while the U.S. total rose: a reallocation, not a withdrawal. Afghanistan, Iraq and Syria print as blank, not zero, until Sep 2021. Compare across this line with care.",
  },
  army: {
    title: "The Army did not report",
    body: "The Army did not provide personnel data for this year's table, so there is no all-branch or Army figure. The other branches are shown.",
  },
} as const;
type MarkerId = keyof typeof MARKER_NOTES;

/**
 * Stacked bars by region, one per fiscal year (each year's Sep 30 table; the year in progress shows its latest
 * quarter, hatched), with a presidential-term band under the axis like the other Presidency pages. Reads the shared
 * state: the window (President), the branch, and the Country filter (that place's own troops). Click or drag picks
 * the year; arrow keys move it when the chart has focus. A numbered marker (tap to pin) flags the Dec 2017 break.
 */
export function TroopsChart({ stacks }: { stacks: RegionStack[] }) {
  const { data, yi, range, setYear, country, measure } = useTroopsState();
  const { years, terms, places, breakYear } = data.payload;
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
  const n = range[1] - range[0] + 1;
  const step = innerW / n;
  const bw = Math.min(Math.max(2, step * 0.72), 64);
  const xOf = (i: number) => (i - range[0]) * step;
  const hatchId = useId().replace(/:/g, "");
  const tip = useTooltip<number>();
  const [hover, setHover] = useState(-1);
  const down = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const max = Math.max(0, ...stacks.map((s) => s.total));
  const { ticks, top } = niceCountTicks(max);
  const y = scaleLinear().domain([0, top]).range([innerH, 0]);
  const byYi = new Map(stacks.map((s) => [s.yi, s]));
  const indexAt = (e: { clientX: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return range[0] + Math.min(n - 1, Math.max(0, Math.floor((e.clientX - r.left - ml) / step)));
  };
  const onDown = (e: PointerEvent<SVGSVGElement>) => {
    down.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const i = indexAt(e);
    setYear(i);
    tip.show(i, e);
  };
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const i = indexAt(e);
    if (down.current) setYear(i);
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
    setYear(Math.abs(d) === 999 ? (d < 0 ? range[0] : range[1]) : yi + d);
  };

  const visible = terms.map((t) => ({ t, s: Math.max(t.from, range[0]), e: Math.min(t.to, range[1]) })).filter((o) => o.s <= o.e);

  // Peak and low of the drawn stacks (recomputed for the window, branch and country shown). Complete years only:
  // a partial year is always low.
  const marks = (() => {
    const { peak, low } = findExtremes(stacks.map((s) => ({ day: s.yi, value: s.unavailable || s.total <= 0 || years[s.yi].partial ? null : s.total })));
    return [peak, low].flatMap((p) => (p && p.day !== yi ? [{ i: p.day, text: `FY${years[p.day].fy}: ${formatCountCompact(byYi.get(p.day)!.total)}` }] : []));
  })();
  const sel = years[yi];
  const chipLabel = `FY${sel.fy}${sel.partial ? " · partial" : ""}`;
  const chipW = chipLabel.length * 6.6;

  // Numbered markers.
  const markers: { id: MarkerId; n: number; x: number }[] = [];
  if (breakYear > range[0] && breakYear <= range[1]) markers.push({ id: "break", n: 0, x: xOf(breakYear) });
  const gap = data.payload.armyGapYears.filter((i) => i >= range[0] && i <= range[1]);
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
  const labelEvery = step >= 30 ? 1 : step >= 15 ? 2 : 5;

  return (
    <div
      ref={wrapRef}
      className="relative touch-scroll outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      tabIndex={0}
      onKeyDown={onKey}
      role="group"
      aria-label="Troops chart. Left and right arrow keys change the fiscal year."
    >
      <ChartFrame
        width={width}
        height={height}
        margin={{ top: mt, right: mr, bottom: mb, left: ml }}
        ariaLabel={`Stacked bars of active-duty personnel stationed abroad by region, FY${years[range[0]].fy} to FY${years[range[1]].fy}, ${MEASURES[measure].label}${countryName ? `, ${countryName} only` : ""}`}
        svgRef={svgRef}
        onPointerLeave={onLeave}
        svgProps={{ onPointerDown: onDown, onPointerMove: onMove, onPointerUp: onUp, onPointerCancel: onUp, style: { cursor: "crosshair", touchAction: "pan-y" } }}
      >
        {() => (
          <>
            <defs>
              <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="6" style={{ stroke: "var(--surface)", strokeWidth: 2.2 }} />
              </pattern>
            </defs>
            <Axis scale={y} orientation="left" ticks={ticks} offset={0} gridExtent={innerW} format={formatCountAxis} zeroAt={0} />
            {yi >= range[0] && yi <= range[1] && <rect x={xOf(yi)} y={-4} width={step} height={innerH + 4} rx={2} style={{ fill: "var(--surface-raised)", stroke: "var(--line-strong)" }} />}
            {hover >= range[0] && hover <= range[1] && hover !== yi && (
              <rect x={xOf(hover)} y={-4} width={step} height={innerH + 4} rx={2} style={{ fill: "none", stroke: "var(--line-strong)", strokeDasharray: "3 3" }} />
            )}
            {markers.some((m) => m.id === "break") && (
              <line x1={xOf(breakYear)} x2={xOf(breakYear)} y1={0} y2={innerH} style={{ stroke: "var(--ink-muted)", strokeDasharray: "4 3", strokeWidth: 1 }} pointerEvents="none" />
            )}
            {stacks.map((s) => {
              const x = xOf(s.yi) + (step - bw) / 2;
              if (s.unavailable) {
                return <rect key={s.yi} x={x} y={4} width={bw} height={innerH - 4} rx={2} style={{ fill: "none", stroke: "var(--ink-faint)", strokeDasharray: "3 3" }} />;
              }
              let acc = 0;
              return (
                <g key={s.yi}>
                  {s.regions.map((v, k) => {
                    if (v <= 0) return null;
                    const y1 = y(acc + v);
                    const h = y(acc) - y1;
                    acc += v;
                    return <rect key={k} x={x} y={y1} width={bw} height={Math.max(h, 0)} style={{ fill: REGIONS[k].color }} />;
                  })}
                  {years[s.yi].partial && acc > 0 && (
                    <>
                      <rect x={x} y={y(acc)} width={bw} height={y(0) - y(acc)} fill={`url(#${hatchId})`} />
                      <rect x={x} y={y(acc)} width={bw} height={y(0) - y(acc)} style={{ fill: "none", stroke: "var(--ink-muted)", strokeDasharray: "3 2" }} />
                    </>
                  )}
                </g>
              );
            })}
            <g pointerEvents="none" opacity={hover >= 0 ? 0.25 : 1} style={{ transition: "opacity .12s" }}>
              {marks.map((m) => {
                const w = m.text.length * 6.3;
                const cx = Math.min(Math.max(xOf(m.i) + step / 2, w / 2 + 2), innerW - w / 2 - 2);
                let tall = byYi.get(m.i)!.total;
                for (const s of stacks) if (Math.abs(xOf(s.yi) + step / 2 - cx) <= w / 2 + bw / 2) tall = Math.max(tall, s.total);
                return (
                  <text key={m.i} x={cx} y={y(tall) - 6} textAnchor="middle" className="fill-ink text-[11px] font-medium" style={{ stroke: "var(--surface)", strokeWidth: 3, paintOrder: "stroke" }}>
                    {m.text}
                  </text>
                );
              })}
            </g>
            {stacks.map((s, i) =>
              i % labelEvery === 0 || s.yi === yi ? (
                <text key={s.yi} className="axis-tick-label" x={xOf(s.yi) + step / 2} y={innerH + 14} textAnchor="middle" style={s.yi === yi ? { fill: "var(--ink)", fontWeight: 600 } : undefined}>
                  {years[s.yi].fy}
                </text>
              ) : null,
            )}
            {/* Presidential terms: the administration in office for most of each fiscal year. Labels placed right to left so they never collide. */}
            <g transform={`translate(0,${innerH + AXIS_H + 2})`}>
              {visible.map(({ t, s, e }) => {
                const x = (s - range[0]) * step;
                const w = (e - s + 1) * step;
                const c = t.party === "R" ? "--rep" : "--dem";
                return (
                  <g key={t.termId}>
                    <rect x={x + 0.5} y={0} width={Math.max(0, w - 1)} height={BAND_H} rx={2} style={{ fill: `color-mix(in oklab, var(${c}) 20%, var(--surface))` }} />
                    <rect x={x + 0.5} y={0} width={Math.max(0, w - 1)} height={2.5} style={{ fill: `var(${c})` }} />
                  </g>
                );
              })}
              {(() => {
                let nextStart = innerW + mr;
                const out = [];
                for (let k = visible.length - 1; k >= 0; k--) {
                  const { t, s, e } = visible[k];
                  const x = (s - range[0]) * step;
                  const w = (e - s + 1) * step;
                  const tw = t.last.length * 6.4;
                  let tx = Math.min(x + w / 2 - tw / 2, nextStart - 3 - tw, x + w - tw - 1);
                  tx = Math.max(tx, x + 1);
                  if ((tx + tw > nextStart - 2 && k < visible.length - 1) || tw > w + 14) continue;
                  nextStart = tx;
                  out.push(
                    <text key={t.termId} x={tx} y={BAND_H - 5} style={{ fontSize: 11, fill: "var(--ink)" }}>
                      {t.last}
                    </text>,
                  );
                }
                return out;
              })()}
            </g>
            {yi >= range[0] && yi <= range[1] && (
              <text className="axis-tick-label" x={Math.min(Math.max(xOf(yi) + step / 2, chipW / 2), innerW - chipW / 2)} y={-14} textAnchor="middle" style={{ fill: "var(--ink)", fontWeight: 600 }}>
                {chipLabel}
              </text>
            )}
            {max <= 0 && !anyUnavailable && (
              <text x={innerW / 2} y={innerH / 2} textAnchor="middle" style={{ fill: "var(--ink-muted)", fontSize: 13 }}>
                No troops recorded for these filters in {range[0] === range[1] ? `FY${years[range[0]].fy}` : `FY${years[range[0]].fy}–${years[range[1]].fy}`}.
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

      <Tooltip state={tip.state}>{(i) => <ChartTip yi={i} stack={byYi.get(i)} measure={measure} />}</Tooltip>
    </div>
  );
}

function ChartTip({ yi, stack, measure }: { yi: number; stack: RegionStack | undefined; measure: number }) {
  const { data, country } = useTroopsState();
  const { periods, years, terms, places } = data.payload;
  const year = years[yi];
  const p = periods[year.period];
  const term = terms[year.term]?.last;
  const rowsOut = stack ? stack.regions.map((v, k) => [v, k] as const).filter(([v]) => v > 0).sort((a, b) => b[0] - a[0]) : [];
  return (
    <div>
      <div style={{ fontWeight: 600 }}>
        FY{year.fy}
        {term ? ` · ${term}` : ""}
      </div>
      <div className="tt-mono" style={{ marginBottom: 4 }}>
        {year.partial ? `partial year · through ${p.label}` : `Sep 30, ${year.fy}`}
        {" · "}
        {p.basis === "includes_deployed" ? "includes deployed forces" : "permanently assigned only"}
        {country >= 0 ? ` · ${places[country].name}` : ""}
        {measure > 0 ? ` · ${measureLabel(measure)}` : ""}
      </div>
      {stack?.unavailable ? (
        <div>Army did not report, so there is no {measure === 0 ? "all-branch" : "Army"} figure.</div>
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
              Not reported (blank in source): {p.suppressed.join(", ")}
            </div>
          )}
        </>
      )}
    </div>
  );
}
