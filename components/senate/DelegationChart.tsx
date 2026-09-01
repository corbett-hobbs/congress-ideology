"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { scaleLinear } from "d3-scale";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { Axis } from "@/components/charts/Axis";
import { Tooltip, useTooltip } from "@/components/charts/Tooltip";
import type { ChamberMember } from "@/lib/congress-types";
import { memberPath } from "@/lib/member-url";
import { useElementWidth } from "@/lib/use-element-width";
import { MemberTooltip } from "./MemberTooltip";
import { GROUP_FILL_CLASS, stateName } from "./format";

/** Used before the container is first measured (avoids a zero-width flash). */
const FALLBACK_W = 1100;
const MARGIN = { top: 26, right: 66, bottom: 8, left: 124 };
const ROW_H = 26;
const TICKS = [-1, -0.5, 0, 0.5, 1];
const NARROW_TICKS = [-1, 0, 1];

export type DelegationSort = "gap" | "az";
/** "pair" — each state's two senators (dumbbell). "range" — a state's whole
 *  House delegation as a min→max spread on dimension 1. */
export type DelegationMode = "pair" | "range";

interface PairRow {
  state: string;
  members: [ChamberMember, ChamberMember];
  gap: number;
}

interface RangeRow {
  state: string;
  members: ChamberMember[];
  lo: ChamberMember;
  hi: ChamberMember;
  dem: number;
  rep: number;
  gap: number;
}

export interface DelegationSummary {
  shown: number;
  totalStates: number;
  omitted: number;
}

function groupByState(members: ChamberMember[]): Map<string, ChamberMember[]> {
  const byState = new Map<string, ChamberMember[]>();
  for (const m of members) {
    if (m.dim1 == null) continue;
    const arr = byState.get(m.state) ?? [];
    arr.push(m);
    byState.set(m.state, arr);
  }
  return byState;
}

/** Pick the two senators who actually held the seats (most votes cast). */
export function buildDelegations(
  members: ChamberMember[],
  mode: DelegationMode = "pair",
): {
  pairs: PairRow[];
  ranges: RangeRow[];
  summary: DelegationSummary;
} {
  const byState = groupByState(members);
  const totalStates = new Set(members.map((m) => m.state)).size;

  if (mode === "range") {
    const ranges: RangeRow[] = [];
    for (const [state, arr] of byState) {
      const sorted = [...arr].sort(
        (a, b) => (a.dim1 as number) - (b.dim1 as number),
      );
      ranges.push({
        state,
        members: sorted,
        lo: sorted[0],
        hi: sorted[sorted.length - 1],
        dem: sorted.filter((m) => m.group === "dem").length,
        rep: sorted.filter((m) => m.group === "rep").length,
        gap:
          (sorted[sorted.length - 1].dim1 as number) -
          (sorted[0].dim1 as number),
      });
    }
    return {
      pairs: [],
      ranges,
      summary: {
        shown: ranges.length,
        totalStates,
        omitted: totalStates - ranges.length,
      },
    };
  }

  const pairs: PairRow[] = [];
  let omitted = 0;
  for (const [state, arr] of byState) {
    if (arr.length < 2) {
      omitted += 1;
      continue;
    }
    const [a, b] = [...arr]
      .sort((x, y) => (y.nVotes ?? 0) - (x.nVotes ?? 0))
      .slice(0, 2);
    pairs.push({
      state,
      members: [a, b],
      gap: Math.abs((a.dim1 as number) - (b.dim1 as number)),
    });
  }

  return {
    pairs,
    ranges: [],
    summary: { shown: pairs.length, totalStates, omitted },
  };
}

interface DelegationChartProps {
  members: ChamberMember[];
  mode?: DelegationMode;
  sort?: DelegationSort;
  /** Render only this state's row (profile pages / filtered explorer). */
  filterState?: string;
  /** Enlarge this member's dot and ring it. */
  highlightId?: string;
  /** Click a row to filter the explorer to that state. */
  onSelectState?: (state: string) => void;
}

