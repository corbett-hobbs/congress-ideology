import Link from "next/link";
import {
  partySplit,
  type CommitteeProfile,
  type RosterLead,
} from "@/lib/committee-types";
import { memberPath } from "@/lib/member-url";
import { partyAbbr } from "@/components/senate/format";
import { GROUP_VAR, ordinal } from "@/components/senate/format";

const EYEBROW = {
  house: "HOUSE COMMITTEE",
  senate: "SENATE COMMITTEE",
  joint: "JOINT COMMITTEE",
} as const;

const CONTROL_LABEL = {
  dem: "Democratic",
  rep: "Republican",
  other: "Split / other",
} as const;

function LeadLink({ lead, role }: { lead: RosterLead; role: string }) {
  return (
    <>
      {role}:{" "}
      <Link
        href={memberPath({
          bioguideId: lead.bioguideId,
          chamber: lead.chamber,
          name: lead.name,
        })}
        className="font-medium text-ink hover:underline"
      >
        {lead.name}
      </Link>{" "}
      ({partyAbbr(lead.party)})
    </>
  );
}

/**
 * A committee's identity block — same structural pattern as a member's own
 * `ProfileHeader` (eyebrow, serif name, meta line, sub-line), but with no
 * photo/seal slot. A member photo is a real, systematically available asset
 * people use to recognize their representative; a committee monogram (tried
 * in an earlier pass) is pure decoration with no informational content
 * behind it, so cutting it isn't the same move as cutting the member photo
 * would be — a deliberate divergence, not an oversight. See
 * ARCHITECTURE_MAP.md's shared chart/component table.
 */
export function CommitteeHeader({ committee }: { committee: CommitteeProfile }) {
  const { name, chamber, controlGroup, chair, rankingMember, memberCount, latestCongress } =
    committee;

  return (
    <header className="max-w-[1180px]">
      <p className="mb-1.5 font-mono text-[0.72rem] uppercase tracking-[0.12em] text-ink-faint">
        {EYEBROW[chamber]}
      </p>
      <h1 className="mb-1.5 font-serif text-[clamp(2rem,4vw,2.8rem)] font-semibold leading-[1.05] tracking-[-0.01em]">
        {name}
      </h1>
      <p className="text-[1rem] text-ink-muted">
        <span
          className="mr-1.5 inline-block size-[0.55rem] rounded-full align-middle"
          style={{ background: GROUP_VAR[controlGroup] }}
        />
        {chamber === "joint"
          ? "No single majority"
          : `${CONTROL_LABEL[controlGroup]} control`}{" "}
        · {partySplit(committee)}
      </p>
      {chair && (
        <p className="mt-1.5 text-[0.9rem] text-ink-muted">
          <LeadLink lead={chair} role="Chair" />
        </p>
      )}
      {rankingMember && (
        <p className="mt-1.5 text-[0.9rem] text-ink-muted">
          <LeadLink lead={rankingMember} role="Ranking Member" />
        </p>
      )}
      {!chair && !rankingMember && (
        <p className="mt-1.5 text-[0.9rem] text-ink-muted">
          Leadership not recorded
        </p>
      )}
      <p className="mt-1.5 text-[0.9rem] text-ink-muted">
        {memberCount} members in the {ordinal(latestCongress)} Congress
      </p>
    </header>
  );
}
