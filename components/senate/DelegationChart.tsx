"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { scaleLinear } from "d3-scale";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { Axis } from "@/components/charts/Axis";
import { Tooltip, useTooltip } from "@/components/charts/Tooltip";
import type { SenateMember } from "@/lib/senate-data";
import { senatorPath } from "@/lib/senator-url";
import { MemberTooltip } from "./MemberTooltip";
import { GROUP_FILL_CLASS, stateName } from "./format";

const W = 1100;
const MARGIN = { top: 26, right: 66, bottom: 8, left: 124 };
const ROW_H = 26;
const TICKS = [-1, -0.5, 0, 0.5, 1];

export type DelegationSort = "gap" | "az";

interface Delegation {
  state: string;
  senators: [SenateMember, SenateMember];
  gap: number;
}

export interface DelegationSummary {
  shown: number;
  totalStates: number;
  omitted: number;
}

/** Pick the two senators who actually held the seats (most votes cast). */
export function buildDelegations(members: SenateMember[]): {
  delegations: Delegation[];
  summary: DelegationSummary;
} {
  const byState = new Map<string, SenateMember[]>();
  for (const m of members) {
    const arr = byState.get(m.state) ?? [];
    arr.push(m);
    byState.set(m.state, arr);
  }

  const delegations: Delegation[] = [];
  let omitted = 0;
  for (const [state, arr] of byState) {
    if (arr.length < 2) {
      omitted += 1;
      continue;
    }
    const [a, b] = [...arr]
      .sort((x, y) => (y.nVotes ?? 0) - (x.nVotes ?? 0))
      .slice(0, 2);
    delegations.push({
      state,
      senators: [a, b],
      gap: Math.abs((a.dim1 as number) - (b.dim1 as number)),
    });
  }

  return {
    delegations,
    summary: { shown: delegations.length, totalStates: byState.size, omitted },
  };
}

interface DelegationChartProps {
  members: SenateMember[];
  sort?: DelegationSort;
  /** Render only this state's row (profile pages). */
  filterState?: string;
  /** Enlarge this senator's dot and ring it. */
  highlightId?: string;
}

export function DelegationChart({
  members,
  sort = "gap",
  filterState,
  highlightId,
}: DelegationChartProps) {
  const router = useRouter();
  const tip = useTooltip<SenateMember>();

  const { delegations } = useMemo(() => buildDelegations(members), [members]);

  const rows = useMemo(() => {
    let copy = [...delegations];
    if (filterState) copy = copy.filter((d) => d.state === filterState);
    copy.sort(
      sort === "gap"
        ? (a, b) => b.gap - a.gap
        : (a, b) => stateName(a.state).localeCompare(stateName(b.state)),
    );
    return copy;
  }, [delegations, sort, filterState]);

  // A single embedded row gets more height so the two dots and names read.
  const rowH = filterState ? 52 : ROW_H;
  const height = MARGIN.top + rows.length * rowH + MARGIN.bottom;

  return (
    <>
      <ChartFrame
        width={W}
        height={height}
        margin={MARGIN}
        ariaLabel="Dumbbell chart of each state's two senators by dimension 1"
      >
        {({ innerWidth }) => {
          const x = scaleLinear().domain([-1, 1]).range([0, innerWidth]);
          const plotH = rows.length * rowH;

          return (
            <>
              <Axis
                scale={x}
                orientation="bottom"
                ticks={TICKS}
                offset={-14}
                gridExtent={-(plotH + 20)}
                zeroAt={0}
                format={(v) => v.toFixed(1)}
              />

              {rows.map((row, i) => {
                const y = i * rowH + rowH / 2;
                const [a, b] = row.senators;
                const xa = x(a.dim1 as number);
                const xb = x(b.dim1 as number);
                return (
                  <g key={row.state}>
                    <text
                      className="deleg-state-label"
                      x={-MARGIN.left + 2}
                      y={y + 4}
                    >
                      {stateName(row.state)}
                    </text>
                    <line
                      className="deleg-row-line"
                      x1={Math.min(xa, xb)}
                      x2={Math.max(xa, xb)}
                      y1={y}
                      y2={y}
                    />
                    {row.senators.map((m, si) => {
                      const isHi = m.bioguideId === highlightId;
                      const mx = x(m.dim1 as number);
                      return (
                        <g key={m.bioguideId}>
                          {filterState && (
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
                            r={isHi ? 7 : 5}
                            style={{ cursor: "pointer" }}
                            onPointerEnter={(e) => tip.show(m, e)}
                            onPointerMove={tip.move}
                            onPointerLeave={tip.hide}
                            onClick={() => router.push(senatorPath(m))}
                          />
                        </g>
                      );
                    })}
                    <text
                      className="deleg-gap-label"
                      x={innerWidth + 14}
                      y={y + 4}
                    >
                      {row.gap.toFixed(2)}
                    </text>
                  </g>
                );
              })}
            </>
          );
        }}
      </ChartFrame>
      <Tooltip state={tip.state}>{(m) => <MemberTooltip member={m} />}</Tooltip>
    </>
  );
}