export function DelegationChart({
  members,
  mode = "pair",
  sort = "gap",
  filterState,
  highlightId,
  onSelectState,
}: DelegationChartProps) {
  const router = useRouter();
  const tip = useTooltip<ChamberMember>();
  const [wrapRef, measuredW] = useElementWidth<HTMLDivElement>();
  // Size the chart's own coordinate space to its actual container (rather
  // than a fixed logical width the browser then stretches or shrinks) so
  // labels render at their real, readable size on any screen.
  const W = measuredW || FALLBACK_W;

  const { pairs, ranges } = useMemo(
    () => buildDelegations(members, mode),
    [members, mode],
  );

  const rows = useMemo(() => {
    let copy: (PairRow | RangeRow)[] = mode === "range" ? [...ranges] : [...pairs];
    if (filterState) copy = copy.filter((d) => d.state === filterState);
    copy.sort(
      sort === "gap"
        ? (a, b) => b.gap - a.gap
        : (a, b) => stateName(a.state).localeCompare(stateName(b.state)),
    );
    return copy;
  }, [pairs, ranges, mode, sort, filterState]);

  // A single embedded row gets more height so dots and names read.
  const rowH = filterState && mode === "pair" ? 52 : ROW_H;
  const height = MARGIN.top + rows.length * rowH + MARGIN.bottom;
  // Fewer x-axis ticks once there isn't room for all five without overlapping.
  const ticks = W < 420 ? NARROW_TICKS : TICKS;

  return (
    <div ref={wrapRef}>
      <ChartFrame
        width={W}
        height={height}
        margin={MARGIN}
        ariaLabel={
          mode === "range"
            ? "Range chart of each state's delegation on dimension 1"
            : "Dumbbell chart of each state's two senators by dimension 1"
        }
      >
        {({ innerWidth }) => {
          const x = scaleLinear().domain([-1, 1]).range([0, innerWidth]);
          const plotH = rows.length * rowH;

          return (
            <>
              <Axis
                scale={x}
                orientation="bottom"
                ticks={ticks}
                offset={-14}
                gridExtent={-(plotH + 20)}
                zeroAt={0}
                format={(v) => v.toFixed(1)}
              />

              {rows.map((row, i) => {
                const y = i * rowH + rowH / 2;
                const selectable = onSelectState != null;
                const rowMembers =
                  mode === "range"
                    ? (row as RangeRow).members
                    : (row as PairRow).members;
                const xs = rowMembers.map((m) => x(m.dim1 as number));

                return (
                  <g
                    key={row.state}
                    style={selectable ? { cursor: "pointer" } : undefined}
                    onClick={
                      selectable
                        ? () => onSelectState!(row.state)
                        : undefined
                    }
                  >
                    <text
                      className="deleg-state-label"
                      x={-MARGIN.left + 2}
                      y={y + 4}
                    >
                      {stateName(row.state)}
                    </text>
                    <line
                      className="deleg-row-line"
                      x1={Math.min(...xs)}
                      x2={Math.max(...xs)}
                      y1={y}
                      y2={y}
                    />
                    {rowMembers.map((m, si) => {
                      const isHi = m.bioguideId === highlightId;
                      const mx = x(m.dim1 as number);
                      const isEndpoint =
                        mode === "pair" ||
                        m === (row as RangeRow).lo ||
                        m === (row as RangeRow).hi;
                      return (
                        <g key={`${m.bioguideId}:${si}`}>
                          {filterState && mode === "pair" && (
                            <text
                              className="deleg-gap-label"
                              x={mx}
                              y={si === 0 ? y - 12 : y + 20}
                              textAnchor="middle"
                              fill="var(--ink-muted)"
                            >
                              {m.lastName} {(m.dim1 as number).toFixed(2)}
                            </text>
                          )}
                          <circle
                            className={`deleg-dot ${GROUP_FILL_CLASS[m.group]}${isHi ? " is-highlighted" : ""}`}
                            cx={mx}
                            cy={y}
                            r={isHi ? 7 : isEndpoint ? 5 : 3}
                            opacity={isEndpoint ? 1 : 0.5}
                            style={{ cursor: "pointer" }}
                            onPointerEnter={(e) => tip.show(m, e)}
                            onPointerMove={tip.move}
                            onPointerLeave={tip.hide}
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(memberPath(m));
                            }}
                          />
                        </g>
                      );
                    })}
                    <text
                      className="deleg-gap-label"
                      x={innerWidth + 14}
                      y={y + 4}
                    >
                      {mode === "range"
                        ? `${(row as RangeRow).dem}D·${(row as RangeRow).rep}R`
                        : row.gap.toFixed(2)}
                    </text>
                  </g>
                );
              })}
            </>
          );
        }}
      </ChartFrame>
      <Tooltip state={tip.state}>{(m) => <MemberTooltip member={m} />}</Tooltip>
    </div>
  );
}
