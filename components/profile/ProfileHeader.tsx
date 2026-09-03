import type { MemberProfile } from "@/lib/congress-types";
import { chamberLabel, memberNoun } from "@/lib/chamber";
import { MemberPhoto } from "@/components/MemberPhoto";
import {
  congressStartYear,
  GROUP_VAR,
  ordinal,
  partyLabel,
} from "@/components/senate/format";

/**
 * The member's identity block at the top of a profile page: name, seat, party,
 * and length of service. Vertical-neutral — it describes the person, not any
 * one dataset — so it sits above the stacked per-vertical sections. Kept
 * compact: photo, eyebrow, name, seat line, service line — one row each.
 */
export function ProfileHeader({ profile }: { profile: MemberProfile }) {
  const {
    bioguideId,
    chamber,
    name,
    stateName,
    group,
    latestCongress,
    firstCongress,
    chamberCongressCount,
    partialCurrentTerm,
    hasPhoto,
  } = profile;

  const isHouse = chamber === "house";
  const Noun = memberNoun(chamber, { cap: true });
  const Chamber = chamberLabel(chamber);

  return (
    <header className="flex max-w-[52rem] flex-col gap-3 sm:flex-row sm:items-start sm:gap-6">
      <MemberPhoto
        bioguideId={bioguideId}
        hasPhoto={hasPhoto}
        size="large"
        className="aspect-[225/275] w-20 flex-none rounded-md border border-line-strong bg-surface-raised object-cover object-top sm:w-28"
      />
      <div className="min-w-0">
        <p className="mb-1.5 font-mono text-[0.72rem] uppercase tracking-[0.12em] text-ink-faint">
          {Noun} · {ordinal(latestCongress)} Congress
        </p>
        <h1 className="mb-1.5 font-serif text-[clamp(2rem,4vw,2.8rem)] font-semibold leading-[1.05] tracking-[-0.01em]">
          {name}
        </h1>
        <p className="text-[1rem] text-ink-muted">
          <span
            className="mr-1.5 inline-block size-[0.55rem] rounded-full align-middle"
            style={{ background: GROUP_VAR[group] }}
          />
          {stateName}
          {isHouse ? ` · District ${profile.district ?? "at-large"}` : ""} ·{" "}
          {partyLabel(profile)}
        </p>
        <p className="mt-1.5 text-[0.9rem] text-ink-muted">
          In the {Chamber} since the {ordinal(firstCongress)} Congress (
          {congressStartYear(firstCongress)}) · {chamberCongressCount}{" "}
          {chamberCongressCount === 1 ? "Congress" : "Congresses"} served
        </p>
        {partialCurrentTerm && (
          <p className="mt-1.5 max-w-[42rem] text-[0.82rem] text-ink-faint">
            Served only part of the {ordinal(latestCongress)} Congress, so
            current-Congress figures rest on very few votes, or none.
          </p>
        )}
      </div>
    </header>
  );
}
