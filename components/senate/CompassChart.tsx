"use client";

import { useMemo } from "react";
import {
  ScatterPlot,
  type ScatterLabel,
} from "@/components/charts/ScatterPlot";
import type { ChamberMember } from "@/lib/congress-types";
import { memberNoun } from "@/lib/chamber";
import { hasProfilePage } from "@/lib/member-url";
import { partyFillClass } from "@/lib/party-palette";
import { MemberTooltip } from "./MemberTooltip";

/** Profile variant keeps the numeric ticks + in-SVG caption; explorer drops
 *  both (the card draws word-based axis labels around the plot). */
const MARGIN = { top: 20, right: 64, bottom: 30, left: 58 };
const EXPLORER_MARGIN = { top: 10, right: 10, bottom: 10, left: 10 };

interface CompassChartProps {
  /** Plottable members for the current Congress, sorted by dim1. */
  members: ChamberMember[];
  selectedId?: string | null;
  highlightedId?: string | null;
  /**
   * Additional members to ring, beyond `highlightedId` — the profile compass's
   * "nearest neighbors" mode passes the anchor's closest colleagues here.
   */
  highlightedIds?: readonly string[];
  onHover?: (m: ChamberMember | null) => void;
  onSelect?: (m: ChamberMember) => void;
  /** Fade every dot except the highlighted / selected one (profile pages). */
  dimUnfocused?: boolean;
  variant?: "profile" | "explorer";
}

export function CompassChart({
  members,
  selectedId = null,
  highlightedId = null,
  highlightedIds,
  onHover,
  onSelect,
  dimUnfocused = false,
  variant = "profile",
}: CompassChartProps) {
  const explorer = variant === "explorer";
  const chamber = members[0]?.chamber ?? "senate";

  const labels = useMemo<ScatterLabel[]>(() => {
    const focused =
      (dimUnfocused && highlightedId
        ? members.find((m) => m.bioguideId === highlightedId)
        : null) ?? null;

    // The explorer card names the extremes in text below the chart, so skip
    // the SVG labels there (its tight margins would clip them anyway).
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

    const out: ScatterLabel[] = [];
    if (mostLiberal?.dim1 != null && mostLiberal.dim2 != null) {
      out.push({
        x: mostLiberal.dim1,
        y: mostLiberal.dim2,
        text: mostLiberal.lastName,
        anchor: "end",
        dx: -8,
        dy: 3,
      });
    }
    if (
      mostConservative &&
      mostConservative !== mostLiberal &&
      mostConservative.dim1 != null &&
      mostConservative.dim2 != null
    ) {
      out.push({
        x: mostConservative.dim1,
        y: mostConservative.dim2,
        text: mostConservative.lastName,
        anchor: "start",
        dx: 8,
        dy: 3,
      });
    }
    if (focused?.dim1 != null && focused.dim2 != null) {
      out.push({
        x: focused.dim1,
        y: focused.dim2,
        text: focused.lastName,
        anchor: "middle",
        dy: -12,
        className: "dot-label is-focused-label",
      });
    }
    return out;
  }, [members, explorer, dimUnfocused, highlightedId]);

  return (
    <ScatterPlot<ChamberMember>
      points={members}
      ariaLabel={`Scatter plot of ${memberNoun(chamber, { plural: true })} by DW-NOMINATE ideology score`}
      width={640}
      height={explorer ? 470 : 600}
      margin={explorer ? EXPLORER_MARGIN : MARGIN}
      axisTickLabels={!explorer}
      yAxisCaption={!explorer ? "DIMENSION 2" : undefined}
      x={(m) => m.dim1 as number}
      y={(m) => m.dim2 as number}
      id={(m) => m.bioguideId}
      colorClass={(m) => partyFillClass(m)}
      highlightedId={highlightedId}
      highlightedIds={highlightedIds}
      selectedId={selectedId}
      dimUnfocused={dimUnfocused}
      onHover={onHover}
      onSelect={onSelect}
      isSelectable={(m) => hasProfilePage(m)}
      renderTooltip={(m) => <MemberTooltip member={m} />}
      labels={labels}
    />
  );
}
