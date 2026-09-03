"use client";

import { useMemo } from "react";
import { scaleLinear } from "d3-scale";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { Axis } from "@/components/charts/Axis";
import { Tooltip, useTooltip } from "@/components/charts/Tooltip";
import type { ChamberMember } from "@/lib/congress-types";
import { memberNoun } from "@/lib/chamber";
import { hasProfilePage } from "@/lib/member-url";
import { MemberTooltip } from "./MemberTooltip";
import { GROUP_FILL_CLASS } from "./format";

const W = 640;
const H = 600;
const MARGIN = { top: 20, right: 64, bottom: 30, left: 58 };
/** Explorer draws its own axis labels in HTML, so the SVG needs almost no gutter. */
const EXPLORER_MARGIN = { top: 10, right: 10, bottom: 10, left: 10 };
const TICKS = [-1, -0.5, 0, 0.5, 1];

interface CompassChartProps {
  /** Plottable senators for the current Congress, sorted by dim1. */
  members: ChamberMember[];
  selectedId?: string | null;
  highlightedId?: string | null;
  /**
   * Additional members to ring, beyond `highlightedId` — the profile compass's
   * "nearest neighbors" mode passes the anchor's closest colleagues here. Same
   * highlight treatment as `highlightedId`; the anchor still owns the label.
   */
  highlightedIds?: readonly string[];
  onHover?: (m: ChamberMember | null) => void;
  onSelect?: (m: ChamberMember) => void;
  /** Fade every dot except the highlighted / selected one (profile pages). */
  dimUnfocused?: boolean;
  /**
   * Tooltip for a small "i" marker beside the Dimension 2 axis label,
   * pointing at the methodological note below the chart. Only profile pages
   * pass this — the explorer renders its own HTML axis labels instead.
   */
  dim2NoteHint?: string;
  /**
   * "profile" (default) keeps the numeric tick labels and the in-SVG
   * "DIMENSION 2" caption. "explorer" drops both — the explorer card draws
   * word-based axis labels around the plot (see SenateExplorer / session 10).
   */
  variant?: "profile" | "explorer";
}

function zRank(
  m: ChamberMember,
  selectedId: string | null,
  highlightedId: string | null,
  ringed: ReadonlySet<string>,
) {
  if (m.bioguideId === highlightedId) return 3;
  if (ringed.has(m.bioguideId)) return 2;
  if (m.bioguideId === selectedId) return 1;
  return 0;
}

export function CompassChart({
  members,
  selectedId = null,
  highlightedId = null,
  highlightedIds,
  onHover,
  onSelect,
  dimUnfocused = false,
  dim2NoteHint,
  variant = "profile",
}: CompassChartProps) {
  const tip = useTooltip<ChamberMember>();
  const explorer = variant === "explorer";
  const ringed = useMemo(
    () => new Set(highlightedIds ?? []),
    [highlightedIds],
  );

  const chamber = members[0]?.chamber ?? "senate";
  const focused =
    (dimUnfocused && highlightedId
      ? members.find((m) => m.bioguideId === highlightedId)
      : null) ?? null;
  // Don't double-label the same dot as "most liberal/conservative". The
  // explorer card names them in text below the chart, so skip the SVG labels
  // there (its tight margins would clip them anyway).
  const mostLiberal =
    !explorer && members[0] && members[0].bioguideId !== focused?.bioguideId
      ? members[0]
      : undefined;
  const mostConservative =
    !explorer &&
    members.length > 1 &&
    members[members.length - 1].bioguideId !== focused?.bioguideId
      ? members[members.length - 1]
      : undefined;

  const drawOrder = useMemo(
    () =>
      [...members].sort(
        (a, b) =>
          zRank(a, selectedId, highlightedId, ringed) -
          zRank(b, selectedId, highlightedId, ringed),
      ),
    [members, selectedId, highlightedId, ringed],
  );

  return (
    <>
      <ChartFrame
        width={W}
        height={explorer ? 470 : H}
        margin={explorer ? EXPLORER_MARGIN : MARGIN}
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
                labels={!explorer}
                format={(v) => v.toFixed(1)}
              />
              <Axis
                scale={y}
                orientation="left"
                ticks={TICKS}
                offset={0}
                gridExtent={innerWidth}
                zeroAt={0}
                labels={!explorer}
                format={(v) => v.toFixed(1)}
              />
              {!explorer && (
                <text
                  className="axis-caption"
                  transform={`translate(${-42},${innerHeight / 2}) rotate(-90)`}
                  textAnchor="middle"
                >
                  DIMENSION 2
                </text>
              )}
              {!explorer && dim2NoteHint && (
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
                const isAnchor = m.bioguideId === highlightedId;
                const isHi = isAnchor || ringed.has(m.bioguideId);
                const isSel = m.bioguideId === selectedId;
                const faded = dimUnfocused && !isHi && !isSel;
                // Profile pages only exist for current members — don't wire a
                // click that would 404 (e.g. a scrubbed-back historical dot).
                const navigable = onSelect != null && hasProfilePage(m);
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
                    onClick={navigable ? () => onSelect!(m) : undefined}
                    style={navigable ? { cursor: "pointer" } : undefined}
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
              {focused?.dim1 != null && focused.dim2 != null && (
                <text
                  className="dot-label is-focused-label"
                  textAnchor="middle"
                  x={x(focused.dim1)}
                  y={y(focused.dim2) - 12}
                >
                  {focused.lastName}
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
