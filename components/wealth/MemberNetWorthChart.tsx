"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { scaleLinear } from "d3-scale";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { Axis } from "@/components/charts/Axis";
import { Tooltip, useTooltip } from "@/components/charts/Tooltip";
import {
  filingYearOf,
  SERIES_YEARS,
  type ProfileYearStatus,
} from "@/lib/wealth-derive";
import { formatCompactUSD, formatOpenEndedUSD } from "@/lib/format-money";

const W = 640;
const DEFAULT_H = 280;
const MIN_H = 220;
const MARGIN = { top: 20, right: 16, bottom: 38, left: 68 };
/** Minimum dollar span so a flat/near-flat series isn't over-magnified. */
const MIN_Y_SPAN = 200_000;
/** Pixels of top-of-chart fade applied whenever an open-ended band is in
 *  view — see the module doc below for why this is a chart-wide fade rather
 *  than a per-point one. */
const FADE_PX = 46;

type Plottable = Extract<ProfileYearStatus, { kind: "usable" | "needs_review" }>;

function isPlottable(y: ProfileYearStatus): y is Plottable {
  return y.kind === "usable" || y.kind === "needs_review";
}

function tickLabel(v: number): string {
  if (v === 0) return "$0";
  return v < 0 ? `-${formatCompactUSD(-v)}` : formatCompactUSD(v);
}

/** Up to ~6 evenly spread years across an arbitrary span, always including
 *  the last year — mirrors `senate/SenatorTrajectoryChart`'s `axisCongresses`. */
