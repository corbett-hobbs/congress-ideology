"use client";

import { useMemo } from "react";
import { SwarmRows, type SwarmRowData } from "@/components/charts/SwarmRows";
import {
  fmtScore,
  isDimmed,
  isSeated,
  partyLabel,
  type CourtFilter,
  type CourtJustice,
  type CourtPayload,
} from "@/lib/court-types";

export type PresidentSort = "chronological" | "spread";

const MARGIN = { top: 4, right: 84, bottom: 4, left: 112 };
const ROW_H = 30;

interface Tip {
  j: CourtJustice;
}

/**
 * "Who each president appointed": one row per appointing president as a
 * person, a dot per justice at their career average. Rides on the shared
 * `SwarmRows` (extended with a domain, per-dot rings and row tints) — nothing
 * here moves when the term changes; only rings and tints do.
 */
export function PresidentRows({
  data,
  term,
  filter,
  selectedId,
  sort,
  onSelect,
}: {
  data: CourtPayload;
  term: number;
  filter: CourtFilter;
  selectedId: number | null;
  sort: PresidentSort;
  onSelect: (id: number) => void;
}) {
  const rows = useMemo<SwarmRowData<Tip>[]>(() => {
    const byId = new Map(data.justices.map((j) => [j.id, j]));
    // Latest president first — also the tie-break for "Widest spread".
    let ordered = data.presidents
      .map((p) => {
        const js = p.justiceIds.map((id) => byId.get(id) as CourtJustice);
        const c = js.map((j) => j.career);
        return { p, js, spread: js.length > 1 ? Math.max(...c) - Math.min(...c) : -1 };
      })
      .reverse();
    if (sort === "spread") {
      ordered = [...ordered].sort(
        (a, b) => b.spread - a.spread, // stable: ties keep latest-first
      );
    }
    return ordered.map(({ p, js }) => {
      const sitting = js.some((j) => isSeated(j, term));
      return {
        id: p.key,
        label: p.key,
        labelHighlighted: sitting,
        tinted: sitting,
        faded: js.every((j) => isDimmed(j, filter)),
        meta: `${js.length} justice${js.length === 1 ? "" : "s"}`,
        points: [...js]
          .sort((a, b) => a.career - b.career)
          .map((j) => ({
            id: String(j.id),
            value: j.career,
            colorClass: j.party === "D" ? "fill-dem" : "fill-rep",
            emphasized: true,
            radius: 5.5,
            opacity: isDimmed(j, filter) ? 0.22 : 1,
            ring:
              selectedId === j.id
                ? ("selected" as const)
                : isSeated(j, term)
                  ? ("seated" as const)
                  : undefined,
            navigable: true,
            onClick: () => onSelect(j.id),
            tooltip: { j },
          })),
      };
    });
  }, [data, term, filter, selectedId, sort, onSelect]);

  return (
    <SwarmRows
      rows={rows}
      ariaLabel="Justices grouped by appointing president, at their career average score"
      margin={MARGIN}
      rowHeight={ROW_H}
      domain={data.domain}
      showAxis={false}
      renderTooltip={({ j }) => (
        <>
          <b>{j.name}</b>
          <div>
            Appointed by {j.pres} ({partyLabel(j.party)})
          </div>
          <div className="tt-mono">Career average: {fmtScore(j.career)}</div>
          <div className="tt-mono">
            Scored terms: {j.t0}–{j.t1}
          </div>
        </>
      )}
    />
  );
}
