import type { MemberProfile } from "@/lib/congress-types";
import type { WikipediaBio } from "@/lib/wikipedia-types";
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
export function ProfileHeader({
  profile,
  bio = null,
}: {
  profile: MemberProfile;
  /** Trimmed Wikipedia lead; `null` renders the header exactly as before. */
  bio?: WikipediaBio | null;
}) {
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
    <header
      className={
        bio
          ? // Below lg the bio stacks under the photo + details row; at lg the
            // three sit in one row and the bio column is stretched to the
            // row's height (set by the photo / details, never by the bio).
            "flex flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-0"
          : "flex max-w-[52rem] flex-row items-center gap-4 sm:items-start sm:gap-6"
      }
    >
      <div
        className={
          bio
            ? "flex flex-row items-center gap-4 sm:items-start sm:gap-6 lg:flex-none"
            : "contents"
        }
      >
        <MemberPhoto
          bioguideId={bioguideId}
          hasPhoto={hasPhoto}
          size="large"
          className={`aspect-[225/275] flex-none rounded-md border border-line-strong bg-surface-raised object-cover object-top sm:w-28 ${bio ? "w-24" : "w-[84px]"}`}
        />
        <div className={bio ? "min-w-0 lg:w-[380px] lg:flex-none" : "min-w-0"}>
          <p className="mb-1.5 font-mono text-[0.72rem] uppercase tracking-[0.12em] text-ink-faint">
            {Noun}
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
            {isHouse
              ? ` · District ${profile.district ?? "at-large"}`
              : ""} · {partyLabel(profile)}
          </p>
          <p className="mt-1.5 text-[0.9rem] text-ink-muted">
            In the {Chamber} since {congressStartYear(firstCongress)} ·{" "}
            {chamberCongressCount}{" "}
            {chamberCongressCount === 1 ? "Congress" : "Congresses"} served
          </p>
          {partialCurrentTerm && (
            <p className="mt-1.5 max-w-[42rem] text-[0.82rem] text-ink-faint">
              Served only part of the {ordinal(latestCongress)} Congress, so
              current-Congress figures rest on very few votes, or none.
            </p>
          )}
        </div>
      </div>
      {bio && (
        <section
          aria-label="About"
          className="border-t border-line pt-4 lg:relative lg:min-w-0 lg:flex-1 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0"
        >
          <div className="flex flex-col gap-1.5 lg:absolute lg:inset-0 lg:overflow-hidden">
            <p className="flex-none font-mono text-[0.72rem] uppercase tracking-[0.12em] text-ink-faint">
              About
            </p>
            <p className="font-serif text-[1.0625rem] leading-[1.35] text-ink lg:line-clamp-4 lg:min-h-0 lg:text-base">
              {bio.extract}
            </p>
            <p className="flex-none text-xs leading-[1.4] text-ink-muted lg:whitespace-nowrap">
              From{" "}
              <a
                href={bio.url}
                rel="noopener"
                className="text-accent underline underline-offset-2"
              >
                Wikipedia
              </a>{" "}
              (text may be abridged), licensed under{" "}
              <a
                href="https://creativecommons.org/licenses/by-sa/4.0/"
                rel="noopener"
                className="text-accent underline underline-offset-2"
              >
                CC BY-SA 4.0
              </a>
              .
            </p>
          </div>
        </section>
      )}
    </header>
  );
}
