import Link from "next/link";
import type { CommitteeProfile } from "@/lib/committee-types";
import { hasProfilePage, memberPath } from "@/lib/member-url";
import { ProfilePanel } from "@/components/profile/ProfilePanel";
import { GROUP_VAR, fmt2, ordinal, partyAbbr } from "@/components/senate/format";
import { CommitteeSwarm } from "./CommitteeSwarm";

const ROLE_TAG = {
  chair: "Chair",
  ranking_member: "Ranking Member",
  member: null,
} as const;

/**
 * This committee's members along dimension 1 — a full-width single-row swarm
 * plus a scrollable roster list. The only place individual roster positions
 * appear (the compass card shows committees, not members), so it isn't
 * redundant. No trajectory chart: committee membership isn't tracked
 * historically, and that reasoning is folded into the paragraph here rather
 * than left as an empty card.
 */
export function CommitteeRosterCard({
  committee,
}: {
  committee: CommitteeProfile;
}) {
  const { roster, memberCount, latestCongress } = committee;

  return (
    <ProfilePanel label="Member roster · dimension 1">
      <p className="mb-3 max-w-[46rem] text-[0.85rem] leading-[1.6] text-ink-muted">
        This committee&rsquo;s {memberCount} members on the same left–right axis.
        Committee membership isn&rsquo;t tracked historically — only the{" "}
        {ordinal(latestCongress)} Congress — so there&rsquo;s no trajectory view
        here the way there is for an individual member.
      </p>

      <CommitteeSwarm committees={[committee]} standalone />

      <div className="mt-3 max-h-[360px] overflow-y-auto border-t border-line">
        {roster.map((m) => {
          const tag = ROLE_TAG[m.role];
          const row = (
            <>
              <span
                className="size-[0.5rem] flex-none rounded-full"
                style={{ background: GROUP_VAR[m.group] }}
              />
              <span className="min-w-0 flex-1 truncate">
                {m.name}
                {tag && (
                  <span className="ml-1.5 text-[0.72rem] text-ink-faint">
                    — {tag}
                  </span>
                )}
              </span>
              <span className="flex-none font-mono text-[0.72rem] text-ink-faint">
                {partyAbbr(m.party)}
              </span>
              <span className="w-12 flex-none text-right font-mono text-[0.72rem] text-ink-muted">
                {fmt2(m.dim1)}
              </span>
            </>
          );
          const cls =
            "flex items-center gap-2.5 px-1 py-[0.32rem] text-[0.82rem]";
          return hasProfilePage(m) ? (
            <Link
              key={m.bioguideId}
              href={memberPath(m)}
              className={`${cls} -mx-1 rounded hover:bg-surface-raised`}
            >
              {row}
            </Link>
          ) : (
            <div key={m.bioguideId} className={cls}>
              {row}
            </div>
          );
        })}
      </div>
    </ProfilePanel>
  );
}
