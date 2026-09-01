"use client";

import { useMemo } from "react";
import { scaleLinear } from "d3-scale";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { Axis } from "@/components/charts/Axis";
import { Tooltip, useTooltip } from "@/components/charts/Tooltip";
import type { ChamberMember } from "@/lib/congress-types";
import { memberNoun } from "@/lib/chamber";
import { MemberTooltip } from "./MemberTooltip";
import { GROUP_FILL_CLASS } from "./format";

const W = 640;
const H = 600;
const MARGIN = { top: 20, right: 64, bottom: 30, left: 58 };
const TICKS = [-1, -0.5, 0, 0.5, 1];

interface CompassChartProps {
  /** Plottable senators for the current Congress, sorted by dim1. */
  members: ChamberMember[];
  selectedId?: string | null;
  highlightedId?: string | null;
  onHover?: (m: ChamberMember | null) => void;
  onSelect?: (m: ChamberMember) => void;
  /** Fade every dot except the highlighted / selected one (profile pages). */
  dimUnfocused?: boolean;
  /**
   * Tooltip for a small "i" marker beside the Dimension 2 axis label,
   * pointing at the methodological note below the chart. Only the main
   * explorer passes this — profile pages leave it off (see spec / session 8).
   */
  dim2NoteHint?: string;
}

function zRank(m: ChamberMember, selectedId: string | null, highlightedId: string | null) {
  if (m.bioguideId === highlightedId) return 2;
  if (m.bioguideId === selectedId) return 1;
  return 0;
}

export function CompassChart({
  members,
  selectedId = null,
  highlightedId = null,
  onHover,
  onSelect,
  dimUnfocused = false,
  dim2NoteHint,
}: CompassChartProps) {
  const tip = useTooltip<ChamberMember>();

  const chamber = members[0]?.chamber ?? "senate";
  const mostLiberal = members[0];
  const mostConservative = members[members.length - 1];

  const drawOrder = useMemo(
    () =>
      [...members].sort(
        (a, b) =>
          zRank(a, selectedId, highlightedId) -
          zRank(b, selectedId, highlightedId),
      ),
    [members, selectedId, highlightedId],
  );

  return (
    <>
      <ChartFrame
        width={W}
        height={H}
        margin={MARGIN}
        ariaLabel={`Scatter plot of ${memberNoun(chamber, { plural: true })} by DW-NOMINATE ideology score`}
      >
        {({ innerWidth, innerHeight }) => {
          const x = scaleLinear().domain([-1, 1]).range([0, innerWidth]);
          const y = scaleLinear().domain([-1, 1]).range([innerHeight, 0]);

          return (
            <>
              <Axis
                scale={x}
                orientation="bottom"
                ticks={TICKS}
                offset={innerHeight}
                gridExtent={innerHeight}
                zeroAt={0}
                format={(v) => v.toFixed(1)}
              />
              <Axis
                scale={y}
                orientation="left"
                ticks={TICKS}
                offset={0}
                gridExtent={innerWidth}
                zeroAt={0}
                format={(v) => v.toFixed(1)}
              />
              <text
                className="axis-caption"
                transform={`translate(${-42},${innerHeight / 2}) rotate(-90)`}
                textAnchor="middle"
              >
                DIMENSION 2
              </text>
              {dim2NoteHint && (
                <g style={{ cursor: "help" }}>
                  <title>{dim2NoteHint}</title>
                  <circle
                    cx={-42}
                    cy={innerHeight / 2 - 54}
                    r={7}
                    fill="var(--surface)"
                    stroke="var(--ink-faint)"
                  />
                  <text
                    x={-42}
                    y={innerHeight / 2 - 50.5}
                    textAnchor="middle"
                    fontFamily="var(--font-mono)"
                    fontSize={9.5}
                    fill="var(--ink-muted)"
                  >
                    i
                  </text>
                </g>
              )}

              {drawOrder.map((m) => {
                const isHi = m.bioguideId === highlightedId;
                const isSel = m.bioguideId === selectedId;
                const faded = dimUnfocused && !isHi && !isSel;
                return (
                  <circle
                    key={m.bioguideId}
                    cx={x(m.dim1 as number)}
                    cy={y(m.dim2 as number)}
                    r={isHi ? 7.5 : isSel ? 6.5 : 4.6}
                    className={`dot ${GROUP_FILL_CLASS[m.group]}${isHi ? " is-highlighted" : ""}`}
                    opacity={faded ? 0.28 : 1}
                    onPointerEnter={(e) => {
                      onHover?.(m);
                      tip.show(m, e);
                    }}
                    onPointerMove={tip.move}
                    onPointerLeave={() => {
                      onHover?.(null);
                      tip.hide();
                    }}
                    onClick={onSelect ? () => onSelect(m) : undefined}
                    style={onSelect ? { cursor: "pointer" } : undefined}
                  />
                );
              })}

              {mostLiberal && (
                <text
                  className="dot-label"
                  textAnchor="end"
                  x={x(mostLiberal.dim1 as number) - 8}
                  y={y(mostLiberal.dim2 as number) + 3}
                >
                  {mostLiberal.lastName}
                </text>
              )}
              {mostConservative && mostConservative !== mostLiberal && (
                <text
                  className="dot-label"
                  textAnchor="start"
                  x={x(mostConservative.dim1 as number) + 8}
                  y={y(mostConservative.dim2 as number) + 3}
                >
                  {mostConservative.lastName}
                </text>
              )}
            </>
          );
        }}
      </ChartFrame>
      <Tooltip state={tip.state}>{(m) => <MemberTooltip member={m} />}</Tooltip>
    </>
  );
}
