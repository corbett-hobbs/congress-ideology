"use client";

import { useMemo, useRef, useState } from "react";
import { scaleLinear, scaleSymlog } from "d3-scale";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { Axis } from "@/components/charts/Axis";
import { Tooltip, useTooltip } from "@/components/charts/Tooltip";
import { useElementWidth } from "@/lib/use-element-width";
import { memberPath } from "@/lib/member-url";
import { chamberLabel, type ChamberView } from "@/lib/chamber";
import { stateName } from "@/lib/states";
import {
  annualizedRate,
  isPinnedOutlier,
  median,
  wealthCohort,
  type WealthMember,
} from "@/lib/wealth-derive";
import {
  jitterOffsets,
  jitterSpreadWidth,
  pickStandouts,
  spreadLabelsY,
  yearsOfData,
} from "@/lib/wealth-scatter";
import { wealthCountNoun } from "@/lib/wealth-copy";
import { formatCompactUSD, formatSignedCompactUSD } from "@/lib/format-money";
import { memberTitleLine, WealthMemberTooltip } from "./WealthMemberTooltip";

const CAP = 15_000_000;
const AXIS_MAX = CAP * 1.05;
const Y_TICKS = [
  -10_000_000, -1_000_000, -100_000, -10_000, 0, 10_000, 100_000, 1_000_000,
  10_000_000,
];
const X_MAX = 12;
const H = 460;
const MARGIN = { top: 16, right: 26, bottom: 40, left: 64 };
const FALLBACK_W = 1080;

function tickLabel(v: number): string {
  if (v === 0) return "$0";
  return v < 0 ? `-${formatCompactUSD(-v)}` : formatCompactUSD(v);
}

function lastNameOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1];
}

interface Dot {
  member: WealthMember;
  cx: number;
  cy: number;
  rate: number;
  pinned: boolean;
}

interface Props {
  view: ChamberView;
  /** Every cohort-eligible member of the selected chamber(s) — never
   *  filtered by state (the state filter dims/highlights, it never hides). */
  chamberMembers: WealthMember[];
  stateFilter: string | null;
}

