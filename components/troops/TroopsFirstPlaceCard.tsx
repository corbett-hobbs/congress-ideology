"use client";

import { useId, useMemo, useRef, useState, type PointerEvent } from "react";
import { LEGEND_ITEM, LEGEND_ROW } from "@/components/charts/legend";
import { ChartCard } from "@/components/charts/ChartCard";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { TERM_BAND_H, TermBandSvg, termSegments } from "@/components/charts/TermBandSvg";
import { Tooltip, useTooltip } from "@/components/charts/Tooltip";
import { useElementWidth } from "@/lib/use-element-width";
import { BRANCH_NAMES, formatCount, formatCountAxis, formatCountCompact, measureLabel, niceCountTicks, topHostRuns, topHostsByYear, yearLabelEvery, type TopHostYear } from "@/lib/troops-derive";
import { useTroopsState } from "./TroopsState";
import { BranchLegend, NO_SPLIT, TD, TH, TableView, Swatch, branchColor, showRest } from "./shared";

const LABEL_H = 22;
const TICK = 5;

/**
 * "Who's hosted the most": the largest host country each year as run-length spans, with a bar per year below (that
 * host's troops, split by branch for All branches). The branch filter picks the No. 1 within that branch; Country
 * highlights the years that country led and dims the rest. Click or drag sets the year. Same layout as foreign aid's
 * "Who's been No. 1".
 */
