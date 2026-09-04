import Link from "next/link";
import type { Neighbor } from "@/lib/neighbors";
import type { CommitteeSummary } from "@/lib/committee-types";
import { committeePath } from "@/lib/committee-url";

/**
 * Plain-text committee pills below the compass, shown only in
 * "Nearest neighbors" mode. Closest first. Deliberately lighter than the
 * member-search chips (`components/profile/NeighborChips`) — no colour dot, no
 * photo, no seat: a committee name is self-sufficient.
 */
export function CommitteeNeighborChips({
  neighbors,
}: {
  neighbors: Neighbor<CommitteeSummary>[];
}) {
  return (
    <div className="neighbor-chip-row flex gap-2 overflow-x-auto pb-1">
      {neighbors.map(({ member }) => (
        <Link
          key={member.committeeId}
          href={committeePath(member)}
          className="flex-none whitespace-nowrap rounded-full border border-line-strong bg-surface-raised px-2.5 py-1 text-[0.72rem] font-medium text-ink-muted transition-colors hover:border-accent hover:text-ink"
        >
          {member.shortName}
        </Link>
      ))}
    </div>
  );
}
