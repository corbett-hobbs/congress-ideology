"use client";

import { useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { scaleLinear } from "d3-scale";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { useZoomPan, viewDomains, type ZoomView } from "@/components/charts/use-zoom-pan";
import { ZoomControls } from "@/components/charts/ZoomControls";
import { Axis } from "@/components/charts/Axis";
import { Tooltip, useTooltip } from "@/components/charts/Tooltip";
import { useElementWidth } from "@/lib/use-element-width";
import { hasProfilePage, memberPath } from "@/lib/member-url";
import { chamberLabel, type ChamberView } from "@/lib/chamber";
import { stateName } from "@/lib/states";
import { median, wealthCohort, type WealthMember } from "@/lib/wealth-derive";
import {
  NET_WORTH_CAP,
  clampNetWorth,
  firstNetWorth,
  isClipped,
  latestNetWorth,
  netWorthChange,
  pickStandouts,
  placeStandoutLabels,
  signedLog,
  signedLogInverse,
  yearsOfData,
  zoomTicks,
} from "@/lib/wealth-scatter";
import { wealthCountNoun } from "@/lib/wealth-copy";
import { formatCompactUSD, formatSignedCompactUSD } from "@/lib/format-money";
import {
  formatPointUSD,
  memberTitleLine,
  WealthMemberTooltip,
} from "./WealthMemberTooltip";

const T_MAX = signedLog(NET_WORTH_CAP);
const TICKS_DESKTOP = [
  -20_000_000, -5_000_000, -1_000_000, -100_000, 0, 100_000, 1_000_000, 5_000_000,
  20_000_000,
];
const TICKS_COMPACT = [-20_000_000, -1_000_000, 0, 1_000_000, 20_000_000];
const MAX_SIDE = 560;
const FALLBACK_W = 1080;
/** Below this card width the chart drops the standout labels and long axis
 *  titles (measured, not viewport — the card can be narrow on a wide page). */
const COMPACT_W = 560;
const MAX_ZOOM = 16;

function tickLabel(v: number): string {
  if (v === 0) return "$0";
  return v < 0 ? `-${formatCompactUSD(-v)}` : formatCompactUSD(v);
}

function lastNameOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1];
}

function partyLetter(m: WealthMember): "D" | "R" {
  return m.caucus === "Democrat" ? "D" : "R";
}

function noun(view: ChamberView): string {
  return view === "senate" ? "senator" : view === "house" ? "House member" : "member";
}

interface Dot {
  member: WealthMember;
  cx: number;
  cy: number;
  clipped: boolean;
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
  const [singleYearNotice, setSingleYearNotice] = useState<WealthMember | null>(null);
  const [wrapRef, measuredW] = useElementWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const tip = useTooltip<WealthMember>();

  const W = measuredW || FALLBACK_W;
  const compact = W < COMPACT_W;
  // Square plot: one side length for both axes, centred in the card. Mobile
  // trades axis titles for short captions, so it needs less margin.
  const margin = compact
    ? { top: 26, right: 14, bottom: 34, left: 50 }
    : { top: 16, right: 20, bottom: 46, left: 78 };
  const side = Math.max(
    180,
    Math.min(MAX_SIDE, W - margin.left - margin.right),
  );
  const padX = Math.max(0, (W - margin.left - margin.right - side) / 2);
  const left = margin.left + padX;
  const H = side + margin.top + margin.bottom;