function axisYears(first: number, last: number): number[] {
  const span = last - first;
  if (span <= 0) return [first];
  const step = Math.max(1, Math.ceil(span / 6));
  const out: number[] = [];
  for (let y = first; y <= last; y += step) out.push(y);
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

interface Props {
  years: ProfileYearStatus[];
  selectedYear: number;
  onSelectYear: (year: number) => void;
  memberName: string;
}

/**
 * The profile card's "Net worth over time" chart: a midpoint line with a
 * translucent range band, one point per covered year (not filing date).
 * Years with no usable/needs-review filing break the band and render a
 * dashed bridge in the midpoint line plus a muted label below the axis, in
 * one of three states (no filing found / not extractable / needs review —
 * see `lib/wealth-derive.ts`'s `ProfileYearStatus`).
 *
 * Open-ended top bands ("Over $50,000,000") don't get a precise upper
 * bound, so instead of trying to fade the band at exactly the columns where
 * that occurs (a real EIGA filing can mix open-ended and closed years in
 * the same series), this applies one chart-wide gradient at the very top of
 * the plot whenever ANY visible year is open-ended. Since the y-domain's own
 * ceiling is set by the highest reported value — which an open-ended band
 * always is, by construction — the fade lands almost exactly where the
 * open-ended point(s) actually sit. A simplification, not a per-point
 * effect; documented rather than over-built for what's a secondary visual
 * cue (the hover card and midpoint label already carry the precise "+").
 */
export function MemberNetWorthChart({ years, selectedYear, onSelectYear, memberName }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const [H, setH] = useState(DEFAULT_H);

  // On wide layouts the chart sits beside the items panel; stretch the SVG's
  // logical height so its rendered height fills the row (the wrapper below
  // is absolutely positioned there, so it never drives the row height).
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      if (!mq.matches || width === 0 || height === 0) {
        setH(DEFAULT_H);
        return;
      }
      setH(Math.max(MIN_H, Math.round((W * height) / width)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    mq.addEventListener("change", update);
    return () => {
      ro.disconnect();
      mq.removeEventListener("change", update);
    };
  }, []);
  const tip = useTooltip<Plottable>();

  const plottable = useMemo(() => years.filter(isPlottable), [years]);
  const hasOpenEnded = plottable.some((p) => p.range.openEnded);
  const hasNeedsReview = plottable.some((p) => p.kind === "needs_review");

  const { yLo, yHi } = useMemo(() => {
    const values: number[] = [0];
    for (const p of plottable) {
      values.push(p.midpoint);
      if (!p.range.unavailable) {
        if (p.range.lo != null) values.push(p.range.lo);
        if (p.range.hi != null) values.push(p.range.hi);
      }
    }
    let lo = Math.min(...values);
    let hi = Math.max(...values);
    if (hi - lo < MIN_Y_SPAN) {
      const mid = (lo + hi) / 2;
      lo = mid - MIN_Y_SPAN / 2;
      hi = mid + MIN_Y_SPAN / 2;
    }
    const pad = (hi - lo) * 0.15;
    return { yLo: lo - pad, yHi: hi + pad };
  }, [plottable]);

  // Start the x-axis at this member's own first reported year (any row at
  // all, not just usable ones) rather than always at the pipeline's 2013
  // floor — a member who entered Congress in 2019 doesn't need six empty
  // years of runway before their first point.
  const domainStart = years.find((y) => y.kind !== "no_filing")?.year ?? SERIES_YEARS[0];
  const domainEnd = SERIES_YEARS[SERIES_YEARS.length - 1];

  const x = scaleLinear()
    .domain([domainStart, domainEnd])
    .range([0, W - MARGIN.left - MARGIN.right]);
  const y = scaleLinear().domain([yHi, yLo]).range([0, H - MARGIN.top - MARGIN.bottom]);
  const yTicks = y.ticks(5);
  const xTicks = axisYears(domainStart, domainEnd);

  // Contiguous runs of "usable" years (the only kind with a trustworthy
  // range) drive the band; a gap in years ends a run.
  const bandRuns = useMemo(() => {
    const runs: Plottable[][] = [];
    let current: Plottable[] = [];
    for (const p of plottable) {
      if (p.kind !== "usable" || p.range.unavailable) {
        if (current.length) runs.push(current);
        current = [];
        continue;
      }
      if (current.length && p.year - current[current.length - 1].year !== 1) {
        runs.push(current);
        current = [];
      }
      current.push(p);
    }
    if (current.length) runs.push(current);
    return runs.filter((r) => r.length >= 1);
  }, [plottable]);

  // Midpoint line segments: solid between adjacent years, dashed bridging a
  // gap (a year with no usable/needs-review data in between).
  const lineSegments = useMemo(() => {
    const segs: { from: Plottable; to: Plottable; dashed: boolean }[] = [];
    for (let i = 1; i < plottable.length; i++) {
      const a = plottable[i - 1];
      const b = plottable[i];
      segs.push({ from: a, to: b, dashed: b.year - a.year !== 1 });
    }
    return segs;
  }, [plottable]);
  const hasBridgedGap = lineSegments.some((s) => s.dashed);

  // Only label gaps *between* this member's own first and last plotted
  // year — a "bridge" implies two known points either side of it. Years
  // before their first Congress or after their latest filing aren't a gap
  // to bridge, they're just outside this member's own data, and labeling
  // all of them (up to 11 empty pre-2013-entry years) would bury the axis.
  const firstPlottedYear = plottable[0]?.year;
  const lastPlottedYear = plottable[plottable.length - 1]?.year;
  // One label per *contiguous run* of gap years, centered under the run —
  // not one per year: several missing years in a row (e.g. 2016–2020) used
  // to each render their own "no filing" text on top of each other,
  // garbling into "no filing filing filing filing".
  const gapRuns = useMemo(() => {
    if (firstPlottedYear == null) return [];
    const runs: { midYear: number; anyNotExtractable: boolean }[] = [];
    let run: number[] = [];
    let anyNotExtractable = false;
    const flush = () => {
      if (run.length) {
        runs.push({
          midYear: (run[0] + run[run.length - 1]) / 2,
          anyNotExtractable,
        });
      }
      run = [];
      anyNotExtractable = false;
    };
    for (const y of years) {
      const inBridge = y.year > firstPlottedYear && y.year < lastPlottedYear!;
      const isGap = y.kind === "no_filing" || y.kind === "not_extractable";
      if (inBridge && isGap) {
        run.push(y.year);
        if (y.kind === "not_extractable") anyNotExtractable = true;
      } else {
        flush();
      }
    }
    flush();
    return runs;
  }, [years, firstPlottedYear, lastPlottedYear]);

  function svgPoint(localX: number, localY: number) {
    const svg = svgRef.current;
    if (!svg) return { clientX: 0, clientY: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      clientX: rect.left + ((MARGIN.left + localX) * rect.width) / W,
      clientY: rect.top + ((MARGIN.top + localY) * rect.height) / H,
    };
  }

  const ariaSummary = plottable.length
    ? `${memberName}'s net worth from ${plottable[0].year} to ${plottable[plottable.length - 1].year}, latest midpoint ${formatCompactUSD(plottable[plottable.length - 1].midpoint)}.`
    : `${memberName} has no usable net worth data in this window.`;

  return (
    <div className="relative">
    <div className="flex flex-col lg:absolute lg:inset-0">
      <div ref={areaRef} className="lg:min-h-0 lg:flex-1">
      <ChartFrame width={W} height={H} margin={MARGIN} ariaLabel={ariaSummary} svgRef={svgRef}>
        {({ innerWidth, innerHeight }) => (
          <>
            {hasOpenEnded && (
              <defs>
                <linearGradient id="wealth-band-fade" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={Math.min(FADE_PX, innerHeight)}>
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity="0" />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.22" />
                </linearGradient>
              </defs>
            )}

            <Axis scale={y} orientation="left" ticks={yTicks} offset={0} gridExtent={innerWidth} zeroAt={0} format={tickLabel} />
            <Axis scale={x} orientation="bottom" ticks={xTicks} offset={innerHeight} format={(v) => String(v)} />

            {bandRuns.map((run, i) => {
              const runHasOpenEnded = run.some((p) => p.range.openEnded);
              const topPoints = run.map((p) => ({
                x: x(p.year),
                y: y(p.range.openEnded ? yHi : (p.range.hi as number)),
              }));
              const bottomPoints = [...run]
                .reverse()
                .map((p) => ({ x: x(p.year), y: y(p.range.lo as number) }));
              const d =
                [...topPoints, ...bottomPoints]
                  .map((pt, j) => `${j === 0 ? "M" : "L"}${pt.x},${pt.y}`)
                  .join(" ") + " Z";
              return (
                <path
                  key={i}
                  d={d}
                  fill={runHasOpenEnded ? "url(#wealth-band-fade)" : "var(--accent)"}
                  fillOpacity={runHasOpenEnded ? 1 : 0.16}
                />
              );
            })}

            {lineSegments.map((seg, i) => (
              <line
                key={i}
                x1={x(seg.from.year)}
                y1={y(seg.from.midpoint)}
                x2={x(seg.to.year)}
                y2={y(seg.to.midpoint)}
                className="stroke-accent"
                strokeWidth={1.75}
                strokeDasharray={seg.dashed ? "4 3" : undefined}
              />
            ))}

            {plottable.map((p) => (
              <circle
                key={p.year}
                cx={x(p.year)}
                cy={y(p.midpoint)}
                r={p.year === selectedYear ? 6 : 4}
                className={p.kind === "needs_review" ? "fill-surface stroke-accent" : "fill-accent"}
                strokeWidth={p.kind === "needs_review" ? 2 : 0}
                strokeDasharray={p.kind === "needs_review" ? "2 1.5" : undefined}
                style={{ cursor: "pointer" }}
                onPointerEnter={() => tip.show(p, svgPoint(x(p.year), y(p.midpoint)))}
                onPointerLeave={tip.hide}
                onClick={() => onSelectYear(p.year)}
              />
            ))}

            {gapRuns.map((g) => (
              <text
                key={g.midYear}
                x={x(g.midYear)}
                y={innerHeight + 30}
                textAnchor="middle"
                className="axis-tick-label"
                opacity={0.55}
              >
                {g.anyNotExtractable ? "not extractable" : "no filing"}
              </text>
            ))}
          </>
        )}
      </ChartFrame>
      </div>

      <Tooltip state={tip.state}>
        {(p) => <YearHoverCard point={p} />}
      </Tooltip>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.72rem] text-ink-muted">
        <LegendLine className="stroke-accent" label="Midpoint" />
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-4 flex-none rounded-sm bg-accent opacity-20" />
          Full reported range
        </span>
        {hasNeedsReview && (
          <span className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="flex-none">
              <circle cx="6" cy="6" r="4" className="fill-surface stroke-accent" strokeWidth={1.5} strokeDasharray="1.5 1.2" />
            </svg>
            Needs review
          </span>
        )}
        {hasBridgedGap && <LegendLine className="stroke-accent" dashed label="No filing (bridged)" />}
      </div>
    </div>
    </div>
  );
}

