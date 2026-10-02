"use client";

import type { ControlSpan } from "@/lib/congress-control";
import type { EconomyTerm } from "@/lib/economy-presidents";
import { dateOfDay, dayOf } from "@/lib/indicator-time";
import { recessionLabel } from "@/lib/indicator-payload";
import { termYearRange } from "@/lib/year-range";
import { useTradeActions } from "./TradeState";

/**
 * The time-axis layers every trade chart shares: recession shading, the year axis,
 * the president band, the optional House/Senate rows. Pure drawing in SVG user
 * space; the chart supplies its geometry. Same look as the Economy page.
 */
export interface Era {
  span: number;
  rec: [number, number][];
  terms: EconomyTerm[];
  control: { house: ControlSpan[]; senate: ControlSpan[] };
}

export const BAND_H = 18;
export const ROW_H = 12;
const EST_CHAR_W = 6.4;

export const partyColor = (p: "D" | "R") => (p === "D" ? "var(--dem)" : "var(--rep)");

interface View {
  view: readonly [number, number];
  X: (day: number) => number;
}

const visible = (view: readonly [number, number], a: number, b: number) => b > view[0] && a < view[1];
const clip = ({ view, X }: View, a: number, b: number): [number, number] => [X(Math.max(view[0], a)), X(Math.min(view[1], b))];

export function RecessionShading({ era, view, X, top, height }: View & { era: Era; top: number; height: number }) {
  return (
    <>
      {era.rec.filter(([s, e]) => visible(view, s, e)).map(([s, e]) => {
        const [x0, x1] = clip({ view, X }, s, e);
        return <rect key={s} x={x0} y={top} width={Math.max(1, x1 - x0)} height={height} fill="var(--ink)" fillOpacity={0.09} />;
      })}
    </>
  );
}

export function RecessionLabels({ era, view, X, y }: View & { era: Era; y: number }) {
  return (
    <>
      {era.rec.filter(([s, e]) => visible(view, s, e)).map((r) => {
        const [x0, x1] = clip({ view, X }, r[0], r[1]);
        if (x1 - x0 < 14) return null;
        return (
          <text key={`l${r[0]}`} x={r[0] <= view[0] ? x0 + 1 : (x0 + x1) / 2} y={y} textAnchor={r[0] <= view[0] ? "start" : "middle"} className="fill-ink-muted text-[10px]">
            {recessionLabel(r, dateOfDay)}
          </text>
        );
      })}
    </>
  );
}

export function YearAxis({ view, X, left, plotW, axisY }: View & { left: number; plotW: number; axisY: number }) {
  const yearsShown = (view[1] - view[0]) / 365.25;
  const step = [1, 2, 5, 10].find((s) => (plotW / yearsShown) * s >= 42 && !(s === 2 && yearsShown > 20)) ?? 10;
  const years: number[] = [];
  for (let y = dateOfDay(view[0]).year; dayOf(y, 0, 1) < view[1]; y++) if (y % step === 0 && dayOf(y, 0, 1) >= view[0]) years.push(y);
  return (
    <>
      <line x1={left} x2={left + plotW} y1={axisY} y2={axisY} stroke="var(--line-strong)" />
      {view[0] === 0 && X(dayOf(1995, 0, 1)) - left >= 40 && (
        <text x={left} y={axisY + 14} textAnchor="start" className="fill-ink-muted font-mono text-[11px]">1991</text>
      )}
      {years.map((y) => (
        <g key={y}>
          <line x1={X(dayOf(y, 0, 1))} x2={X(dayOf(y, 0, 1))} y1={axisY} y2={axisY + 4} stroke="var(--line-strong)" />
          <text x={X(dayOf(y, 0, 1))} y={axisY + 14} textAnchor="middle" className="fill-ink-muted font-mono text-[11px]">{y}</text>
        </g>
      ))}
    </>
  );
}

const termText = (t: EconomyTerm, width: number): string | null =>
  [t.last, t.label].filter((s, i, a) => a.indexOf(s) === i).reverse().find((s) => s.length * EST_CHAR_W + 8 <= width) ?? null;

/** The president band (click a term to show only its years) and, optionally, the chamber-majority rows. */
export function PresidentAndCongress({ era, view, X, left, bandY, houseY, senateY, showCong }: View & { era: Era; left: number; bandY: number; houseY: number; senateY: number; showCong: boolean }) {
  const { toggleRange } = useTradeActions();
  const lastYear = dateOfDay(era.span - 1).year;
  return (
    <>
      {era.terms.map((t) => {
        if (!visible(view, t.s, t.e)) return null;
        const [x0, x1] = clip({ view, X }, t.s, t.e);
        const text = termText(t, x1 - x0);
        return (
          <g
            key={t.termId}
            className="term-band cursor-pointer"
            role="button"
            tabIndex={0}
            aria-label={`${t.full}, ${t.startYear} to ${t.endYear ?? "present"}. Show only these years.`}
            onClick={(e) => {
              e.stopPropagation();
              toggleRange(termYearRange(t.startYear, t.endYear, 1991, lastYear), [1991, lastYear]);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggleRange(termYearRange(t.startYear, t.endYear, 1991, lastYear), [1991, lastYear]);
              }
            }}
          >
            <title>{`${t.full}, ${t.startYear} to ${t.endYear ?? "present"}. Click to show only these years.`}</title>
            <rect x={x0} y={bandY} width={x1 - x0 - 0.5} height={BAND_H} fill={partyColor(t.party)} />
            {text && <text x={(x0 + x1) / 2} y={bandY + 12.6} textAnchor="middle" className="text-[11px] font-semibold" fill="#ffffff">{text}</text>}
          </g>
        );
      })}
      {showCong &&
        (["house", "senate"] as const).map((ch) => {
          const y = ch === "house" ? houseY : senateY;
          return (
            <g key={ch}>
              <title>{ch === "house" ? "House majority" : "Senate majority"}</title>
              <text x={left + 4} y={y + 9.5} textAnchor="start" className="text-[10px] font-semibold" fill="#ffffff" pointerEvents="none">{ch === "house" ? "House" : "Senate"}</text>
              {era.control[ch].map((c) => {
                if (!visible(view, c.s, c.e)) return null;
                const [x0, x1] = clip({ view, X }, c.s, c.e);
                return (
                  <g key={c.s}>
                    <rect x={x0} y={y} width={Math.max(0.5, x1 - x0 - 0.5)} height={ROW_H} fill={partyColor(c.party)} />
                    {x1 - x0 >= 16 && (x0 + x1) / 2 - left >= 46 && <text x={(x0 + x1) / 2} y={y + 9} textAnchor="middle" className="text-[9px] font-semibold" fill="#ffffff">{c.party}</text>}
                  </g>
                );
              })}
            </g>
          );
        })}
    </>
  );
}