export function TroopsFirstPlaceCard() {
  const { data, yi, range, setYear, country, measure } = useTroopsState();
  const { places, years: allYears, periods } = data.payload;
  const years = useMemo(() => topHostsByYear(data, measure, range[0], range[1]), [data, measure, range]);
  const runs = useMemo(() => topHostRuns(years), [years]);
  const [wrapRef, measured] = useElementWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const hatchId = useId().replace(/:/g, "");
  const tip = useTooltip<TopHostYear>();
  const [hover, setHover] = useState(-1);
  const down = useRef(false);

  const W = measured || 960;
  const narrow = W < 520;
  const n = years.length;
  const MX = narrow ? 36 : 44;
  const MR = narrow ? 34 : 14;
  const step = (W - MX - MR) / n;
  // A host's label is its name when it fits across the span, else its code, else the name (or code, if long) slanted up and
  // to the right at any width: a label that does not fit is never dropped (ARCHITECTURE_MAP rule 10).
  const labelFor = (r: { place: number; from: number; to: number }) => {
    const pl = places[r.place];
    const nm = pl.name;
    const code = (pl.iso3 ?? nm.slice(0, 3)).toUpperCase();
    const w = (r.to - r.from + 1) * step;
    if (w >= nm.length * 7.2 + 14) return { flat: nm, slant: "" };
    if (w >= 34 && !(narrow && nm.length <= 9)) return { flat: code, slant: "" };
    return { flat: "", slant: nm.length <= 9 ? nm : code };
  };
  const anySlanted = runs.some((r) => r.place >= 0 && labelFor(r).slant);
  const labelH = anySlanted ? 46 : LABEL_H;
  const bracketY = labelH + 6;
  const maxH = narrow ? 120 : 150;
  const plotTop = bracketY + TICK + 12;
  const baseY = plotTop + maxH;
  const H = baseY + 24 + TERM_BAND_H + 4;
  const { ticks, top: maxTop } = niceCountTicks(Math.max(1, ...years.map((y) => y.top[0]?.value ?? 0)));
  const yOf = (v: number) => baseY - (v / maxTop) * maxH;
  const si = yi - range[0];
  const segments = termSegments(n, (i) => {
    const t = data.payload.terms[allYears[years[i].yi].term];
    return t ? { id: t.termId, last: t.last, president: t.president, party: t.party } : null;
  });
  const bw = Math.min(Math.max(3, step * 0.62), 40);
  const partial = (i: number) => allYears[range[0] + i].partial;
  const estimate = (i: number) => periods[allYears[range[0] + i].period].estimate;

  const indexAt = (e: { clientX: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return Math.min(n - 1, Math.max(0, Math.floor((e.clientX - r.left - MX) / step)));
  };
  const onDown = (e: PointerEvent<SVGSVGElement>) => {
    down.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const i = indexAt(e);
    setYear(range[0] + i);
    tip.show(years[i], e);
  };
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const i = indexAt(e);
    if (down.current) setYear(range[0] + i);
    setHover(i);
    tip.show(years[i], e);
  };
  const end = () => {
    down.current = false;
  };

  const cur = years[si];
  const peak = years.reduce<TopHostYear | null>((a, b) => (b.top[0] && (!a || !a.top[0] || b.top[0].value > a.top[0].value) ? b : a), null);
  const branch = measure > 0 ? ` (${measureLabel(measure)})` : "";
  const lede = cur?.top[0] ? (
    <>
      Largest host country each year{branch}, with bars split by branch. {allYears[yi].fy}: <b className="font-semibold text-ink">{places[cur.top[0].place].name}</b> · {formatCount(cur.top[0].value)} ·{" "}
      {Math.round((cur.top[0].value / cur.hostTotal) * 100)}% of troops at foreign hosts
      {allYears[yi].partial ? " (partial year)" : estimate(si) ? " (estimate)" : ""}
    </>
  ) : (
    "Largest host country each year"
  );
  const anyPartial = years.some((_, i) => partial(i));
  const anyEstimate = years.some((_, i) => estimate(i));
  const anyNoSplit = measure === 0 && years.some((y) => y.top[0] && showRest(y.top[0].rest, y.top[0].value));

  return (
    <ChartCard title="Who’s hosted the most" lede={lede}>
      <div ref={wrapRef} className="touch-scroll relative -mx-3 sm:mx-0">
        <ChartFrame
          width={W}
          height={H}
          margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
          ariaLabel="The largest host country in each year, with its troops as bars. The table view lists the same figures."
          svgRef={svgRef}
          onPointerLeave={() => {
            down.current = false;
            setHover(-1);
            tip.hide();
          }}
          svgProps={{ onPointerDown: onDown, onPointerMove: onMove, onPointerUp: end, onPointerCancel: end, style: { cursor: "crosshair", touchAction: "pan-y" } }}
        >
          {() => (
            <>
              <defs>
                <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="6" style={{ stroke: "var(--surface)", strokeWidth: 2.2 }} />
                </pattern>
              </defs>
              {si >= 0 && si < n && <rect x={MX + si * step} y={0} width={step} height={baseY + 3} rx={2} style={{ fill: "var(--surface-raised)", stroke: "var(--line-strong)" }} />}
              {hover >= 0 && hover < n && hover !== si && <rect x={MX + hover * step} y={0} width={step} height={baseY + 3} rx={2} style={{ fill: "none", stroke: "var(--line-strong)", strokeDasharray: "3 3" }} />}
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={MX} x2={W - MR} y1={yOf(t)} y2={yOf(t)} className={t === 0 ? "zero-line" : "grid-line"} />
                  {t > 0 && (
                    <text className="axis-tick-label" x={MX - 6} y={yOf(t) + 3.5} textAnchor="end">
                      {formatCountAxis(t)}
                    </text>
                  )}
                </g>
              ))}
              {runs.map((r) => {
                if (r.place < 0) return null;
                const x = MX + r.from * step;
                const w = (r.to - r.from + 1) * step;
                const pl = places[r.place];
                const nm = pl.name;
                const isSel = country === r.place;
                const dim = country >= 0 && !isSel;
                const { flat: lab, slant: vert } = labelFor(r);
                const labelStyle = { fontFamily: "var(--font-serif, Georgia, serif)", fontWeight: 500, fill: "var(--ink)", opacity: dim ? 0.55 : 1 };
                return (
                  <g key={`${r.place}-${r.from}`}>
                    <path
                      d={`M${x + 2} ${bracketY + TICK} V${bracketY} H${x + w - 2} V${bracketY + TICK}`}
                      fill="none"
                      strokeLinecap="round"
                      style={{ stroke: isSel ? "var(--accent)" : "var(--ink-muted)", strokeWidth: isSel ? 2 : 1.3, opacity: dim ? 0.4 : 1 }}
                    />
                    {lab && (
                      <text x={x + w / 2} y={bracketY - 6} textAnchor="middle" style={{ ...labelStyle, fontSize: lab === nm ? 14 : 12, fill: isSel ? "var(--accent)" : "var(--ink)" }}>
                        {lab}
                      </text>
                    )}
                    {vert && (
                      <text transform={`translate(${x + w / 2 - 2} ${bracketY - 5}) rotate(-60)`} textAnchor="start" style={{ ...labelStyle, fontSize: 11, fill: isSel ? "var(--accent)" : "var(--ink)" }}>
                        {vert}
                      </text>
                    )}
                  </g>
                );
              })}
              {years.map((y, i) => {
                const t = y.top[0];
                if (!t) return null;
                const h = Math.max(2, (t.value / maxTop) * maxH);
                const x = MX + i * step + (step - bw) / 2;
                const dim = country >= 0 && t.place !== country;
                const k = h / Math.max(1, t.value);
                const segs = measure === 0 ? [...t.branches, showRest(t.rest, t.value) ? t.rest : 0] : [t.value];
                let acc = 0;
                return (
                  <g key={y.yi} opacity={dim ? 0.3 : estimate(i) ? 0.6 : 1}>
                    {segs.map((v, s) => {
                      if (v <= 0) return null;
                      const hh = v * k;
                      acc += hh;
                      return <rect key={s} x={x} y={baseY - acc} width={bw} height={hh} style={{ fill: measure === 0 && s === 4 ? NO_SPLIT : branchColor(measure === 0 ? s : measure - 1) }} />;
                    })}
                    {allYears[y.yi].fy === allYears[yi].fy && <rect x={x - 1} y={baseY - h - 1} width={bw + 2} height={h + 1} rx={1} style={{ fill: "none", stroke: "var(--ink)", strokeWidth: 1.2 }} />}
                    {partial(i) && <rect x={x} y={baseY - h} width={bw} height={h} fill={`url(#${hatchId})`} />}
                  </g>
                );
              })}
              <line x1={MX} x2={W - MR} y1={baseY} y2={baseY} style={{ stroke: "var(--line-strong)" }} />
              {years.map((y, i) => {
                const fy = allYears[y.yi].fy;
                const show = fy % yearLabelEvery(step) === 0;
                return show ? (
                  <text key={y.yi} className="axis-tick-label" x={MX + i * step + step / 2} y={baseY + 15} textAnchor="middle" style={y.yi === yi ? { fill: "var(--ink)", fontWeight: 600 } : undefined}>
                    {fy}
                  </text>
                ) : null;
              })}
              <TermBandSvg segments={segments} x0={MX} step={step} y={baseY + 24} />
              {peak?.top[0] &&
                (() => {
                  const i = peak.yi - range[0];
                  const h = (peak.top[0].value / maxTop) * maxH;
                  const lab = formatCountCompact(peak.top[0].value);
                  const tw = lab.length * 6.4;
                  const cx = Math.min(Math.max(MX + i * step + step / 2, MX + tw / 2), W - MR - tw / 2);
                  return (
                    <text className="axis-tick-label" x={cx} y={baseY - h - 5} textAnchor="middle">
                      {lab}
                    </text>
                  );
                })()}
            </>
          )}
        </ChartFrame>
        <Tooltip state={tip.state}>{(y) => <FirstTip y={y} />}</Tooltip>
      </div>
      {measure === 0 ? <BranchLegend /> : null}
      {(anyPartial || anyEstimate || anyNoSplit) && (
        <div className={`mt-2 ${LEGEND_ROW}`}>
          {anyPartial && (
            <span className={LEGEND_ITEM}>
              <i className="inline-block h-[10px] w-[10px] rounded-[2px] border border-line-strong" style={{ background: "repeating-linear-gradient(45deg, var(--ink-muted) 0 2px, transparent 2px 5px)" }} />
              Partial year
            </span>
          )}
          {anyNoSplit && (
            <span className={LEGEND_ITEM}>
              <Swatch color={NO_SPLIT} />
              No branch split published
            </span>
          )}
          {anyEstimate && (
            <span className={LEGEND_ITEM}>
              <Swatch color="color-mix(in oklab, var(--ink) 25%, transparent)" />
              Estimate (lighter bars)
            </span>
          )}
        </div>
      )}
      <TableView caption="Largest host country by year">
        <thead>
          <tr>
            <th className={TH}>Year</th>
            <th className={TH}>No. 1</th>
            <th className={TH}>{measureLabel(measure)}</th>
            <th className={TH}>Share of hosts</th>
            {measure === 0 && BRANCH_NAMES.map((b) => <th key={b} className={TH}>{b}</th>)}
          </tr>
        </thead>
        <tbody>
          {years.map((y, i) => {
            const t = y.top[0];
            return (
              <tr key={y.yi}>
                <td className={TD}>
                  {allYears[y.yi].fy}
                  {partial(i) ? " (partial)" : estimate(i) ? " (estimate)" : ""}
                </td>
                <td className={`${TD} !font-sans`} style={{ textAlign: "left" }}>{t ? places[t.place].name : "–"}</td>
                <td className={TD}>{t ? formatCount(t.value) : "–"}</td>
                <td className={TD}>{t ? `${Math.round((t.value / y.hostTotal) * 100)}%` : "–"}</td>
                {measure === 0 && (t ? t.branches : BRANCH_NAMES.map(() => 0)).map((v, k) => <td key={k} className={TD}>{t && v > 0 ? formatCount(v) : "–"}</td>)}
              </tr>
            );
          })}
        </tbody>
      </TableView>
    </ChartCard>
  );
}

