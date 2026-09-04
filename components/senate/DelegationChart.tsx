"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  SwarmRows,
  type SwarmRowData,
} from "@/components/charts/SwarmRows";
import type { ChamberMember } from "@/lib/congress-types";
import { hasProfilePage, memberPath } from "@/lib/member-url";
import {
  PARTY_META,
  partyColorKey,
  partyFillClass,
  type PartyColorKey,
} from "@/lib/party-palette";
import { MemberTooltip } from "./MemberTooltip";
import { stateName } from "./format";
import { DEFAULT_SORT, type SortState } from "@/components/charts/SortToggle";

/** "range" carries a two-party count label ("9Pro·7Anti") — wider than the
 *  single gap number "pair" shows. */
const MARGIN = { top: 26, right: 66, bottom: 8, left: 124 };
const RANGE_RIGHT = 96;
const ROW_H = 26;

export type { SortState };
/** "pair" — each state's two senators (dumbbell). "range" — a state's whole
 *  House delegation as a min→max spread on dimension 1. */
export type DelegationMode = "pair" | "range";

interface PairRow {
  state: string;
  members: [ChamberMember, ChamberMember];
  gap: number;
  /** Mean dim1 across the row — the "Ideology" sort key. */
  mean: number;
}

interface RangeRow {
  state: string;
  members: ChamberMember[];
  lo: ChamberMember;
  hi: ChamberMember;
  /** Party breakdown, most-numerous first. */
  parties: { key: PartyColorKey; count: number }[];
  gap: number;
  /** Mean dim1 across the row — the "Ideology" sort key. */
  mean: number;
}

/** "12D·8R" / "9F·7D-R" — the two biggest parties in a delegation. */
function delegationLabel(parties: RangeRow["parties"]): string {
  return parties
    .slice(0, 2)
    .map((p) => `${p.count}${PARTY_META[p.key].abbr}`)
    .join("·");
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
      const partyCounts = new Map<PartyColorKey, number>();
      for (const m of sorted) {
        const k = partyColorKey(m);
        partyCounts.set(k, (partyCounts.get(k) ?? 0) + 1);
      }
      const sum = sorted.reduce((s, m) => s + (m.dim1 as number), 0);
      ranges.push({
        state,
        members: sorted,
        lo: sorted[0],
        hi: sorted[sorted.length - 1],
        parties: [...partyCounts.entries()]
          .map(([key, count]) => ({ key, count }))
          .sort((a, b) => b.count - a.count),
        gap:
          (sorted[sorted.length - 1].dim1 as number) -
          (sorted[0].dim1 as number),
        mean: sum / sorted.length,
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
      mean: ((a.dim1 as number) + (b.dim1 as number)) / 2,
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
  sort?: SortState;
  /** Render only this state's row (profile pages / filtered explorer). */
  filterState?: string;
  /** Keep every row, but visually emphasize this state's. */
  selectedState?: string | null;
  /** Enlarge this member's dot and ring it. */
  highlightId?: string;
  /** Click a row to filter the explorer to that state. */
  onSelectState?: (state: string) => void;
}

export function DelegationChart({
  members,
  mode = "pair",
  sort = DEFAULT_SORT,
  filterState,
  selectedState,
  highlightId,
  onSelectState,
}: DelegationChartProps) {
  const router = useRouter();

  const { pairs, ranges } = useMemo(
    () => buildDelegations(members, mode),
    [members, mode],
  );

  const sourceRows = useMemo(() => {
    let copy: (PairRow | RangeRow)[] = mode === "range" ? [...ranges] : [...pairs];
    if (filterState) copy = copy.filter((d) => d.state === filterState);
    copy.sort((a, b) => {
      if (sort.mode === "az")
        return stateName(a.state).localeCompare(stateName(b.state));
      if (sort.mode === "ideology") {
        const cmp = b.mean - a.mean;
        return sort.direction === "desc" ? cmp : -cmp;
      }
      return b.gap - a.gap;
    });
    return copy;
  }, [pairs, ranges, mode, sort, filterState]);

  const margin =
    mode === "range" ? { ...MARGIN, right: RANGE_RIGHT } : MARGIN;
  // A single embedded row gets more height so dots and names read.
  const rowHeight = filterState && mode === "pair" ? 52 : ROW_H;

  const rows: SwarmRowData<ChamberMember>[] = sourceRows.map((row) => {
    const isRange = mode === "range";
    const rangeRow = row as RangeRow;
    const rowMembers = isRange ? rangeRow.members : (row as PairRow).members;
    const isSelected = selectedState === row.state;

    return {
      id: row.state,
      label: stateName(row.state),
      labelHighlighted: isSelected,
      selected: isSelected,
      onRowClick: onSelectState ? () => onSelectState(row.state) : undefined,
      meta: isRange
        ? delegationLabel(rangeRow.parties)
        : row.gap.toFixed(2),
      points: rowMembers.map((m) => {
        const navigable = hasProfilePage(m);
        const isEndpoint =
          !isRange || m === rangeRow.lo || m === rangeRow.hi;
        return {
          id: m.bioguideId,
          value: m.dim1 as number,
          colorClass: partyFillClass(m),
          emphasized: isEndpoint,
          highlighted: m.bioguideId === highlightId,
          navigable,
          onClick: navigable
            ? () => router.push(memberPath(m))
            : undefined,
          tooltip: m,
        };
      }),
      annotations:
        filterState && mode === "pair"
          ? rowMembers.map((m, si) => ({
              value: m.dim1 as number,
              text: `${m.lastName} ${(m.dim1 as number).toFixed(2)}`,
              above: si === 0,
            }))
          : undefined,
    };
  });

  return (
    <SwarmRows<ChamberMember>
      rows={rows}
      margin={margin}
      rowHeight={rowHeight}
      ariaLabel={
        mode === "range"
          ? "Range chart of each state's delegation on dimension 1"
          : "Dumbbell chart of each state's two senators by dimension 1"
      }
      renderTooltip={(m) => <MemberTooltip member={m} />}
    />
  );
}
