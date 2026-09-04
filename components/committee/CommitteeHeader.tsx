import Link from "next/link";
import type { CommitteeProfile, RosterLead } from "@/lib/committee-types";
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

const SKIP = new Set(["and", "on", "the", "of", "for", "to"]);

/** Two-letter seal, since committees have no photo — this is the normal state
 *  for the entity type, not a missing-image fallback. */
function monogram(shortName: string): string {
  const words = shortName
    .split(/[\s,]+/)
    .filter((w) => w && !SKIP.has(w.toLowerCase()));
  const letters = words
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
  return (letters || shortName.slice(0, 2)).toUpperCase();
}

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

export function CommitteeHeader({ committee }: { committee: CommitteeProfile }) {
  const {
    name,
    shortName,
    chamber,
    controlGroup,
    repCount,
    demCount,
    otherCount,
    memberCount,
    chair,
    rankingMember,
    latestCongress,
  } = committee;

  return (
    <header className="flex max-w-[52rem] flex-row items-center gap-4 sm:items-start sm:gap-6">
      <div className="flex aspect-square w-[84px] flex-none items-center justify-center rounded-md border border-line-strong bg-surface-raised font-serif text-[1.6rem] font-semibold text-ink-muted sm:w-28 sm:text-[2rem]">
        {monogram(shortName)}
      </div>
      <div className="min-w-0">
        <p className="mb-1.5 font-mono text-[0.72rem] uppercase tracking-[0.12em] text-ink-faint">
          {EYEBROW[chamber]}
        </p>
        <h1 className="mb-1.5 font-serif text-[clamp(1.8rem,3.6vw,2.6rem)] font-semibold leading-[1.05] tracking-[-0.01em]">
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
          · {repCount} R / {demCount} D
          {otherCount > 0 ? ` / ${otherCount} other` : ""}
        </p>
        <p className="mt-1.5 text-[0.9rem] text-ink-muted">
          {chair && <LeadLink lead={chair} role="Chair" />}
          {chair && rankingMember ? "  ·  " : ""}
          {rankingMember && (
            <LeadLink lead={rankingMember} role="Ranking Member" />
          )}
          {!chair && !rankingMember && "Leadership not recorded"}
        </p>
        <p className="mt-1.5 text-[0.9rem] text-ink-muted">
          {memberCount} members in the {ordinal(latestCongress)} Congress
        </p>
      </div>
    </header>
  );
}
