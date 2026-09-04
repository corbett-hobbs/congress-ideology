"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ScatterPlot,
  type ScatterLabel,
} from "@/components/charts/ScatterPlot";
import type { CommitteeSummary } from "@/lib/committee-types";
import { committeeIsPlottable } from "@/lib/committee-types";
import { committeePath } from "@/lib/committee-url";
import { groupFillClass } from "@/lib/party-palette";
import { CommitteeDotTooltip } from "./CommitteeDotTooltip";

const MARGIN = { top: 20, right: 64, bottom: 30, left: 58 };
const EXPLORER_MARGIN = { top: 10, right: 10, bottom: 10, left: 10 };

/** Joint committees have no owning party — the neutral swatch, like independents. */
function fillClass(c: CommitteeSummary): string {
  return c.chamber === "joint" ? "fill-oth" : groupFillClass(c.controlGroup);
}

interface CommitteeCompassProps {
  /** The committees to plot (already chamber-scoped by the caller). */
  committees: CommitteeSummary[];
  /** The committee whose page this is — ringed, enlarged, permanently labelled. */
  subjectId?: string | null;
  /** Also ring these (nearest-neighbours mode on a committee page). */
  neighborIds?: readonly string[];
  /** Fade every committee except the subject / neighbours (committee page). */
  dimUnfocused?: boolean;
  /** Faint individual-member cloud behind the committee dots, for context. */
  backdrop?: readonly { dim1: number | null; dim2: number | null }[];
  onHover?: (c: CommitteeSummary | null) => void;
  variant?: "profile" | "explorer";
}

export function CommitteeCompass({
  committees,
  subjectId = null,
  neighborIds,
  dimUnfocused = false,
  backdrop,
  onHover,
  variant = "explorer",
}: CommitteeCompassProps) {
  const router = useRouter();
  const explorer = variant === "explorer";

  const points = useMemo(
    () => committees.filter(committeeIsPlottable),
    [committees],
  );

  const backdropPoints = useMemo(
    () =>
      (backdrop ?? [])
        .filter((m) => m.dim1 != null && m.dim2 != null)
        .map((m) => ({ x: m.dim1 as number, y: m.dim2 as number })),
    [backdrop],
  );

  const labels = useMemo<ScatterLabel[]>(() => {
    const subject = subjectId
      ? points.find((c) => c.committeeId === subjectId)
      : null;
    if (!subject || subject.dim1 == null || subject.dim2 == null) return [];
    return [
      {
        x: subject.dim1,
        y: subject.dim2,
        text: subject.shortName,
        anchor: "middle",
        dy: -12,
        className: "dot-label is-focused-label",
      },
    ];
  }, [points, subjectId]);

  return (
    <ScatterPlot<CommitteeSummary>
      points={points}
      ariaLabel="Scatter plot of committees by blended DW-NOMINATE ideology score"
      width={640}
      height={explorer ? 470 : 600}
      margin={explorer ? EXPLORER_MARGIN : MARGIN}
      axisTickLabels={!explorer}
      yAxisCaption={!explorer ? "DIMENSION 2" : undefined}
      x={(c) => c.dim1 as number}
      y={(c) => c.dim2 as number}
      id={(c) => c.committeeId}
      colorClass={fillClass}
      radius={(c, s) =>
        c.committeeId === subjectId ? 9 : s.highlighted ? 7 : 6.5
      }
      highlightedId={subjectId}
      highlightedIds={neighborIds}
      dimUnfocused={dimUnfocused}
      onHover={onHover}
      onSelect={(c) => router.push(committeePath(c))}
      renderTooltip={(c) => <CommitteeDotTooltip committee={c} />}
      labels={labels}
      backdrop={backdropPoints}
    />
  );
}