export function NetWorthScatterCard({ view, chamberMembers, stateFilter }: Props) {
  const cohort = useMemo(() => wealthCohort(chamberMembers), [chamberMembers]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [singleYearNotice, setSingleYearNotice] = useState<WealthMember | null>(
    null,
  );
  const [wrapRef, measuredW] = useElementWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const tip = useTooltip<WealthMember>();

  const W = measuredW || FALLBACK_W;
  const innerWidth = W - MARGIN.left - MARGIN.right;
  const innerHeight = H - MARGIN.top - MARGIN.bottom;

  const x = scaleLinear().domain([0, X_MAX]).range([0, innerWidth]);
  const y = scaleSymlog()
    .constant(5000)
    .domain([-AXIS_MAX, AXIS_MAX])
    .range([innerHeight, 0]);

  const rates = useMemo(() => cohort.map(annualizedRate), [cohort]);
  const sharePositivePct = rates.length
    ? Math.round((rates.filter((r) => r > 0).length / rates.length) * 100)
    : 0;
  const medianRate = median(rates);
  const stateCohortCount = stateFilter
    ? cohort.filter((m) => m.state === stateFilter).length
    : null;

  const dots = useMemo<Dot[]>(() => {
    const byYears = new Map<number, WealthMember[]>();
    for (const m of cohort) {
      const yrs = yearsOfData(m);
      const list = byYears.get(yrs);
      if (list) list.push(m);
      else byYears.set(yrs, [m]);
    }
    const columnWidth = innerWidth / (X_MAX + 1);
    const spread = jitterSpreadWidth(columnWidth);
    const out: Dot[] = [];
    for (const [yrs, members] of byYears) {
      const sorted = [...members].sort((a, b) =>
        a.bioguideId.localeCompare(b.bioguideId),
      );
      const offsets = jitterOffsets(sorted.length, spread);
      sorted.forEach((member, i) => {
        const rate = annualizedRate(member);
        const pinned = isPinnedOutlier(rate);
        const plotRate = pinned ? Math.sign(rate) * AXIS_MAX : rate;
        out.push({
          member,
          // Rounded: avoids a float-precision SSR/client hydration mismatch
          // on the exact same logical value (sub-pixel, invisible either way).
          cx: Math.round((x(yrs) + offsets[i]) * 100) / 100,
          cy: Math.round(y(plotRate) * 100) / 100,
          rate,
          pinned,
        });
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cohort, innerWidth]);

  const dotById = useMemo(
    () => new Map(dots.map((d) => [d.member.bioguideId, d])),
    [dots],
  );

  // Below ~480px the chart is measured (not viewBox-scaled — see the `W`
  // computation above), so its physical width shrinks while `.dot-label`'s
  // CSS font-size stays fixed: the full "Lastname (R) +$55.07M/yr ↑" labels
  // (fine at 1280px) crowd into each other and the dots below them. Fewer,
  // shorter labels rather than a smaller font — the rate is still one tap
  // away in the hover card.
  const compactLabels = W < 480;
  const standouts = useMemo(
    () => pickStandouts(cohort, compactLabels ? 1 : 3),
    [cohort, compactLabels],
  );
  const standoutLabels = useMemo(() => {
    const entries = [...standouts.top, ...standouts.bottom]
      .map((e) => {
        const dot = dotById.get(e.member.bioguideId);
        if (!dot) return null;
        return { entry: e, dot };
      })
      .filter((v): v is { entry: (typeof standouts.top)[number]; dot: Dot } => v != null);

    const ys = spreadLabelsY(
      entries.map((v) => v.dot.cy),
      compactLabels ? 20 : 14,
      innerHeight,
    );

    return entries.map((v, i) => {
      const nearRightEdge = v.dot.cx > innerWidth * 0.85;
      const letter = v.entry.member.caucus === "Democrat" ? "D" : "R";
      const arrow = v.entry.rate > 0 ? "↑" : "↓";
      const text = compactLabels
        ? `${lastNameOf(v.entry.member.name)} (${letter})`
        : v.dot.pinned
          ? `${lastNameOf(v.entry.member.name)} (${letter}) ${formatSignedCompactUSD(v.entry.rate)}/yr ${arrow}`
          : `${lastNameOf(v.entry.member.name)} (${letter})`;
      return {
        key: v.entry.member.bioguideId,
        x: v.dot.cx + (nearRightEdge ? -10 : 10),
        y: ys[i],
        anchor: nearRightEdge ? ("end" as const) : ("start" as const),
        text,
      };
    });
  }, [standouts, dotById, innerWidth, innerHeight, compactLabels]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const byState = q.length === 2;
    const matches = chamberMembers.filter((m) =>
      byState ? m.state.toLowerCase() === q : m.name.toLowerCase().includes(q),
    );
    return matches
      .sort((a, b) => lastNameOf(a.name).localeCompare(lastNameOf(b.name)))
      .slice(0, 8);
  }, [query, chamberMembers]);

  function svgPoint(localX: number, localY: number): { clientX: number; clientY: number } {
    const svg = svgRef.current;
    if (!svg) return { clientX: 0, clientY: 0 };
    const rect = svg.getBoundingClientRect();
    const scaleX = rect.width / W;
    const scaleY = rect.height / H;
    return {
      clientX: rect.left + (MARGIN.left + localX) * scaleX,
      clientY: rect.top + (MARGIN.top + localY) * scaleY,
    };
  }

  function selectMember(member: WealthMember) {
    setQuery("");
    setSingleYearNotice(null);
    if (member.points.length < 2) {
      // Not in the cohort — nothing to plot, so surface the note near the
      // stats row instead of trying to open a tooltip with no dot.
      setSelectedId(null);
      tip.hide();
      setSingleYearNotice(member);
      return;
    }
    setSelectedId(member.bioguideId);
    const dot = dotById.get(member.bioguideId);
    if (dot) tip.show(member, svgPoint(dot.cx, dot.cy));
  }

  const chamberNoun = wealthCountNoun(view);
  const ariaSummary = `Scatter plot of annualized net worth change vs. years of usable disclosure data, for ${cohort.length} ${chamberNoun} with 2 or more years of data. Median change ${
    medianRate != null ? formatSignedCompactUSD(medianRate) : "unavailable"
  } per year. The vertical axis is capped at plus or minus 15 million dollars per year; members beyond that are pinned to the edge.`;

  return (
    <section className="rounded-xl border border-line-strong bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-serif text-xl font-medium text-ink sm:text-2xl">
            Who outperformed, who lagged
          </h2>
          <p className="mt-1 text-[0.85rem] text-ink-muted">
            Real disclosures, 2013–2025 · {cohort.length} {chamberNoun} with 2+
            years of data
            {stateFilter && ` · ${stateName(stateFilter)} highlighted`}
          </p>
        </div>

        <div className="relative w-full max-w-[16rem] sm:w-64">
          <label className="sr-only" htmlFor="wealth-member-search">
            {`Find a ${view === "senate" ? "senator" : view === "house" ? "House member" : "member"}…`}
          </label>
          <input
            id="wealth-member-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Find a ${view === "senate" ? "senator" : view === "house" ? "House member" : "member"}…`}
            aria-label={`Find a ${view === "senate" ? "senator" : view === "house" ? "House member" : "member"}…`}
            className="w-full rounded-md border border-line-strong bg-surface-raised px-3 py-1.5 text-[0.85rem] text-ink placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          />
          {query.trim() && (
            <div className="absolute z-30 mt-1 w-full rounded-md border border-line-strong bg-surface shadow-lg">
              <p className="border-b border-line px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.06em] text-ink-faint">
                {searchResults.length
                  ? `${view === "senate" ? "Senators" : view === "house" ? "House members" : "Members"} matching "${query.trim()}"`
                  : "No match in this chamber."}
              </p>
              <ul className="max-h-64 overflow-y-auto">
                {searchResults.map((m) => (
                  <li key={m.bioguideId}>
                    <button
                      type="button"
                      onClick={() => selectMember(m)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[0.82rem] hover:bg-surface-raised"
                    >
                      <span
                        aria-hidden
                        className={`size-2 flex-none rounded-full ${m.caucus === "Democrat" ? "bg-dem" : "bg-rep"}`}
                      />
                      <span className="min-w-0 flex-1 truncate">{m.name}</span>
                      <span className="flex-none font-mono text-[0.7rem] text-ink-faint">
                        {memberTitleLine(m)}
                        {m.points.length < 2 ? " · not plotted" : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[0.78rem] text-ink-muted">
        <span>
          <b className="text-ink">{sharePositivePct}%</b> with a positive rate
        </span>
        <span>
          Median{" "}
          <b className="text-ink">
            {medianRate != null ? formatSignedCompactUSD(medianRate) : "—"}
          </b>
        </span>
        <span>
          <b className="text-ink">{cohort.length.toLocaleString("en-US")}</b>{" "}
          plotted
        </span>
        {stateCohortCount != null && (
          <span>
            <b className="text-ink">{stateCohortCount}</b> in {stateName(stateFilter!)}
          </span>
        )}
      </div>

      {singleYearNotice && (
        <p className="mt-2 text-[0.8rem] text-note">
          {singleYearNotice.name} has only 1 year of data, so they aren’t
          plotted. Latest: {formatCompactUSD(singleYearNotice.points[0].midpoint)}{" "}
          ({singleYearNotice.points[0].year}).
        </p>
      )}

      <div ref={wrapRef} className="mt-4">
        <ChartFrame
          width={W}
          height={H}
          margin={MARGIN}
          ariaLabel={ariaSummary}
          svgRef={svgRef}
        >
          {() => (
            <>
              <Axis
                scale={x}
                orientation="bottom"
                ticks={Array.from({ length: X_MAX + 1 }, (_, i) => i)}
                offset={innerHeight}
                gridExtent={innerHeight}
                format={(v) => String(v)}
              />
              <Axis
                scale={y}
                orientation="left"
                ticks={Y_TICKS}
                offset={0}
                zeroAt={0}
                format={tickLabel}
              />
              <text
                className="axis-tick-label"
                x={innerWidth / 2}
                y={innerHeight + 34}
                textAnchor="middle"
              >
                Years of net worth data (reporting years 2013–2025, not total
                tenure)
              </text>

              {medianRate != null && (
                <>
                  {(() => {
                    // Rounded to avoid a float-precision hydration mismatch
                    // between server and client renders of the same value —
                    // sub-pixel precision doesn't matter visually anyway.
                    const medianY =
                      Math.round(
                        y(Math.max(-AXIS_MAX, Math.min(AXIS_MAX, medianRate))) * 100,
                      ) / 100;
                    return (
                      <>
                        <line
                          x1={0}
                          x2={innerWidth}
                          y1={medianY}
                          y2={medianY}
                          className="stroke-accent"
                          strokeWidth={1.5}
                          strokeDasharray="4 3"
                        />
                        <text
                          x={innerWidth}
                          y={medianY - 5}
                          textAnchor="end"
                          className="dot-label"
                        >
                          Median {formatSignedCompactUSD(medianRate)}/yr
                        </text>
                      </>
                    );
                  })()}
                </>
              )}

              {dots.map((d) => {
                const highlighted =
                  d.member.bioguideId === selectedId ||
                  d.member.bioguideId === hoverId;
                const dimmed = stateFilter != null && d.member.state !== stateFilter;
                const r = highlighted ? 7 : dimmed ? 3.4 : 4.4;
                const colorClass = d.member.caucus === "Democrat" ? "fill-dem" : "fill-rep";
                const opacity = dimmed ? 0.28 : 1;
                const commonProps = {
                  onPointerEnter: () => {
                    setHoverId(d.member.bioguideId);
                    tip.show(d.member, svgPoint(d.cx, d.cy));
                  },
                  onPointerLeave: () => {
                    setHoverId(null);
                    tip.hide();
                  },
                  onClick: () => selectMember(d.member),
                  style: { cursor: "pointer" as const },
                };
                if (d.pinned) {
                  const up = d.rate > 0;
                  const s = highlighted ? 8 : 6;
                  const points = up
                    ? `${d.cx},${d.cy - s} ${d.cx - s},${d.cy + s} ${d.cx + s},${d.cy + s}`
                    : `${d.cx},${d.cy + s} ${d.cx - s},${d.cy - s} ${d.cx + s},${d.cy - s}`;
                  return (
                    <polygon
                      key={d.member.bioguideId}
                      {...commonProps}
                      points={points}
                      opacity={opacity}
                      className={`dot ${colorClass}${highlighted ? " is-highlighted" : ""}`}
                    />
                  );
                }
                return (
                  <circle
                    key={d.member.bioguideId}
                    {...commonProps}
                    cx={d.cx}
                    cy={d.cy}
                    r={r}
                    opacity={opacity}
                    className={`dot ${colorClass}${highlighted ? " is-highlighted" : ""}`}
                  />
                );
              })}

              {standoutLabels.map((l) => (
                <text
                  key={l.key}
                  x={l.x}
                  y={l.y}
                  textAnchor={l.anchor}
                  className="dot-label"
                >
                  {l.text}
                </text>
              ))}
            </>
          )}
        </ChartFrame>
        <Tooltip state={tip.state}>
          {(m) => (
            <WealthMemberTooltip member={m} pinned={dotById.get(m.bioguideId)?.pinned ?? false} />
          )}
        </Tooltip>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[0.72rem] text-ink-muted">
        <LegendSwatch className="bg-dem" label="Democrat" />
        <LegendSwatch className="bg-rep" label="Republican" />
        <span className="flex items-center gap-1.5">
          <svg width="16" height="8" viewBox="0 0 16 8" aria-hidden className="flex-none">
            <line x1="0" y1="4" x2="16" y2="4" stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="3 2" />
          </svg>
          Median
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="flex-none">
            <polygon points="6,1 1,10 11,10" fill="var(--ink-faint)" />
          </svg>
          Beyond ±$15M/yr, pinned to the edge
        </span>
      </div>

      <p className="mt-3 text-[0.72rem] leading-relaxed text-ink-faint">
        Years are the year each report covers, not the year it was filed.
        Annualized change is total change ÷ years of data, on a signed-log
        scale so a few multi-million outliers don’t flatten everyone else.
        Pick a state to highlight its members. Pick a member in the search to
        see their filings; members with missing early filings get a note
        there. Rates beyond ±$15M/yr are pinned to the edge as triangles so
        they don’t flatten everyone else; the label and hover card show the
        true value. Members with only 1–2 years of data can show extreme
        rates from one large one-time move. Estimates for members reporting
        an open-ended “Over $50,000,000” band are approximate and marked with
        a +.
      </p>

      <WealthScatterTable cohort={cohort} />
    </section>
  );
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className={`size-2.5 flex-none rounded-full ${className}`} />
      {label}
    </span>
  );
}

/** Table fallback for the chart (accessibility) — every cohort member's rate
 *  data as a plain, sortable-by-eye table, collapsed by default. */
function WealthScatterTable({ cohort }: { cohort: WealthMember[] }) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-[0.75rem] font-medium text-accent">
        View as table
      </summary>
      <div className="mt-2 max-h-80 overflow-y-auto rounded-md border border-line">
        <table className="w-full border-collapse text-[0.78rem]">
          <thead className="sticky top-0 bg-surface-raised">
            <tr>
              {["Name", "Chamber", "State", "Party", "Years", "First", "Last", "Rate"].map(
                (h) => (
                  <th key={h} className="border-b border-line px-2 py-1.5 text-left font-mono text-[0.65rem] uppercase tracking-[0.05em] text-ink-faint">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {cohort.map((m) => {
              const first = m.points[0];
              const last = m.points[m.points.length - 1];
              return (
                <tr key={m.bioguideId} className="border-b border-line last:border-0">
                  <td className="px-2 py-1">
                    <a href={memberPath(m)} className="hover:underline">
                      {m.name}
                    </a>
                  </td>
                  <td className="px-2 py-1">{chamberLabel(m.chamber)}</td>
                  <td className="px-2 py-1">{m.state}</td>
                  <td className="px-2 py-1">{m.caucus === "Democrat" ? "D" : "R"}</td>
                  <td className="px-2 py-1">{yearsOfData(m)}</td>
                  <td className="px-2 py-1">{formatCompactUSD(first.midpoint)}</td>
                  <td className="px-2 py-1">{formatCompactUSD(last.midpoint)}</td>
                  <td className="px-2 py-1">{formatSignedCompactUSD(annualizedRate(m))}/yr</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}
