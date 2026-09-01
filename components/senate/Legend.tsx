import type { PartyGroup, SenateMember } from "@/lib/senate-data";
import { GROUP_LABEL, GROUP_VAR } from "./format";

const ORDER: PartyGroup[] = ["dem", "rep", "other"];

export function Legend({ members }: { members: SenateMember[] }) {
  const counts = members.reduce<Record<PartyGroup, number>>(
    (acc, m) => {
      acc[m.group] += 1;
      return acc;
    },
    { dem: 0, rep: 0, other: 0 },
  );

  return (
    <div className="flex flex-wrap gap-x-[1.1rem] gap-y-1 border-t border-line pt-3">
      {ORDER.map((g) => (
        <span
          key={g}
          className="flex items-center gap-[0.4rem] text-[0.8rem] text-ink-muted"
        >
          <span
            className="size-[0.62rem] flex-none rounded-full"
            style={{ background: GROUP_VAR[g] }}
          />
          {GROUP_LABEL[g]} —{" "}
          <span className="font-mono font-medium text-ink">{counts[g]}</span>
        </span>
      ))}
    </div>
  );
}
