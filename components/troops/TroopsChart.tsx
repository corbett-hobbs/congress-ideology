"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { scaleLinear } from "d3-scale";
import { Axis } from "@/components/charts/Axis";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { Tooltip, useTooltip } from "@/components/charts/Tooltip";
import { findExtremes } from "@/lib/chart-extremes";
import { SEGMENT_LABEL_STYLE, segmentLabelFits, yLabelInset } from "@/lib/chart-bars";
import { useElementWidth } from "@/lib/use-element-width";
import { REGIONS } from "@/lib/troops-regions";
import { contingencyAt, formatCount, formatCountAxis, formatCountCompact, measureLabel, niceCountTicks, termOnDate, type RegionStack } from "@/lib/troops-derive";
import { MEASURES } from "@/lib/troops-types";
import { useTroopsState } from "./TroopsState";

const NARROW_W = 520;
const AXIS_H = 18;
const BAND_H = 20;

const MARKER_NOTES = {
  sources: {
    title: "Before 2008: three sources, and afloat counted in some",
    body: "1996 and 1998–2005 are DMDC’s own 309A tables, which include afloat and unassigned personnel (from about 6,000 to 100,000 people). The rest of 1950–2007 comes from the troopdata compilation of DMDC reports, which has no afloat or unassigned rows, so those bars run lower by that amount, and a jump where the source changes is not a change in troops. 1951–52 are left out (the compilation only imputes them). No percent change is shown between bars from different sources.",
  },
  oif: {
    title: "2003–2005: Iraq, Kuwait and Afghanistan are not reported",
    body: "DMDC’s country tables print these as zero with a pointer to a separate deployment table, so they are shown as not reported, not zero. The dashed boxes above the bars are DMDC’s separate totals for forces in and around Iraq: 183,002 active duty in 2003, and 170,647 (2004) and 192,600 (2005) including deployed Reserve and National Guard, plus 19,500 in Afghanistan in 2005 (rounded). They are a different basis, can overlap country rows (forces deployed from Germany are also counted in Germany), and are in no bar or total.",
  },
  estimate: {
    title: "2006 and 2007: estimates",
    body: "DMDC published no country table for September 2006 or 2007. The compilation fills them from other reports and press figures (Iraq 141,100 and 170,000; Kuwait 44,400 and 48,500), so every 2006–07 figure is shown as an estimate, in a lighter bar.",
  },
  break: {
    title: "2018 on: what is counted changes",
    body: "Through the Sep 2017 table these counts include personnel deployed in support of contingency operations. From the Dec 2017 table on, DMDC counts only personnel permanently assigned to a location, so 2018 and later are on a different basis. Overseas active duty fell by about 53,000 between Sep and Dec 2017 while the U.S. total rose: a reallocation, not a withdrawal. Afghanistan, Iraq and Syria print as blank, not zero, until Sep 2021. Compare across this line with care.",
  },
  army: {
    title: "The Army did not report",
    body: "The Army did not provide personnel data for this year's table, so there is no all-branch or Army figure. The other branches are shown.",
  },
} as const;
type MarkerId = keyof typeof MARKER_NOTES;

/**
 * Stacked bars by region, one per year (each year's Sep 30 table; June 30 for 1950-56; the year in progress shows its
 * latest quarter, hatched), on a true year axis (1951-52 are empty slots), with a presidential-term band under the axis
 * like the other Presidency pages. Reads the shared state: the window (President), the branch, and the Country filter
 * (that place's own troops). Click or drag picks the year; arrow keys move it when the chart has focus. Numbered markers
 * (tap to pin) explain what changes: the source and afloat coverage before 2008, the 2003-05 Iraq/Afghanistan gap (whose
 * DMDC deployment totals are drawn as dashed boxes above those bars), the 2006-07 estimates, and the 2018 definition change.
 */
