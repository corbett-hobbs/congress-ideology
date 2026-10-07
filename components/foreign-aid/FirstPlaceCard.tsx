"use client";

import { SegmentLabel } from "@/components/charts/SegmentLabel";
import { useId, useMemo, useRef, useState, type PointerEvent } from "react";
import { ChartCard } from "@/components/charts/ChartCard";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { TERM_BAND_H, TermBandSvg, termSegments } from "@/components/charts/TermBandSvg";
import { Tooltip, useTooltip } from "@/components/charts/Tooltip";
import { useElementWidth } from "@/lib/use-element-width";
import { SLOT_NAME, formatAidAxis, formatAidMoney, niceDollarTicks, topRecipientsByYear, topRuns, type TopYear } from "@/lib/foreign-aid-derive";
import { useAidState } from "./ForeignAidState";
import { HatchDefs, SectorLegend, TD, TH, TableView, slotColor, useSectorLabel } from "./shared";
import { administrationForTermLabel } from "./term-labels";

const LABEL_H = 22;
const TICK = 5;

/**
 * "Who's been No. 1": the largest recipient country per fiscal year as run-length spans, with a bar
 * per year below (the No. 1's dollars, colored by its sector mix). Sector filters to the No. 1 within
 * that sector; Country highlights the years that country led and dims the rest. Click or drag sets the year.
 */
