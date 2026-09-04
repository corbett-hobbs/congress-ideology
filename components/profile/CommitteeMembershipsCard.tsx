import Link from "next/link";
import type { MemberCommitteeMembership } from "@/lib/committee-types";
import type { MemberProfile } from "@/lib/congress-types";
import { committeePath } from "@/lib/committee-url";
import { AlignmentTrack } from "@/components/charts/AlignmentTrack";
import { GROUP_VAR, fmt2, ordinal } from "@/components/senate/format";
import { ProfilePanel } from "./ProfilePanel";

const ROLE_LABEL = {
  chair: "Chair",
  ranking_member: "Ranking Member",
  member: null,
} as const;

function RoleTag({ role }: { role: MemberCommitteeMembership["role"] }) {
  const label = ROLE_LABEL[role];
  if (!label) return null;
  return (
    <span
      className={`ml-2 inline-block rounded-full px-[0.5rem] py-[0.1rem] align-middle text-[0.66rem] font-semibold tracking-[0.01em] ${
        role === "chair"
          ? "bg-accent text-accent-ink"
          : "border border-line-strong bg-surface-raised text-ink-muted"
      }`}
    >
      {label}
    </span>
  );
}

/**
 * A member's committee assignments, at the bottom of their profile page —
 * absent entirely (not an empty state) for the small share of current
 * members with no current committee seat. Full committees only, matching the
 * committees feature's existing no-subcommittee-rows boundary.
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
        {memberships.length === 1 ? "committee assignment" : "committee assignments"}{" "}
        in the {ordinal(latestCongress)} Congress ranked by seniority. Each
        row also shows how {name}&rsquo;s own position compares to that
        committee&rsquo;s overall blend.
      </p>

      <div className="border-t border-line">
        {memberships.map((m) => (
          <div
            key={m.committeeId}
            className="grid grid-cols-[1fr_140px] items-center gap-4 border-b border-line py-[0.7rem] sm:grid-cols-[1fr_180px]"
          >
            <div className="min-w-0">
              <Link
                href={committeePath(m)}
                className="text-[0.9rem] text-ink hover:text-accent hover:underline"
              >
                {m.shortName}
              </Link>
              <RoleTag role={m.role} />
              <div className="mt-0.5 text-[0.72rem] text-ink-faint">
                {m.memberCount} members · seniority rank {m.rank}
              </div>
            </div>
            <div>
              {currentDim1 != null && m.blendDim1 != null ? (
                <>
                  <AlignmentTrack
                    primaryValue={currentDim1}
                    primaryColor={primaryColor}
                    referenceValue={m.blendDim1}
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
