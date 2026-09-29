import { chamberLabel, memberTitleAbbr } from "@/lib/chamber";
import { annualizedRate, hasDataGap } from "@/lib/wealth-derive";
import {
  formatCompactUSD,
  formatOpenEndedUSD,
  formatSignedCompactUSD,
} from "@/lib/format-money";
import type { WealthMember, WealthYearPoint } from "@/lib/wealth-data";
import {
  NET_WORTH_CAP,
  isClipped,
  netWorthChange,
  yearsOfData,
} from "@/lib/wealth-scatter";

/** A point's net worth, carrying the trailing `+` of an open-ended band. */
export function formatPointUSD(point: WealthYearPoint): string {
  return point.range.openEnded
    ? formatOpenEndedUSD(point.midpoint)
    : formatCompactUSD(point.midpoint);
}

/** The scatter's hover/search card — one cohort member's before/after
 *  summary, plus amber notes for a data gap and/or a clipped point. Values
 *  are always the true (unclamped) dollars. */
export function WealthMemberTooltip({ member }: { member: WealthMember }) {
  const first = member.points[0];
  const last = member.points[member.points.length - 1];
  const years = yearsOfData(member);
  const rate = annualizedRate(member);
  const change = netWorthChange(member);
  const gapped = hasDataGap(member);
  const clipped = isClipped(member);

  return (
    <div>
      <b>
        {member.name} ({member.caucus === "Democrat" ? "D" : "R"}) ·{" "}
        {chamberLabel(member.chamber)} · {locationLabel(member)}
      </b>
      <br />
      <span className="tt-mono">
        {years} yrs of data ({first.year}–{last.year})
      </span>
      <br />
      <span className="tt-mono">
        {formatPointUSD(first)} → {formatPointUSD(last)}
      </span>
      <br />
      <span className="tt-mono">
        {formatSignedCompactUSD(change)} total ({formatSignedCompactUSD(rate)}/yr over{" "}
        {years} yrs)
      </span>
      {gapped && (
        <p className="mt-1 text-note">
          First year with data {first.year}; entered {member.entryYear}
        </p>
      )}
      {clipped && (
        <p className="mt-1 text-note">
          One or both values are beyond ±{formatCompactUSD(NET_WORTH_CAP)} and shown at the
          chart edge.
        </p>
      )}
    </div>
  );
}

function locationLabel(member: WealthMember): string {
  const district = member.chamber === "house" && member.district ? `-${member.district}` : "";
  return `${member.state}${district}`;
}

/** The search-result row's compact line: "Rep. CA-12" / "Sen. TX". */
export function memberTitleLine(member: WealthMember): string {
  return `${memberTitleAbbr(member.chamber)} ${locationLabel(member)}`;
}