function FirstTip({ y }: { y: TopHostYear }) {
  const { data, measure } = useTroopsState();
  const { places, years, terms, periods } = data.payload;
  const yr = years[y.yi];
  const term = terms[yr.term]?.last;
  const p = periods[yr.period];
  const top = y.top[0];
  const branches = top ? top.branches.map((v, k) => [v, k] as const).filter(([v]) => v > 0).sort((a, b) => b[0] - a[0]) : [];
  return (
    <div>
      <div style={{ fontWeight: 600 }}>
        {yr.fy}
        {term ? ` · ${term}` : ""}
      </div>
      <div className="tt-mono" style={{ marginBottom: 4 }}>
        Largest hosts{yr.partial ? " · partial year" : p.estimate ? " · estimate" : ""}
        {measure > 0 ? ` · ${measureLabel(measure)}` : ""}
      </div>
      {y.top.length === 0 && <div>No host reported.</div>}
      {y.top.map((r, i) => (
        <div key={r.place} style={{ display: "flex", justifyContent: "space-between", gap: 14 }}>
          <span>
            {i + 1}. {places[r.place].name}
          </span>
          <span className="tt-mono">{formatCount(r.value)}</span>
        </div>
      ))}
      {top && measure === 0 && (
        <>
          <div className="tt-mono" style={{ margin: "6px 0 2px" }}>{places[top.place].name} by branch</div>
          {branches.map(([v, k]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 14 }}>
              <span>
                <i style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, marginRight: 6, background: branchColor(k), outline: "1px solid color-mix(in oklab, var(--bg) 40%, transparent)" }} />
                {BRANCH_NAMES[k]}
              </span>
              <span className="tt-mono">{Math.round((v / top.value) * 100)}%</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