  const clipId = `wealth-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const zoom = useZoomPan({
    svgRef,
    extent: T_MAX,
    maxK: MAX_ZOOM,
    getPlotBox: () => {
      const svg = svgRef.current;
      if (!svg) return null;
      const r = svg.getBoundingClientRect();
      const s = r.width / W;
      return {
        left: r.left + left * s,
        top: r.top + margin.top * s,
        width: side * s,
        height: side * s,
      };
    },
    // Zoom/pan moves every dot, so any open hover card is now misplaced.
    onViewChange: () => {
      setHoverId(null);
      tip.hide();
    },
  });
  const zoomed = zoom.zoomed;

  // Both axes: identical transform, identical domain — see lib/wealth-scatter.
  // Zooming narrows the same window on both, so the diagonal stays 45°.
  const visible = viewDomains(zoom.view, T_MAX);
  const x = scaleLinear().domain(visible.x).range([0, side]);
  const y = scaleLinear().domain(visible.y).range([side, 0]);

  /** Plot-area px of a member's dot under an arbitrary view. */
  function pointUnder(member: WealthMember, v: ZoomView): { cx: number; cy: number } {
    const d = viewDomains(v, T_MAX);
    const tx = signedLog(clampNetWorth(firstNetWorth(member)));
    const ty = signedLog(clampNetWorth(latestNetWorth(member)));
    return {
      cx: ((tx - d.x[0]) / (d.x[1] - d.x[0])) * side,
      cy: side - ((ty - d.y[0]) / (d.y[1] - d.y[0])) * side,
    };
  }
  const onPlot = (p: { cx: number; cy: number }) =>
    p.cx >= 0 && p.cx <= side && p.cy >= 0 && p.cy <= side;

  const changes = useMemo(() => cohort.map(netWorthChange), [cohort]);
  const growPct = changes.length
    ? Math.round((changes.filter((c) => c > 0).length / changes.length) * 100)
    : 0;
  const medianChange = median(changes);
  const stateCohortCount = stateFilter
    ? cohort.filter((m) => m.state === stateFilter).length
    : null;

  const dots = useMemo<Dot[]>(
    () =>
      cohort.map((member) => ({
        member,
        // Rounded: avoids a float-precision SSR/client hydration mismatch on
        // the same logical value (sub-pixel, invisible either way).
        cx: Math.round(x(signedLog(clampNetWorth(firstNetWorth(member)))) * 100) / 100,
        cy: Math.round(y(signedLog(clampNetWorth(latestNetWorth(member)))) * 100) / 100,
        clipped: isClipped(member),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cohort, side, zoom.view],
  );
  const dotById = useMemo(
    () => new Map(dots.map((d) => [d.member.bioguideId, d])),
    [dots],
  );

  // Draw order: everyone else, then state matches, then the ringed member.
  const drawOrder = useMemo(() => {
    const rank = (d: Dot) =>
      d.member.bioguideId === selectedId || d.member.bioguideId === hoverId
        ? 2
        : stateFilter && d.member.state === stateFilter
          ? 1
          : 0;
    return [...dots].sort((a, b) => rank(a) - rank(b));
  }, [dots, selectedId, hoverId, stateFilter]);

  const standoutLabels = useMemo(() => {
    if (compact) return [];
    const { top, bottom } = pickStandouts(cohort, 3);
    const entries = [...top, ...bottom]
      .map((e) => ({ entry: e, dot: dotById.get(e.member.bioguideId) }))
      .filter(
        (v): v is { entry: (typeof top)[number]; dot: Dot } =>
          v.dot != null && onPlot(v.dot),
      );
    const placed = placeStandoutLabels(
      entries.map((v) => v.dot),
      side,
    );
    return entries.map((v, i) => ({
      key: v.entry.member.bioguideId,
      ...placed[i],
      text: `${lastNameOf(v.entry.member.name)} (${partyLetter(v.entry.member)}) ${formatSignedCompactUSD(v.entry.change)}`,
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cohort, dotById, side, compact]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const byState = q.length === 2;
    return chamberMembers
      .filter((m) =>
        byState ? m.state.toLowerCase() === q : m.name.toLowerCase().includes(q),
      )
      .sort((a, b) => lastNameOf(a.name).localeCompare(lastNameOf(b.name)))
      .slice(0, 8);
  }, [query, chamberMembers]);

  function svgPoint(localX: number, localY: number): { clientX: number; clientY: number } {
    const svg = svgRef.current;
    if (!svg) return { clientX: 0, clientY: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      clientX: rect.left + (left + localX) * (rect.width / W),
      clientY: rect.top + (margin.top + localY) * (rect.height / H),
    };
  }

  function clampedCenter(member: WealthMember, k: number) {
    const slack = T_MAX - T_MAX / k;
    const clamp = (v: number) => Math.min(slack, Math.max(-slack, v));
    return {
      cx: clamp(signedLog(clampNetWorth(firstNetWorth(member)))),
      cy: clamp(signedLog(clampNetWorth(latestNetWorth(member)))),
    };
  }

  function clearSelection() {
    setSelectedId(null);
    setSingleYearNotice(null);
    tip.hide();
  }

  // Selection, not navigation: rings the dot and opens its hover card in place.
  function selectMember(member: WealthMember) {
    setQuery("");
    setSingleYearNotice(null);
    if (member.points.length < 2) {
      setSelectedId(null);
      tip.hide();
      setSingleYearNotice(member);
      return;
    }
    setSelectedId(member.bioguideId);
    // If they're outside the zoomed window, pan (keeping the zoom) to them.
    let at = pointUnder(member, zoom.view);
    if (!onPlot(at)) {
      zoom.centerOn(
        signedLog(clampNetWorth(firstNetWorth(member))),
        signedLog(clampNetWorth(latestNetWorth(member))),
      );
      at = pointUnder(member, {
        ...zoom.view,
        ...clampedCenter(member, zoom.view.k),
      });
    }
    tip.show(member, svgPoint(at.cx, at.cy));
  }

  const chamberNoun = wealthCountNoun(view);
  const capLabel = formatCompactUSD(NET_WORTH_CAP);
  const ariaSummary = `Scatter plot of net worth at each member's first usable filing (horizontal axis) against net worth at their latest usable filing (vertical axis), for ${cohort.length} ${chamberNoun} with 2 or more years of data. Both axes use the same signed-log scale, capped at plus or minus ${NET_WORTH_CAP / 1_000_000} million dollars; members beyond the cap are drawn as diamonds at the edge. The diagonal is no change: points above it grew, points below it shrank. Median change ${
    medianChange != null ? formatSignedCompactUSD(medianChange) : "unavailable"
  }.`;

  // Zoomed, each axis has its own window (panning is independent per axis).
  const fixedTicks = compact ? TICKS_COMPACT : TICKS_DESKTOP;
  const xTickT = (zoomed ? zoomTicks(visible.x, side) : fixedTicks).map(signedLog);
  const yTickT = (zoomed ? zoomTicks(visible.y, side) : fixedTicks).map(signedLog);

  const stats = [
    { value: `${growPct}%`, label: "grew" },
    {
      value: medianChange != null ? formatSignedCompactUSD(medianChange) : "—",
      label: "median change",
    },
    { value: cohort.length.toLocaleString("en-US"), label: "plotted" },
    ...(stateCohortCount != null
      ? [{ value: String(stateCohortCount), label: `in ${stateName(stateFilter!)}` }]
      : []),
  ];

  return (
    <section className="rounded-xl border border-line-strong bg-surface p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h2 className="font-serif text-xl font-medium text-ink sm:text-2xl">
            Where they started, where they are now
          </h2>
          {stateFilter && (
            <p className="mt-1 text-[0.85rem] text-ink-muted">
              {stateName(stateFilter)} highlighted
            </p>
          )}
        </div>

        <div className="relative w-full sm:w-64">
          <label className="sr-only" htmlFor="wealth-member-search">
            {`Find ${view === "both" ? "a member" : `a ${noun(view)}`}…`}
          </label>
          <input
            id="wealth-member-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && searchResults[0]) selectMember(searchResults[0]);
              else if (e.key === "Escape") {
                setQuery("");
                clearSelection();
              }
            }}
            placeholder={`Find ${view === "both" ? "a member" : `a ${noun(view)}`}…`}
            aria-label={`Find ${view === "both" ? "a member" : `a ${noun(view)}`}…`}
            className="w-full rounded-md border border-line-strong bg-surface-raised px-3 py-1.5 text-[0.85rem] text-ink placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          />
          {query.trim() && (
            <div className="absolute z-30 mt-1 w-full rounded-md border border-line-strong bg-surface shadow-lg">
              <p className="border-b border-line px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.06em] text-ink-faint">
                {searchResults.length
                  ? `${wealthCountNoun(view)} matching "${query.trim()}"`
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

      <div className="mt-4 flex flex-nowrap justify-between gap-3 font-mono text-[0.78rem] text-ink-muted sm:justify-start sm:flex-wrap sm:gap-x-6 sm:gap-y-1">
        {stats.map((s, i) => (
          <span
            key={s.label}
            className={`min-w-0 sm:flex-none sm:text-left ${i === stats.length - 1 && i > 0 ? "text-right" : ""}`}
          >
            <b className="block text-[1rem] text-ink sm:inline sm:text-[0.78rem]">{s.value}</b>{" "}
            <span className="block text-[0.7rem] leading-tight sm:inline sm:text-[0.78rem]">
              {s.label}
            </span>
          </span>
        ))}
      </div>

      {singleYearNotice && (
        <p className="mt-2 text-[0.8rem] text-note">
          {singleYearNotice.points.length === 0
            ? `${singleYearNotice.name} has no usable filings yet, so they aren’t plotted.`
            : `${singleYearNotice.name} has only 1 year of data, so they aren’t plotted. Latest: ${formatPointUSD(singleYearNotice.points[0])} (${singleYearNotice.points[0].year}).`}
        </p>
      )}

      <p className="mt-4 text-[0.85rem] leading-relaxed text-ink-muted">
        Includes {chamberNoun} with 2+ years of data. Diagonal = no change. Above it, they grew. Below it, they shrank. Distance from the
        line is the size of the change, not how fast it happened — the hover card has years
        and rate.
      </p>

      <div ref={wrapRef} className="relative mt-3">
        <ChartFrame
          width={W}
          height={H}
          margin={{ ...margin, left }}
          ariaLabel={ariaSummary}
          svgRef={svgRef}
          svgProps={zoom.svgProps}
          onPointerLeave={() => {
            setHoverId(null);
            if (!selectedId) tip.hide();
          }}
        >
          {() => (
            <>
              <Axis
                scale={x}
                orientation="bottom"
                ticks={xTickT}
                offset={side}
                gridExtent={side}
                zeroAt={0}
                format={(t) => tickLabel(signedLogInverse(t))}
              />
              <Axis
                scale={y}
                orientation="left"
                ticks={yTickT}
                offset={0}
                gridExtent={side}
                zeroAt={0}
                format={(t) => tickLabel(signedLogInverse(t))}
              />
              {compact ? (
                <>
                  <text className="axis-caption" x={side / 2} y={side + 32} textAnchor="middle">
                    Starting net worth →
                  </text>
                  <text className="axis-caption" x={-margin.left + 6} y={-12} textAnchor="start">
                    ↑ Current net worth
                  </text>
                </>
              ) : (
                <>
                  <text className="axis-tick-label" x={side / 2} y={side + 38} textAnchor="middle">
                    Net worth at first usable filing
                  </text>
                  <text
                    className="axis-tick-label"
                    transform={`translate(${-62},${side / 2}) rotate(-90)`}
                    textAnchor="middle"
                  >
                    Net worth at latest usable filing
                  </text>
                </>
              )}

              <clipPath id={clipId}>
                <rect x={0} y={0} width={side} height={side} />
              </clipPath>

              {/* Corner to corner of the square: a true 45° no-change line. */}
              <g clipPath={zoomed ? `url(#${clipId})` : undefined}>
                <line
                  x1={x(-T_MAX)}
                  y1={y(-T_MAX)}
                  x2={x(T_MAX)}
                  y2={y(T_MAX)}
                  stroke="var(--ink-muted)"
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                  pointerEvents="none"
                />

                {drawOrder.map((d) => {
                  const id = d.member.bioguideId;
                  const ringed = id === selectedId || id === hoverId;
                  const matches = !!stateFilter && d.member.state === stateFilter;
                  const dimmed = !!stateFilter && !matches;
                  const r = ringed ? 7 : matches ? 5.6 : dimmed ? 3.6 : 4.4;
                  const cls = `dot ${d.member.caucus === "Democrat" ? "fill-dem" : "fill-rep"}${ringed ? " is-highlighted" : ""}`;
                  const opacity = dimmed ? 0.28 : 1;
                  const linkable = hasProfilePage({ isCurrent: true });
                  const label = `${d.member.name} (${partyLetter(d.member)}), ${memberTitleLine(d.member)}: ${formatPointUSD(d.member.points[0])} to ${formatPointUSD(d.member.points[d.member.points.length - 1])}`;
                  const shape = d.clipped ? (
                    <polygon
                      points={`${d.cx},${d.cy - r * 1.35} ${d.cx + r * 1.35},${d.cy} ${d.cx},${d.cy + r * 1.35} ${d.cx - r * 1.35},${d.cy}`}
                      opacity={opacity}
                      className={cls}
                    />
                  ) : (
                    <circle cx={d.cx} cy={d.cy} r={r} opacity={opacity} className={cls} />
                  );
                  const handlers = {
                    onPointerEnter: () => {
                      setHoverId(id);
                      tip.show(d.member, svgPoint(d.cx, d.cy));
                    },
                    onPointerLeave: () => {
                      setHoverId(null);
                      if (selectedId && selectedId !== id) {
                        const sel = dotById.get(selectedId);
                        if (sel && onPlot(sel)) tip.show(sel.member, svgPoint(sel.cx, sel.cy));
                      } else if (!selectedId) tip.hide();
                    },
                  };
                  return linkable ? (
                    <Link
                      key={id}
                      href={memberPath(d.member)}
                      aria-label={label}
                      tabIndex={-1}
                      {...handlers}
                    >
                      {shape}
                    </Link>
                  ) : (
                    <g key={id} role="img" aria-label={label} {...handlers}>
                      {shape}
                    </g>
                  );
                })}

              </g>

              {standoutLabels.map((l) => (
                <text
                  key={l.key}
                  x={l.x}
                  y={l.y}
                  textAnchor={l.anchor}
                  className="dot-label"
                  // Surface-coloured halo keeps the text legible over the dot cloud.
                  style={{ paintOrder: "stroke", stroke: "var(--surface)", strokeWidth: 3 }}
                >
                  {l.text}
                </text>
              ))}
            </>
          )}
        </ChartFrame>
        <ZoomControls
          onZoomIn={zoom.zoomIn}
          onZoomOut={zoom.zoomOut}
          onReset={zoom.reset}
          canZoomIn={zoom.canZoomIn}
          zoomed={zoomed}
          className=""
          style={{ left: left + 6, top: margin.top + 6 }}
        />
        <Tooltip state={tip.state}>{(m) => <WealthMemberTooltip member={m} />}</Tooltip>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[0.72rem] text-ink-muted">
        <LegendSwatch className="bg-dem" label="Democrat" />
        <LegendSwatch className="bg-rep" label="Republican" />
        <span className="flex items-center gap-1.5">
          <svg width="16" height="8" viewBox="0 0 16 8" aria-hidden className="flex-none">
            <line x1="0" y1="7" x2="16" y2="1" stroke="var(--ink-muted)" strokeWidth={1.5} strokeDasharray="3 2" />
          </svg>
          No change
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="flex-none">
            <polygon points="6,0.5 11.5,6 6,11.5 0.5,6" fill="var(--ink-faint)" />
          </svg>
          Beyond ±{capLabel}, drawn at the edge
        </span>
      </div>

      <p className="mt-3 text-[0.72rem] leading-relaxed text-ink-faint">
        Years are the year each report covers, not the year it was filed. Both axes use the
        same signed-log scale, capped at ±{capLabel} so a handful of very large estimates
        don’t compress everyone else near zero; points beyond the cap are drawn as diamonds
        at the edge, with the true value in the label and hover card. Zoom with the +/− buttons,
        Ctrl/⌘ + scroll or a pinch, and drag to pan. Pick a state to highlight its members. Pick a member in the search to see their filings; members
        with missing early years get a note there. Estimates for members reporting an
        open-ended “Over $50,000,000” band are approximate and marked with a +.
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

/** Table fallback for the chart (accessibility) — every cohort member's
 *  before/after as a plain table, collapsed by default. */
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
              {["Name", "Chamber", "State", "Party", "Years", "First", "Latest", "Change"].map(
                (h) => (
                  <th
                    key={h}
                    className="border-b border-line px-2 py-1.5 text-left font-mono text-[0.65rem] uppercase tracking-[0.05em] text-ink-faint"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {cohort.map((m) => (
              <tr key={m.bioguideId} className="border-b border-line last:border-0">
                <td className="px-2 py-1">
                  <Link href={memberPath(m)} className="hover:underline">
                    {m.name}
                  </Link>
                </td>
                <td className="px-2 py-1">{chamberLabel(m.chamber)}</td>
                <td className="px-2 py-1">{m.state}</td>
                <td className="px-2 py-1">{partyLetter(m)}</td>
                <td className="px-2 py-1">{yearsOfData(m)}</td>
                <td className="px-2 py-1">{formatPointUSD(m.points[0])}</td>
                <td className="px-2 py-1">{formatPointUSD(m.points[m.points.length - 1])}</td>
                <td className="px-2 py-1">{formatSignedCompactUSD(netWorthChange(m))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