export function FirstPlaceCard() {
  const { data, year, range, setYear, country, sector, isPartial } = useAidState();
  const sectorLabel = useSectorLabel();
  const names = data.payload.countries;
  const years = useMemo(() => topRecipientsByYear(data, range[0], range[1], sector), [data, range, sector]);
  const runs = useMemo(() => topRuns(years), [years]);
  const [wrapRef, measured] = useElementWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const hatchId = useId().replace(/:/g, "");
  const tip = useTooltip<TopYear>();
  const [hover, setHover] = useState(-1);
  const down = useRef(false);

  const W = measured || 960;
  const narrow = W < 520;
  const n = years.length;
  // Phones keep extra room on the right so the last run's slanted name stays inside the chart.
  const MX = narrow ? 36 : 44; // left room for the dollar axis
  const MR = narrow ? 34 : 14;
  const step = (W - MX - MR) / n;
  // Phones get a taller span so a name too narrow to read across can run up the span instead.
  const labelH = narrow ? 46 : LABEL_H;
  const bracketY = labelH + 6;
  const maxH = narrow ? 120 : 150;
  const plotTop = bracketY + TICK + 12;
  const baseY = plotTop + maxH;
  const H = baseY + 24 + TERM_BAND_H + 4;
  const { ticks, top: maxTop } = niceDollarTicks(Math.max(1, ...years.map((y) => y.ranked[0]?.value ?? 0)));
  const yOf = (v: number) => baseY - (v / maxTop) * maxH;
  const si = year - range[0];
  const segments = termSegments(n, (i) => {
    const t = data.payload.terms.find((x) => years[i].fy >= x.fromFy && years[i].fy <= x.toFy);
    return t ? { id: t.termId, last: t.last, president: t.president, party: t.party } : null;
  });
  const bw = Math.min(Math.max(3, step * 0.62), 40);

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
  const peak = years.reduce<TopYear | null>((a, b) => (b.ranked[0] && (!a || !a.ranked[0] || b.ranked[0].value > a.ranked[0].value) ? b : a), null);
  const lede = cur?.ranked[0] ? (
    <>
      Largest recipient country each fiscal year{sectorLabel ? ` in ${sectorLabel}` : ""}, with bars colored by its sector mix. FY{year}:{" "}
      <b className="font-semibold text-ink">{names[cur.ranked[0].ci].name}</b> · {formatAidMoney(cur.ranked[0].value)} · {Math.round((cur.ranked[0].value / cur.countryTotal) * 100)}% of country-attributed dollars
      {isPartial(year) ? " (partial year)" : ""}
    </>
  ) : (
    "Largest recipient country each fiscal year"
  );

  return (
    <ChartCard title="Who’s been No. 1" lede={lede}>
      <div ref={wrapRef} className="touch-scroll relative -mx-3 sm:mx-0">
        <ChartFrame
          width={W}
          height={H}
          margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
          ariaLabel="The largest recipient country in each fiscal year, with its disbursements as bars. The table view lists the same figures."
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
              <HatchDefs id={hatchId} />
              {si >= 0 && si < n && <rect x={MX + si * step} y={0} width={step} height={baseY + 3} rx={2} style={{ fill: "var(--surface-raised)", stroke: "var(--line-strong)" }} />}
              {hover >= 0 && hover < n && hover !== si && <rect x={MX + hover * step} y={0} width={step} height={baseY + 3} rx={2} style={{ fill: "none", stroke: "var(--line-strong)", strokeDasharray: "3 3" }} />}
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={MX} x2={W - MR} y1={yOf(t)} y2={yOf(t)} className={t === 0 ? "zero-line" : "grid-line"} />
                  {t > 0 && <text className="axis-tick-label" x={MX - 6} y={yOf(t) + 3.5} textAnchor="end">{formatAidAxis(t)}</text>}
                </g>
              ))}
              {runs.map((r) => {
                if (r.ci < 0) return null;
                const x = MX + r.from * step;
                const w = (r.to - r.from + 1) * step;
                const nm = names[r.ci].name;
                const code = (names[r.ci].key ?? nm.slice(0, 3)).toUpperCase();
                const isSel = country === r.ci;
                const dim = country >= 0 && !isSel;
                const full = nm.length * 7.2 + 14;
                const lab = w >= full ? nm : w >= 34 && !(narrow && nm.length <= 9) ? code : "";
                // Too narrow to read across: turn the label up the span (the full name if it fits, else the code).
                // Too narrow to read across: slant the full name up and to the right (the code only if the name is long).
                const vert = !lab && narrow && w >= 8 ? (nm.length <= 9 ? nm : code) : "";
                const labelStyle = { fontFamily: "var(--font-serif, Georgia, serif)", fontWeight: 500, fill: "var(--ink)", opacity: dim ? 0.55 : 1 };
                return (
                  <g key={`${r.ci}-${r.from}`}>
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
                if (!y.ranked[0]) return null;
                const val = y.ranked[0].value;
                const h = Math.max(2, (val / maxTop) * maxH);
                const x = MX + i * step + (step - bw) / 2;
                const dim = country >= 0 && y.ranked[0].ci !== country;
                const k = h / Math.max(1, val);
                let acc = 0;
                return (
                  <g key={y.fy}>
                    {y.topSlots.map((v, s) => {
                      if (v <= 0) return null;
                      const hh = v * k;
                      acc += hh;
                      return <rect key={s} x={x} y={baseY - acc} width={bw} height={hh} style={{ fill: slotColor(s), opacity: dim ? 0.3 : 1 }} />;
                    })}
                    {!dim &&
                      (() => {
                        let a = 0;
                        return y.topSlots.map((v, s) => {
                          if (v <= 0) return null;
                          const hh = v * k;
                          a += hh;
                          const t = formatAidMoney(v);
                          return <SegmentLabel key={s} x={x + bw / 2} y={baseY - a + hh / 2} h={hh} w={bw} text={t} />;
                        });
                      })()}
                    {y.fy === year && <rect x={x - 1} y={baseY - h - 1} width={bw + 2} height={h + 1} rx={1} style={{ fill: "none", stroke: "var(--ink)", strokeWidth: 1.2 }} />}
                    {isPartial(y.fy) && <rect x={x} y={baseY - h} width={bw} height={h} fill={`url(#${hatchId})`} />}
                  </g>
                );
              })}
              <line x1={MX} x2={W - MR} y1={baseY} y2={baseY} style={{ stroke: "var(--line-strong)" }} />
              {years.map((y, i) =>
                n <= 10 || y.fy % 5 === 0 || i === 0 ? (
                  <text key={y.fy} className="axis-tick-label" x={MX + i * step + step / 2} y={baseY + 15} textAnchor="middle" style={y.fy === year ? { fill: "var(--ink)", fontWeight: 600 } : undefined}>
                    {y.fy}
                  </text>
                ) : null,
              )}
              <TermBandSvg segments={segments} x0={MX} step={step} y={baseY + 24} />
              {peak?.ranked[0] &&
                (() => {
                  const i = peak.fy - range[0];
                  const h = (peak.ranked[0].value / maxTop) * maxH;
                  const lab = formatAidMoney(peak.ranked[0].value);
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
      <SectorLegend partial={years.some((y) => isPartial(y.fy))} />
      <TableView caption="Largest recipient country by fiscal year">
        <thead>
          <tr>
            <th className={TH}>Fiscal year</th>
            <th className={TH}>No. 1</th>
            <th className={TH}>Disbursements</th>
            <th className={TH}>Share</th>
            {sector < 0 && SLOT_NAME.map((s) => <th key={s} className={TH}>{s}</th>)}
          </tr>
        </thead>
        <tbody>
          {years.map((y) => {
            const t = y.ranked[0];
            return (
              <tr key={y.fy}>
                <td className={TD}>
                  FY{y.fy}
                  {isPartial(y.fy) ? " (partial)" : ""}
                </td>
                <td className={`${TD} !font-sans`} style={{ textAlign: "left" }}>{t ? names[t.ci].name : "–"}</td>
                <td className={TD}>{t ? formatAidMoney(t.value) : "–"}</td>
                <td className={TD}>{t ? `${Math.round((t.value / y.countryTotal) * 100)}%` : "–"}</td>
                {sector < 0 && y.topSlots.map((v, k) => <td key={k} className={TD}>{v > 0 ? formatAidMoney(v) : "–"}</td>)}
              </tr>
            );
          })}
        </tbody>
      </TableView>
    </ChartCard>
  );
}

function FirstTip({ y }: { y: TopYear }) {
  const { data, isPartial, sector } = useAidState();
  const names = data.payload.countries;
  const term = administrationForTermLabel(data.payload.terms, y.fy);
  const top = y.ranked[0];
  const sectors = y.topSlots.map((v, k) => [v, k] as const).filter(([v]) => v > 0).sort((a, b) => b[0] - a[0]).slice(0, 3);
  return (
    <div>
      <div style={{ fontWeight: 600 }}>
        FY{y.fy}
        {term ? ` · ${term}` : ""}
      </div>
      <div className="tt-mono" style={{ marginBottom: 4 }}>
        Largest recipients{isPartial(y.fy) ? " · partial year" : ""}
      </div>
      {y.ranked.slice(0, 3).map((r, i) => (
        <div key={r.ci} style={{ display: "flex", justifyContent: "space-between", gap: 14 }}>
          <span>
            {i + 1}. {names[r.ci].name}
          </span>
          <span className="tt-mono">{formatAidMoney(r.value)}</span>
        </div>
      ))}
      {top && sector < 0 && (
        <>
          <div className="tt-mono" style={{ margin: "6px 0 2px" }}>{names[top.ci].name} by sector</div>
          {sectors.map(([v, k]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 14 }}>
              <span>
                <i style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, marginRight: 6, background: slotColor(k), outline: "1px solid color-mix(in oklab, var(--bg) 40%, transparent)" }} />
                {SLOT_NAME[k]}
              </span>
              <span className="tt-mono">{Math.round((v / top.value) * 100)}%</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
