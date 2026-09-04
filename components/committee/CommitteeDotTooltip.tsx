import type { CommitteeSummary } from "@/lib/committee-types";
import { fmt3 } from "@/components/senate/format";

const CHAMBER_LABEL = {
  house: "House committee",
  senate: "Senate committee",
  joint: "Joint committee",
} as const;

/** Tooltip body for a committee dot on the compass. */
export function CommitteeDotTooltip({ committee }: { committee: CommitteeSummary }) {
  const { name, chamber, memberCount, repCount, demCount, otherCount, dim1, dim2 } =
    committee;
  return (
    <div className="tt-body">
      <div>
        <b>{name}</b>
        <br />
        {CHAMBER_LABEL[chamber]} · {memberCount} members
        <br />
        {repCount} R / {demCount} D{otherCount > 0 ? ` / ${otherCount} other` : ""}
        <br />
        <span className="tt-mono">
          dim1 {fmt3(dim1)} &nbsp; dim2 {fmt3(dim2)}
        </span>
      </div>
    </div>
  );
}