export function TroopsChart({ stacks }: { stacks: RegionStack[] }) {
  const { data, yi, range, setYear, country, measure } = useTroopsState();
  const { periods, years, terms, places, breakYear } = data.payload;
  const [wrapRef, measured] = useElementWidth<HTMLDivElement>();
  const width = measured || 960;
  const narrow = width < NARROW_W;
  const height = narrow ? 250 : 320;
  const ml = 10;
  const mr = 6;
  const mt = 42;
  const mb = AXIS_H + BAND_H + 6;
  const innerW = width - ml - mr;
  const innerH = height - mt - mb;
  const fy0 = years[range[0]].fy;
  const nSlots = years[range[1]].fy - fy0 + 1;
  const max = Math.max(0, ...stacks.map((s) => s.total + s.ghost));
  const { ticks, top } = niceCountTicks(max);
  // Push the first bar right if a tall one would sit on top of a y-axis label (shared rule, lib/chart-bars).
  const step0 = innerW / nSlots;
  const inset = yLabelInset({
    ticks,
    format: formatCountAxis,
    tops: Array.from({ length: nSlots }, (_, sl) => {
      const s = stacks.find((x) => years[x.yi].fy === fy0 + sl);
      return s ? s.total + s.ghost : 0;
    }),
    step: step0,
    barW: Math.min(Math.max(2, step0 * 0.72), 64),
  });
  const step = (innerW - inset) / nSlots;
  const bw = Math.min(Math.max(2, step * 0.72), 64);
  const xOf = (i: number) => inset + (years[i].fy - fy0) * step;
  const hatchId = useId().replace(/:/g, "");
  const tip = useTooltip<number>();
  const [hover, setHover] = useState(-1);
  const down = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const y = scaleLinear().domain([0, top]).range([innerH, 0]);
  const byYi = new Map(stacks.map((s) => [s.yi, s]));
  const indexAt = (e: { clientX: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    const slot = (e.clientX - r.left - ml - inset) / step - 0.5;
    let best = range[0];
    for (let i = range[0]; i <= range[1]; i++) if (Math.abs(years[i].fy - fy0 - slot) < Math.abs(years[best].fy - fy0 - slot)) best = i;
    return best;
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

  // Presidential terms by the president in office on each slot's snapshot date, so the band is continuous across the 1951-52 gap.
  const slotDate = (fy: number) => (fy <= 1956 ? `${fy}-06-30` : `${fy}-09-30`);
  const runs: { term: number; s: number; e: number }[] = [];
  for (let sl = 0; sl < nSlots; sl++) {
    const t = termOnDate(terms, slotDate(fy0 + sl));
    if (t < 0) continue;
    const last = runs[runs.length - 1];
    if (last && last.term === t && last.e === sl - 1) last.e = sl;
    else runs.push({ term: t, s: sl, e: sl });
  }

  // Peak and low of the drawn stacks (recomputed for the window, branch and country shown). Complete years only.
  const marks = (() => {
    const { peak, low } = findExtremes(stacks.map((s) => ({ day: s.yi, value: s.unavailable || s.total <= 0 || years[s.yi].partial ? null : s.total })));
    return [peak, low].flatMap((p) => (p && p.day !== yi ? [{ i: p.day, text: `${years[p.day].fy}: ${formatCountCompact(byYi.get(p.day)!.total)}` }] : []));
  })();
  const sel = years[yi];
  const chipLabel = `${sel.fy}${sel.partial ? " · partial" : periods[sel.period].estimate ? " · estimate" : ""}`;
  const chipW = chipLabel.length * 6.6;

  // Numbered markers, left to right.
  const inWin = (fy: number) => fy >= fy0 && fy <= years[range[1]].fy;
  const yearIdx = (fy: number) => years.findIndex((yy) => yy.fy === fy);
  const center = (a: number, b: number) => {
    const ia = years.findIndex((yy) => yy.fy >= Math.max(a, fy0));
    const ib = years.findLastIndex((yy) => yy.fy <= Math.min(b, years[range[1]].fy));
    return ia >= 0 && ib >= ia ? (xOf(ia) + xOf(ib) + step) / 2 : null;
  };
  const markers: { id: MarkerId; n: number; x: number }[] = [];
  const firstPre2008 = years.findIndex((yy, i) => i >= range[0] && i <= range[1] && yy.fy <= 2007);
  if (firstPre2008 >= 0) markers.push({ id: "sources", n: 0, x: inWin(1996) ? xOf(yearIdx(1996)) + step / 2 : xOf(firstPre2008) + step / 2 });
  const oifX = stacks.some((s) => s.ghost > 0) ? center(2003, 2005) : null;
  if (oifX !== null) markers.push({ id: "oif", n: 0, x: oifX });
  const estX = center(2006, 2007);
  if (estX !== null) markers.push({ id: "estimate", n: 0, x: estX });
  if (breakYear > range[0] && breakYear <= range[1]) markers.push({ id: "break", n: 0, x: xOf(breakYear) });
  const gap = data.payload.armyGapYears.filter((i) => i >= range[0] && i <= range[1]);
  if (gap.length) markers.push({ id: "army", n: 0, x: (xOf(gap[0]) + xOf(gap[gap.length - 1]) + step) / 2 });
  markers.sort((a, b) => a.x - b.x).forEach((m, k) => (m.n = k + 1));

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
  const labelAt = (fy: number) => (step >= 30 ? true : step >= 15 ? fy % 2 === 0 : fy % 5 === 0);

  return (
    <div
      ref={wrapRef}
      className="relative touch-scroll outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      tabIndex={0}
      onKeyDown={onKey}
      role="group"
      aria-label="Troops chart. Left and right arrow keys change the year."
    >
      <ChartFrame
        width={width}
        height={height}
        margin={{ top: mt, right: mr, bottom: mb, left: ml }}
        ariaLabel={`Stacked bars of active-duty personnel stationed abroad by region, ${years[range[0]].fy} to ${years[range[1]].fy}, ${MEASURES[measure].label}${countryName ? `, ${countryName} only` : ""}`}
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
              const estimate = periods[s.pi].estimate;
              let acc = 0;
              return (
                <g key={s.yi}>
                  <g opacity={estimate ? 0.55 : 1}>
                    {s.regions.map((v, k) => {
                      if (v <= 0) return null;
                      const y1 = y(acc + v);
                      const h = y(acc) - y1;
                      acc += v;
                      return <rect key={k} x={x} y={y1} width={bw} height={Math.max(h, 0)} style={{ fill: REGIONS[k].color }} />;
                    })}
                  </g>
                  {(years[s.yi].partial || estimate) && acc > 0 && (
                    <>
                      {years[s.yi].partial && <rect x={x} y={y(acc)} width={bw} height={y(0) - y(acc)} fill={`url(#${hatchId})`} />}
                      <rect x={x} y={y(acc)} width={bw} height={y(0) - y(acc)} style={{ fill: "none", stroke: "var(--ink-muted)", strokeDasharray: "3 2" }} />
                    </>
                  )}
                  {/* Segment values, only where the segment is tall and wide enough to hold them. */}
                  {(() => {
                    let a = 0;
                    return s.regions.map((v, k) => {
                      if (v <= 0) return null;
                      const y1 = y(a + v);
                      const h = y(a) - y1;
                      a += v;
                      const t = formatCountCompact(v);
                      return segmentLabelFits(h, bw, t) ? (
                        <text key={k} x={x + bw / 2} y={y1 + h / 2} dy="0.35em" textAnchor="middle" style={SEGMENT_LABEL_STYLE}>
                          {t}
                        </text>
                      ) : null;
                    });
                  })()}
                  {s.ghost > 0 && (
                    <rect x={x} y={y(s.total + s.ghost)} width={bw} height={Math.max(0, y(s.total) - y(s.total + s.ghost))} rx={1} style={{ fill: "color-mix(in oklab, var(--ink) 7%, transparent)", stroke: "var(--ink)", strokeDasharray: "3 2", strokeWidth: 1 }} />
                  )}
                </g>
              );
            })}
            <g pointerEvents="none" opacity={hover >= 0 ? 0.25 : 1} style={{ transition: "opacity .12s" }}>
              {marks.map((m) => {
                const w = m.text.length * 6.3;
                const cx = Math.min(Math.max(xOf(m.i) + step / 2, w / 2 + 2), innerW - w / 2 - 2);
                let tall = byYi.get(m.i)!.total + byYi.get(m.i)!.ghost;
                for (const s of stacks) if (Math.abs(xOf(s.yi) + step / 2 - cx) <= w / 2 + bw / 2) tall = Math.max(tall, s.total + s.ghost);
                return (
                  <text key={m.i} x={cx} y={y(tall) - 6} textAnchor="middle" className="fill-ink text-[11px] font-medium" style={{ stroke: "var(--surface)", strokeWidth: 3, paintOrder: "stroke" }}>
                    {m.text}
                  </text>
                );
              })}
            </g>
            {stacks.map((s) =>
              labelAt(years[s.yi].fy) || s.yi === yi ? (
                <text key={s.yi} className="axis-tick-label" x={xOf(s.yi) + step / 2} y={innerH + 14} textAnchor="middle" style={s.yi === yi ? { fill: "var(--ink)", fontWeight: 600 } : undefined}>
                  {years[s.yi].fy}
                </text>
              ) : null,
            )}
            {/* Presidential terms: the president in office on the snapshot date. Labels placed right to left so they never collide. */}
            <g transform={`translate(0,${innerH + AXIS_H + 2})`}>
              {runs.map(({ term, s: a, e }) => {
                const t = terms[term];
                const c = t.party === "R" ? "--rep" : "--dem";
                const x = a === 0 ? 0 : inset + a * step;
                const w = (e - a + 1) * step + (a === 0 ? inset : 0);
                return (
                  <g key={`${term}-${a}`}>
                    <rect x={x + 0.5} y={0} width={Math.max(0, w - 1)} height={BAND_H} rx={2} style={{ fill: `color-mix(in oklab, var(${c}) 20%, var(--surface))` }} />
                    <rect x={x + 0.5} y={0} width={Math.max(0, w - 1)} height={2.5} style={{ fill: `var(${c})` }} />
                  </g>
                );
              })}
              {(() => {
                let nextStart = innerW + mr;
                const out = [];
                for (let k = runs.length - 1; k >= 0; k--) {
                  const { term, s: a, e } = runs[k];
                  const t = terms[term];
                  const x = a === 0 ? 0 : inset + a * step;
                  const w = (e - a + 1) * step + (a === 0 ? inset : 0);
                  // Full last name, else a four-letter abbreviation: a label that does not fit is shortened, never dropped.
                  for (const text of [t.last, `${t.last.slice(0, 4)}.`]) {
                    const tw = text.length * 6.4;
                    let tx = Math.min(x + w / 2 - tw / 2, nextStart - 3 - tw, x + w - tw - 1);
                    tx = Math.max(tx, x + 1);
                    if ((tx + tw > nextStart - 2 && k < runs.length - 1) || tw > w + 4) continue;
                    nextStart = tx;
                    out.push(
                      <text key={`${term}-${a}`} x={tx} y={BAND_H - 5} style={{ fontSize: 11, fill: "var(--ink)" }}>
                        {text}
                      </text>,
                    );
                    break;
                  }
                }
                return out;
              })()}
            </g>
            {yi >= range[0] && yi <= range[1] && (
              <text className="axis-tick-label" x={Math.min(Math.max(xOf(yi) + step / 2, chipW / 2), innerW - chipW / 2)} y={-8} textAnchor="middle" style={{ fill: "var(--ink)", fontWeight: 600 }}>
                {chipLabel}
              </text>
            )}
            {max <= 0 && !anyUnavailable && (
              <text x={innerW / 2} y={innerH / 2} textAnchor="middle" style={{ fill: "var(--ink-muted)", fontSize: 13 }}>
                No troops recorded for these filters in {range[0] === range[1] ? years[range[0]].fy : `${years[range[0]].fy}–${years[range[1]].fy}`}.
              </text>
            )}
            {anyUnavailable && measure === 5 && max <= 0 && (
              <text x={innerW / 2} y={innerH / 2} textAnchor="middle" style={{ fill: "var(--ink-muted)", fontSize: 13 }}>
                DMDC’s tables before 2008 have no Coast Guard column.
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

const SOURCE_TEXT = { dmdc_location: "DMDC location table", dmdc_309a: "DMDC 309A table", troopdata: "troopdata compilation of DMDC reports" } as const;

function ChartTip({ yi, stack, measure }: { yi: number; stack: RegionStack | undefined; measure: number }) {
  const { data, country } = useTroopsState();
  const { periods, years, terms, places } = data.payload;
  const year = years[yi];
  const p = periods[year.period];
  const term = terms[year.term]?.last;
  const rowsOut = stack ? stack.regions.map((v, k) => [v, k] as const).filter(([v]) => v > 0).sort((a, b) => b[0] - a[0]) : [];
  const ghost = contingencyAt(data, measure, year.period, country);
  const snap = year.partial ? `partial year · through ${p.label}` : p.snapshot === "june" ? `June 30, ${year.fy}` : `Sep 30, ${year.fy}`;
  return (
    <div>
      <div style={{ fontWeight: 600 }}>
        {year.fy}
        {term ? ` · ${term}` : ""}
      </div>
      <div className="tt-mono" style={{ marginBottom: 4 }}>
        {snap} · {SOURCE_TEXT[p.source]}
        {p.estimate ? " · estimate" : ""}
        {country >= 0 ? ` · ${places[country].name}` : ""}
        {measure > 0 ? ` · ${measureLabel(measure)}` : ""}
      </div>
      {stack?.unavailable ? (
        <div>{measure === 5 ? "DMDC’s tables before 2008 have no Coast Guard column." : `Army did not report, so there is no ${measure === 0 ? "all-branch" : "Army"} figure.`}</div>
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
          {!p.afloatIncluded && country < 0 && measure === 0 && (
            <div className="tt-mono" style={{ marginTop: 4, opacity: 0.85 }}>
              No afloat or unassigned rows in this source
            </div>
          )}
          {ghost.map((g) => (
            <div key={g.operation} style={{ marginTop: 4, opacity: 0.9 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 14 }}>
                <span>Not in the bar: in/around {places[g.place].name}</span>
                <span className="tt-mono">{formatCount(g.value)}</span>
              </div>
              <div className="tt-mono" style={{ opacity: 0.85 }}>
                DMDC {g.operation} total · {g.basis === "active_duty" ? "active duty" : "includes Reserve/Guard"}
                {g.rounded ? " · rounded" : ""}
              </div>
            </div>
          ))}
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
