import { chamberLabel, memberTitleAbbr } from "@/lib/chamber";
import { annualizedRate, hasDataGap } from "@/lib/wealth-derive";
import { formatCompactUSD, formatSignedCompactUSD } from "@/lib/format-money";
import type { WealthMember } from "@/lib/wealth-data";
import { yearsOfData } from "@/lib/wealth-scatter";

/** The scatter's hover/search card — one cohort member's rate summary, plus
 *  amber notes for a data gap and/or a pinned (off-scale) rate. */
export function WealthMemberTooltip({
  member,
  pinned,
}: {
  member: WealthMember;
  pinned: boolean;
}) {
  const first = member.points[0];
  const last = member.points[member.points.length - 1];
  const rate = annualizedRate(member);
  const gapped = hasDataGap(member);
  const district = member.chamber === "house" && member.district ? `-${member.district}` : "";

  return (
    <div>
      <b>
        {member.name} ({member.caucus === "Democrat" ? "D" : "R"})
      </b>
      <br />
      {chamberLabel(member.chamber)} · {member.state}
      {district}
      <br />
      <span className="tt-mono">
        {yearsOfData(member)} yrs of data ({first.year}–{last.year})
      </span>
      <br />
      <span className="tt-mono">
        {formatCompactUSD(first.midpoint)} → {formatCompactUSD(last.midpoint)} total
      </span>
      <br />
      <span className="tt-mono">
        {formatSignedCompactUSD(rate)}/yr ({formatSignedCompactUSD(last.midpoint - first.midpoint)}{" "}
        over {last.year - first.year} yrs)
      </span>
      {gapped && (
        <p className="mt-1 text-note">
          First year with data {first.year}; entered {member.entryYear}
        </p>
      )}
      {pinned && (
        <p className="mt-1 text-note">Off scale: pinned to the ±$15M/yr edge</p>
      )}
    </div>
  );
}

/** The search-result row's compact line for a member with only 1 usable
 *  year — never plotted, so no rate to show. */
export function memberTitleLine(member: WealthMember): string {
  const district = member.chamber === "house" && member.district ? `-${member.district}` : "";
  return `${memberTitleAbbr(member.chamber)} ${member.state}${district}`;
}
