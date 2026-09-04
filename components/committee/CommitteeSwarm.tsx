"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  SwarmRows,
  type SwarmRowData,
} from "@/components/charts/SwarmRows";
import {
  partySplit,
  type CommitteeMemberRow,
  type CommitteeSummary,
} from "@/lib/committee-types";
import { groupFillClass } from "@/lib/party-palette";
import { hasProfilePage, memberPath } from "@/lib/member-url";
import { committeePath } from "@/lib/committee-url";
import { DEFAULT_SORT, type SortState } from "@/components/charts/SortToggle";
import { CommitteeMemberTooltip } from "./CommitteeMemberTooltip";

/** Right-justified against the plot's outer edge (see charts/SwarmRows), so
 *  this only needs to fit the party-split text plus a small gap from the
 *  dots — see the matching note in senate/DelegationChart. */
const MARGIN = { top: 26, right: 72, bottom: 8, left: 210 };
const ROW_H = 26;
/** One committee's roster, full width, on a committee's own page. */
const SINGLE_ROW_MARGIN = { top: 20, right: 24, bottom: 8, left: 24 };
const SINGLE_ROW_H = 44;

const CHAMBER_ABBR = { house: "H", senate: "S", joint: "J" } as const;

/**
 * Row label: the short name, disambiguated by chamber only when two committees
 * in the set share it (House vs. Senate Judiciary). SwarmRows clips it to the
 * label gutter.
 */
function rowLabel(c: CommitteeSummary, ambiguous: Set<string>): string {
  return ambiguous.has(c.shortName)
    ? `${c.shortName} (${CHAMBER_ABBR[c.chamber]})`
    : c.shortName;
}

function toPoints(
  roster: CommitteeMemberRow[],
  router: ReturnType<typeof useRouter>,
) {
  const scored = roster.filter((r) => r.dim1 != null);
  const lo = scored[0];
  const hi = scored[scored.length - 1];
  return scored.map((m) => {
    const navigable = hasProfilePage(m);
    return {
      id: m.bioguideId,
      value: m.dim1 as number,
      colorClass: groupFillClass(m.group),
      emphasized: m === lo || m === hi,
      navigable,
      onClick: navigable ? () => router.push(memberPath(m)) : undefined,
      tooltip: m,
    };
  });
}

interface CommitteeSwarmProps {
  committees: CommitteeSummary[];
  sort?: SortState;
  /** Single-committee mode for a committee's own roster card — full width, no
   *  row-label link, taller row. */
  standalone?: boolean;
}

export function CommitteeSwarm({
  committees,
  sort = DEFAULT_SORT,
  standalone = false,
}: CommitteeSwarmProps) {
  const router = useRouter();

  const rows: SwarmRowData<CommitteeMemberRow>[] = useMemo(() => {
    const seen = new Set<string>();
    const ambiguous = new Set<string>();
    for (const c of committees) {
      if (seen.has(c.shortName)) ambiguous.add(c.shortName);
      seen.add(c.shortName);
    }

    const ordered = [...committees].sort((a, b) => {
      if (sort.mode === "az") return a.shortName.localeCompare(b.shortName);
      if (sort.mode === "ideology") {
        if (a.dim1 == null && b.dim1 == null) return 0;
        if (a.dim1 == null) return 1;
        if (b.dim1 == null) return -1;
        const cmp = b.dim1 - a.dim1;
        return sort.direction === "desc" ? cmp : -cmp;
      }
      return (b.spread ?? -1) - (a.spread ?? -1);
    });
    return ordered.map((c) => ({
      id: c.committeeId,
      // Standalone: the page header already names the committee and the split.
      label: standalone ? "" : rowLabel(c, ambiguous),
      onRowClick:
        standalone || ordered.length === 1
          ? undefined
          : () => router.push(committeePath(c)),
      meta: standalone ? "" : partySplit(c),
      points: toPoints(c.roster, router),
    }));
  }, [committees, sort, standalone, router]);

  return (
    <SwarmRows<CommitteeMemberRow>
      rows={rows}
      margin={standalone ? SINGLE_ROW_MARGIN : MARGIN}
      rowHeight={standalone ? SINGLE_ROW_H : ROW_H}
      ariaLabel="Each committee's members along DW-NOMINATE dimension 1"
      renderTooltip={(m) => <CommitteeMemberTooltip member={m} />}
    />
  );
}
