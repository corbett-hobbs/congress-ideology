import Link from "next/link";
import type {
  ChamberMember,
  MemberProfile,
  PartyMeanPoint,
} from "@/lib/congress-types";
import { chamberLabel, memberNoun } from "@/lib/chamber";
import { ProfileCompass } from "@/components/senate/ProfileCompass";
import { CompassPanel } from "@/components/senate/CompassPanel";
import { Dim2Footnote } from "@/components/senate/Dim2Footnote";
import { DelegationChart } from "@/components/senate/DelegationChart";
import { BeeswarmChart } from "@/components/senate/BeeswarmChart";
import { SenatorTrajectoryChart } from "@/components/senate/SenatorTrajectoryChart";
import { fmt2, ordinal } from "@/components/senate/format";
import { ProfilePanel } from "./ProfilePanel";

interface MemberIdeologySectionProps {
  profile: MemberProfile;
  /** Plottable members of the latest Congress in this chamber (compass). */
  compassMembers: ChamberMember[];
  /** Every member of the latest Congress in this chamber (delegation). */
  delegationMembers: ChamberMember[];
  trend: PartyMeanPoint[];
}

/**
 * The ideology vertical's slice of a member profile: where they sit in the
 * chamber (compass), how their position has moved (trajectory), and how their
 * state's delegation is spread. Self-contained — it does its own data shaping
 * from the props and owns its layout — so other verticals' sections can be
 * added as siblings in MemberProfileView without touching this one.
 */
export function MemberIdeologySection({
  profile,
  compassMembers,
  delegationMembers,
  trend,
}: MemberIdeologySectionProps) {
  const {
    bioguideId,
    chamber,
    name,
    state,
    stateName,
    group,
    latestCongress,
    careerDim1,
    trajectory,
    chamberCongressCount,
  } = profile;

  const isHouse = chamber === "house";
  const nounPlural = memberNoun(chamber, { plural: true });
  const Chamber = chamberLabel(chamber);

  const scored = compassMembers; // already sorted by dim1 ascending
  const rankIndex = scored.findIndex((m) => m.bioguideId === bioguideId);
  const rank = rankIndex >= 0 ? rankIndex + 1 : null;
  const inChamber = rankIndex >= 0;

  // State delegation.
  const stateScored = delegationMembers.filter(
    (m) => m.state === state && m.dim1 != null,
  );
  const dims = stateScored.map((m) => m.dim1 as number).sort((a, b) => a - b);
  const spread = dims.length >= 2 ? dims[dims.length - 1] - dims[0] : null;
  const demCount = stateScored.filter((m) => m.group === "dem").length;
  const repCount = stateScored.filter((m) => m.group === "rep").length;
  const otherCount = stateScored.length - demCount - repCount;

  // Senate: the actual two-seat pairing, for the "seatmate" copy.
  const delegationPair = delegationMembers
    .filter((m) => m.state === state && m.dim1 != null)
    .sort((a, b) => (b.nVotes ?? 0) - (a.nVotes ?? 0))
    .slice(0, 2);
  const senateGap =
    delegationPair.length === 2
      ? Math.abs(
          (delegationPair[0].dim1 as number) -
            (delegationPair[1].dim1 as number),
        )
      : null;
  const inOwnDelegation = delegationPair.some(
    (m) => m.bioguideId === bioguideId,
  );

  return (
    <section
      aria-label="Ideology"
      className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2"
    >
      <ProfilePanel label={`In the ${ordinal(latestCongress)} ${Chamber}`}>
        <p className="mb-2 max-w-[42rem] text-[0.78rem] text-ink-faint">
          {inChamber && rank
            ? `${name} sits ${ordinal(rank)} from the left of ${scored.length} scored ${nounPlural}. Ringed below; the rest of the chamber is faded.`
            : `No plottable ${ordinal(latestCongress)}-Congress position for ${name} (too few votes). The chamber is shown for context.`}
        </p>
        <CompassPanel congress={latestCongress}>
          <ProfileCompass
            members={compassMembers}
            bioguideId={inChamber ? bioguideId : ""}
          />
        </CompassPanel>
        <Dim2Footnote congress={latestCongress} />
      </ProfilePanel>

      <div className="flex flex-col gap-5">
        <ProfilePanel label="Ideological trajectory · dimension 1 by Congress">
          <p className="mb-2 max-w-[42rem] text-[0.78rem] text-ink-faint">
            {chamberCongressCount > 1
              ? `${name}'s per-Congress position (nokken–poole), against the party mean.`
              : `${name} has served one Congress so far — a single point against the party mean.`}
          </p>
          <SenatorTrajectoryChart
            trajectory={trajectory}
            partyMean={trend}
            group={group}
            careerDim1={careerDim1}
            memberName={name}
          />
        </ProfilePanel>

        {isHouse ? (
          <ProfilePanel label={`${stateName} delegation · dimension 1`}>
            <p className="mb-2 max-w-[46rem] text-[0.85rem] leading-[1.6] text-ink-muted">
              {stateName}&rsquo;s delegation in the {ordinal(latestCongress)}{" "}
              House:{" "}
              <span className="font-medium text-ink">
                {demCount} D / {repCount} R
                {otherCount > 0 ? ` / ${otherCount} other` : ""}
              </span>
              {spread != null
                ? `, dimension-1 spread ${fmt2(spread)} (from ${fmt2(dims[0])} to ${fmt2(dims[dims.length - 1])})`
                : ""}
              .{inChamber ? ` ${name} is ringed.` : ""}{" "}
              <Link
                href={`/?chamber=house&state=${state}`}
                className="text-accent hover:underline"
              >
                Open in the explorer →
              </Link>
            </p>
            <BeeswarmChart members={stateScored} highlightId={bioguideId} />
          </ProfilePanel>
        ) : (
          <ProfilePanel
            label={`${stateName} delegation · both senators on dimension 1`}
          >
            <p className="mb-2 text-[0.78rem] text-ink-faint">
              {inOwnDelegation
                ? `${name} and their seatmate`
                : `${stateName}'s two seated senators (${name} served too little of the ${ordinal(latestCongress)} Congress to appear)`}
              {senateGap != null ? `, gap ${fmt2(senateGap)}` : ""}.{" "}
              <Link href="/#delegation" className="text-accent hover:underline">
                All 50 delegations →
              </Link>
            </p>
            <DelegationChart
              members={delegationMembers}
              filterState={state}
              highlightId={bioguideId}
            />
          </ProfilePanel>
        )}
      </div>
    </section>
  );
}
