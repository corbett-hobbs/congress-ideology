import Link from "next/link";
import type { Neighbor } from "@/lib/neighbors";
import { memberPath } from "@/lib/member-url";
import { MemberPhoto } from "@/components/MemberPhoto";
import { GROUP_VAR, seatLabel } from "@/components/senate/format";

/**
 * The row of neighbor chips shown below the compass while "nearest neighbors"
 * mode is on. Each chip links to that member's profile and shows their seat
 * (state, plus district in the House). Scrolls horizontally if the row
 * overflows — never wraps or drops chips (see .neighbor-chip-row in globals.css).
 */
export function NeighborChips({ neighbors }: { neighbors: Neighbor[] }) {
  return (
    <div className="neighbor-chip-row flex gap-2 overflow-x-auto pb-1">
      {neighbors.map(({ member }) => (
        <Link
          key={member.bioguideId}
          href={memberPath(member)}
          className="flex flex-none items-center gap-1.5 rounded-full border border-line-strong bg-surface-raised py-1 pl-1 pr-2.5 text-[0.72rem] text-ink-muted transition-colors hover:border-accent hover:text-ink"
        >
          <MemberPhoto
            bioguideId={member.bioguideId}
            hasPhoto={member.hasPhoto ?? false}
            size="small"
            className="size-6 flex-none rounded-full border border-line object-cover object-top"
          />
          <span
            className="size-[0.4rem] flex-none rounded-full"
            style={{ background: GROUP_VAR[member.group] }}
          />
          <span className="font-medium text-ink">{member.lastName}</span>
          <span className="font-mono text-[0.68rem] tabular-nums text-ink-faint">
            {seatLabel(member)}
          </span>
        </Link>
      ))}
    </div>
  );
}
