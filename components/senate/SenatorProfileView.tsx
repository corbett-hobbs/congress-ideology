import Link from "next/link";
import type {
  PartyMeanPoint,
  ChamberMember,
  MemberProfile,
} from "@/lib/congress-types";
import { chamberLabel, memberNoun } from "@/lib/chamber";
import { ProfileCompass } from "./ProfileCompass";
import { DelegationChart } from "./DelegationChart";
import { SenatorTrajectoryChart } from "./SenatorTrajectoryChart";
import { SiteFooter } from "./SiteFooter";
import {
  congressStartYear,
  fmt2,
  fmt3,
  GROUP_VAR,
  ordinal,
  partyLabel,
} from "./format";

interface SenatorProfileViewProps {
  profile: MemberProfile;
  /** Plottable members of the latest Congress in this chamber (compass). */
  compassMembers: ChamberMember[];
  /** Every member of the latest Congress in this chamber (delegation). */
  delegationMembers: ChamberMember[];
  trend: PartyMeanPoint[];
}

function Panel({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[10px] border border-line bg-surface p-[1.1rem_1.25rem_1.25rem] ${className ?? ""}`}
    >
      <p className="mb-3 font-mono text-[0.68rem] uppercase tracking-[0.08em] text-ink-faint">
        {label}
      </p>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-[0.85rem]">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="m-0 text-right font-mono font-medium tabular-nums">
        {value}
      </dd>
    </div>
  );
}

export function SenatorProfileView({
  profile,
  compassMembers,
  delegationMembers,
  trend,
}: SenatorProfileViewProps) {
  const {
    bioguideId,
    chamber,
    name,
    fullName,
    state,
    stateName,
    group,
    latestCongress,
    careerDim1,
    careerDim2,
    currentDim1,
    currentDim2,
    trajectory,
    firstCongress,
    chamberCongressCount,
    partialCurrentTerm,
  } = profile;

  const isHouse = chamber === "house";
  const Noun = memberNoun(chamber, { cap: true });
  const nounPlural = memberNoun(chamber, { plural: true });
  const Chamber = chamberLabel(chamber);
  const explorerHref = isHouse ? "/?chamber=house" : "/";

  const scored = compassMembers; // already sorted by dim1 ascending
  const rankIndex = scored.findIndex((m) => m.bioguideId === bioguideId);
  const rank = rankIndex >= 0 ? rankIndex + 1 : null;
  const inChamber = rankIndex >= 0;

  // State delegation.
  const stateScored = delegationMembers.filter(
    (m) => m.state === state && m.dim1 != null,
  );
  const dims = stateScored
    .map((m) => m.dim1 as number)
    .sort((a, b) => a - b);
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
    <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-7 px-6 pb-16 pt-11">
      <div>
        <Link
          href={explorerHref}
          className="font-mono text-[0.72rem] uppercase tracking-[0.1em] text-accent hover:underline"
        >
          ← Congressional Ideology
        </Link>
      </div>

      <header className="max-w-[52rem]">
        <p className="mb-2 font-mono text-[0.72rem] uppercase tracking-[0.12em] text-ink-faint">
          {Noun} · {ordinal(latestCongress)} Congress
        </p>
        <h1 className="mb-[0.5rem] font-serif text-[clamp(2rem,4vw,2.8rem)] font-semibold leading-[1.05] tracking-[-0.01em]">
          {name}
        </h1>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[1rem] text-ink-muted">
          <span
            className="size-[0.6rem] flex-none rounded-full"
            style={{ background: GROUP_VAR[group] }}
          />
          {stateName}
          {isHouse
            ? ` · District ${profile.district ?? "at-large"}`
            : ""}{" "}
          · {partyLabel(profile)}
          {fullName !== name && (
            <span className="text-ink-faint">· {fullName}</span>
          )}
        </p>
        {partialCurrentTerm && (
          <p className="mt-2 max-w-[42rem] text-[0.82rem] text-ink-faint">
            Served only part of the {ordinal(latestCongress)} Congress — the
            per-Congress score below rests on very few votes, or none.
          </p>
        )}
      </header>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="flex flex-col gap-5">
          <Panel label="Ideological trajectory · dimension 1 by Congress">
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
            />
          </Panel>

          <Panel label={`In the ${ordinal(latestCongress)} ${Chamber}`}>
            <p className="mb-2 max-w-[42rem] text-[0.78rem] text-ink-faint">
              {inChamber && rank
                ? `${name} sits ${ordinal(rank)} from the left of ${scored.length} scored ${nounPlural}. Ringed below; the rest of the chamber is faded.`
                : `No plottable ${ordinal(latestCongress)}-Congress position for ${name} (too few votes). The chamber is shown for context.`}
            </p>
            <ProfileCompass
              members={compassMembers}
              bioguideId={inChamber ? bioguideId : ""}
            />
            <div className="mt-1 flex justify-between px-[0.1rem] font-mono text-[0.6rem] text-ink-faint sm:text-[0.66rem]">
              <span>← more liberal</span>
              <span className="hidden sm:inline">dimension 1</span>
              <span>more conservative →</span>
            </div>
          </Panel>
        </div>

        <aside className="flex flex-col gap-5">
          <Panel label="Scores">
            <dl className="flex flex-col gap-[0.55rem]">
              <Stat label="Career dim 1" value={fmt3(careerDim1)} />
              <Stat label="Career dim 2" value={fmt3(careerDim2)} />
              <Stat
                label={`${ordinal(latestCongress)} dim 1`}
                value={fmt3(currentDim1)}
              />
              <Stat
                label={`${ordinal(latestCongress)} dim 2`}
                value={fmt3(currentDim2)}
              />
            </dl>
          </Panel>

          <Panel label="Service">
            <dl className="flex flex-col gap-[0.55rem]">
              <Stat
                label={`First ${Chamber} Congress`}
                value={`${ordinal(firstCongress)} (${congressStartYear(firstCongress)})`}
              />
              <Stat label="Congresses served" value={chamberCongressCount} />
              <Stat
                label="Seat"
                value={
                  isHouse
                    ? `${state}-${profile.district ?? "AL"}`
                    : state
                }
              />
            </dl>
          </Panel>
        </aside>
      </div>

      {isHouse ? (
        <Panel label={`${stateName} delegation`}>
          <p className="max-w-[46rem] text-[0.85rem] leading-[1.6] text-ink-muted">
            {stateName}&rsquo;s delegation in the {ordinal(latestCongress)} House:{" "}
            <span className="font-medium text-ink">
              {demCount} D / {repCount} R
              {otherCount > 0 ? ` / ${otherCount} other` : ""}
            </span>
            {spread != null
              ? `, dimension-1 spread ${fmt2(spread)} (from ${fmt2(dims[0])} to ${fmt2(dims[dims.length - 1])})`
              : ""}
            .{" "}
            <Link
              href={`/?chamber=house&state=${state}`}
              className="text-accent hover:underline"
            >
              See the {stateName} beeswarm →
            </Link>
          </p>
        </Panel>
      ) : (
        <Panel label={`${stateName} delegation · both senators on dimension 1`}>
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
        </Panel>
      )}

      <SiteFooter />
    </main>
  );
}
