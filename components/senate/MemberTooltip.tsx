import type { SenateMember } from "@/lib/senate-data";
import { fmt3, partyLabel, stateName } from "./format";

/** Shared tooltip body — used by the compass and the delegation chart. */
export function MemberTooltip({ member }: { member: SenateMember }) {
  return (
    <>
      <b>{member.name}</b>
      <br />
      {stateName(member.state)} · {partyLabel(member)}
      <br />
      <span className="tt-mono">
        dim1 {fmt3(member.dim1)} &nbsp; dim2 {fmt3(member.dim2)}
      </span>
    </>
  );
}
