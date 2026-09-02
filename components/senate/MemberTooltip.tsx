import type { ChamberMember } from "@/lib/congress-types";
import { MemberPhoto } from "@/components/MemberPhoto";
import { fmt3, partyLabel, seatLabel, stateName } from "./format";

/** Shared tooltip body — used by the compass, beeswarm and delegation chart. */
export function MemberTooltip({ member }: { member: ChamberMember }) {
  return (
    <div className="tt-body">
      {member.hasPhoto !== undefined && (
        <MemberPhoto
          key={member.bioguideId}
          bioguideId={member.bioguideId}
          hasPhoto={member.hasPhoto}
          size="small"
          className="tt-photo"
        />
      )}
      <div>
        <b>{member.name}</b>
        <br />
        {member.chamber === "house"
          ? `${stateName(member.state)} · ${seatLabel(member)}`
          : stateName(member.state)}{" "}
        · {partyLabel(member)}
        <br />
        <span className="tt-mono">
          dim1 {fmt3(member.dim1)} &nbsp; dim2 {fmt3(member.dim2)}
        </span>
      </div>
    </div>
  );
}