function LegendLine({ className, dashed, label }: { className: string; dashed?: boolean; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="18" height="8" viewBox="0 0 18 8" aria-hidden className="flex-none">
        <line x1="0" y1="4" x2="18" y2="4" strokeWidth={1.75} className={className} strokeDasharray={dashed ? "4 3" : undefined} />
      </svg>
      {label}
    </span>
  );
}

function YearHoverCard({ point }: { point: Plottable }) {
  const filingYear = filingYearOf(point.filingDate);
  const midpointText = point.range.openEnded ? formatOpenEndedUSD(point.midpoint) : formatCompactUSD(point.midpoint);
  const rangeText = point.range.unavailable
    ? "Unavailable"
    : point.range.openEnded
      ? `${formatCompactUSD(point.range.lo!)} or more`
      : `${formatCompactUSD(point.range.lo!)} – ${formatCompactUSD(point.range.hi!)}`;

  return (
    <div className="min-w-[11rem] text-[0.78rem]">
      <p className="font-medium text-ink">
        {point.year}
        {filingYear != null && <span className="text-ink-faint"> · filed in {filingYear}</span>}
      </p>
      {point.kind === "needs_review" && (
        <p className="mt-0.5 text-[0.68rem] text-note">Needs review — low-confidence extraction</p>
      )}
      <dl className="mt-1.5 space-y-0.5 font-mono text-[0.72rem] text-ink-muted">
        <div className="flex justify-between gap-3">
          <dt>Midpoint</dt>
          <dd className="text-ink">{midpointText}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Range</dt>
          <dd>{rangeText}</dd>
        </div>
        {point.assetsTotal != null && (
          <div className="flex justify-between gap-3">
            <dt>Assets</dt>
            <dd>{formatCompactUSD(point.assetsTotal)}</dd>
          </div>
        )}
        {point.liabilitiesTotal != null && (
          <div className="flex justify-between gap-3">
            <dt>Liabilities</dt>
            <dd>{formatCompactUSD(point.liabilitiesTotal)}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
