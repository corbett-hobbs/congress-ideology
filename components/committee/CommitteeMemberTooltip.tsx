import type { CommitteeMemberRow } from "@/lib/committee-types";
import { MemberPhoto } from "@/components/MemberPhoto";
import { fmt3, seatLabel, stateName } from "@/components/senate/format";

const ROLE_LABEL = {
  chair: "Chair",
  ranking_member: "Ranking Member",
  member: null,
} as const;

/** Tooltip body for one committee member's dot in the beeswarm / roster row. */
export function CommitteeMemberTooltip({ member }: { member: CommitteeMemberRow }) {
  const role = ROLE_LABEL[member.role];
  return (
    <div className="tt-body">
      <MemberPhoto
        key={member.bioguideId}
        bioguideId={member.bioguideId}
        hasPhoto={member.hasPhoto}
        size="small"
        className="tt-photo"
      />
      <div>
        <b>{member.name}</b>
        {role ? ` · ${role}` : ""}
        <br />
        {member.chamber === "house"
          ? `${stateName(member.state)} · ${seatLabel(member)}`
          : stateName(member.state)}{" "}
        · {member.party}
        <br />
        <span className="tt-mono">dim1 {fmt3(member.dim1)}</span>
      </div>
    </div>
  );
}
