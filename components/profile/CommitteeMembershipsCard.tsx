import Link from "next/link";
import type { MemberCommitteeMembership } from "@/lib/committee-types";
import type { MemberProfile } from "@/lib/congress-types";
import { committeePath } from "@/lib/committee-url";
import { AlignmentTrack } from "@/components/charts/AlignmentTrack";
import { GROUP_VAR, fmt2, ordinal } from "@/components/senate/format";
import { RoleTag } from "@/components/committee/RoleTag";
import { ProfilePanel } from "./ProfilePanel";

/**
 * A member's committee assignments, at the bottom of their profile page —
 * absent entirely (not an empty state) for the small share of current
 * members with no current committee seat. Subcommittee seats nest under their
 * parent committee, collapsed by default.
 */
export function CommitteeMembershipsCard({
  profile,
  memberships,
}: {
  profile: MemberProfile;
  memberships: MemberCommitteeMembership[];
}) {
  if (memberships.length === 0) return null;

  const { name, group, currentDim1, latestCongress } = profile;
  const primaryColor = GROUP_VAR[group];

  return (
    <ProfilePanel label="Committee memberships">
      <p className="mb-2 text-[0.85rem] leading-[1.6] text-ink-muted">
        {name}&rsquo;s {memberships.length}{" "}
        {memberships.length === 1
          ? "committee assignment"
          : "committee assignments"}{" "}
        in the {ordinal(latestCongress)} Congress ranked by seniority. Each row
        also shows how {name}&rsquo;s own position compares to that
        committee&rsquo;s overall blend.
      </p>

      <div className="border-t border-line">
        {memberships.map((m) => (
          <div
            key={m.committeeId}
            className="relative -mx-1 grid grid-cols-[1fr_140px] items-center gap-x-4 rounded border-b border-line px-1 py-[0.7rem] hover:bg-surface-raised sm:grid-cols-[1fr_clamp(220px,34%,380px)]"
          >
            <div className="min-w-0 sm:col-start-1 sm:row-start-1">
              <Link
                href={committeePath(m)}
                className="group text-[0.9rem] text-ink hover:text-accent hover:underline after:absolute after:inset-0 after:content-['']"
              >
                {m.shortName}
              </Link>
              <RoleTag role={m.role} />
              <div className="mt-0.5 text-[0.72rem] text-ink-faint sm:ml-3 sm:mt-0 sm:inline">
                {m.memberCount} members · seniority rank {m.rank}
              </div>
            </div>
            <div className="col-start-2 row-span-2 row-start-1">
              {currentDim1 != null && m.blendDim1 != null ? (
                <>
                  <AlignmentTrack
                    points={[
                      { value: m.blendDim1, faint: true },
                      { value: currentDim1, color: primaryColor },
                    ]}
                  />
                  <div className="mt-[0.15rem] whitespace-nowrap text-right font-mono text-[0.68rem] text-ink-faint">
                    Δ {fmt2(Math.abs(currentDim1 - m.blendDim1))} from center
                  </div>
                </>
              ) : (
                <div className="text-right text-[0.72rem] text-ink-faint">
                  Not enough scored members to compare
                </div>
              )}
            </div>
            {m.subcommittees.length > 0 && (
              <details className="group/sub relative z-10 col-span-2 row-start-3 mt-1.5 sm:col-span-1 sm:col-start-1 sm:row-start-2 sm:mt-0.5">
                <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-[0.72rem] text-ink-muted hover:text-accent [&::-webkit-details-marker]:hidden">
                  <span className="inline-block transition-transform group-open/sub:rotate-90">
                    ▸
                  </span>
                  {m.subcommittees.length}{" "}
                  {m.subcommittees.length === 1
                    ? "subcommittee"
                    : "subcommittees"}
                </summary>
                <ul className="mt-1.5 ml-3 border-l border-line pl-3">
                  {m.subcommittees.map((sc) => (
                    <li key={sc.subcommitteeId} className="py-[0.3rem]">
                      <span className="text-[0.82rem] text-ink">{sc.name}</span>
                      <RoleTag role={sc.role} />
                      <div className="text-[0.68rem] text-ink-faint">
                        {sc.memberCount} members
                      </div>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-2.5 text-[0.72rem] text-ink-muted">
        <span className="flex items-center gap-[0.3rem]">
          <span
            className="size-2 flex-none rounded-full"
            style={{ background: primaryColor }}
          />
          {name}&rsquo;s own position
        </span>
        <span className="flex items-center gap-[0.3rem]">
          <span className="size-2 flex-none rounded-full bg-ink-faint opacity-55" />
          Committee&rsquo;s blended position
        </span>
      </div>
    </ProfilePanel>
  );
}
