import type { CommitteeSummary } from "@/lib/committee-types";
import { fmt3 } from "@/components/senate/format";

/** Tooltip body for a committee dot on the compass. */
export function CommitteeDotTooltip({ committee }: { committee: CommitteeSummary }) {
  const { name, memberCount, repCount, demCount, otherCount, dim1, dim2 } = committee;
  return (
    <div className="tt-body">
      <div>
        <b>{name}</b>
        <br />
        {memberCount} members · {repCount} R / {demCount} D
        {otherCount > 0 ? ` / ${otherCount} other` : ""}
        <br />
        <span className="tt-mono">
          dim1 {fmt3(dim1)} &nbsp; dim2 {fmt3(dim2)}
        </span>
      </div>
    </div>
  );
}
