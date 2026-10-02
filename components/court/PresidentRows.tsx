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

// Room above the plot for the score axis; the label gutter fits the longest president key ("G.H.W. Bush").
const MARGIN = { top: 26, right: 92, bottom: 8, left: 84 };
const ROW_H = 38;
/** Dots closer than this fraction of the axis span are staggered up and down so they stay readable. */
const CLOSE = 0.07;

/** Every other integer (…, −4, −2, 0, 2, 4, …) across a domain, so the axis labels and gridlines stay sparse. */
const tickValues = ([lo, hi]: [number, number]) => {
  const out: number[] = [];
  for (let v = Math.ceil(lo / 2) * 2; v <= hi; v += 2) out.push(v);
  return out;
};
const fmtTick = (v: number) => (v === 0 ? "0" : `${v < 0 ? "−" : "+"}${Math.abs(v)}`);

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
  // Fit the axis to the justices' career averages (padded) rather than the wide interval domain, so the dots spread out.
  const domain = useMemo<[number, number]>(() => {
    const c = data.justices.map((j) => j.career);
    // Padding keeps the outermost dots (and their rings) clear of the row labels and the "N justices" text on a phone.
    return [Math.floor((Math.min(...c) - 0.6) * 2) / 2, Math.ceil((Math.max(...c) + 0.8) * 2) / 2];
  }, [data.justices]);

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
          .map((j, i, arr) => ({
            // Alternate close neighbours above and below the row's line.
            dy: i > 0 && j.career - arr[i - 1].career < CLOSE * (domain[1] - domain[0]) ? (i % 2 ? -9 : 9) : 0,
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
  }, [data, term, filter, selectedId, sort, onSelect, domain]);

  return (
    <SwarmRows
      rows={rows}
      ariaLabel="Justices grouped by appointing president, at their career average score"
      margin={MARGIN}
      rowHeight={ROW_H}
      domain={domain}
      ticks={tickValues(domain)}
      formatTick={fmtTick}
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
