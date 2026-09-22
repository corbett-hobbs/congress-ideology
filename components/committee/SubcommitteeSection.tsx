"use client";

import { useState } from "react";
import Link from "next/link";
import type { CommitteeProfile, SubcommitteeProfile } from "@/lib/committee-types";
import { hasProfilePage, memberPath } from "@/lib/member-url";
import { AlignmentTrack, type AlignmentTrackPoint } from "@/components/charts/AlignmentTrack";
import { GROUP_VAR, fmt3, partyAbbr } from "@/components/senate/format";
import { ProfilePanel } from "@/components/profile/ProfilePanel";

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/** A subcommittee's chair/ranking member `dim1`, looked up in its own roster
 *  (RosterLead carries identity, not the score). */
function leadDim1(sub: SubcommitteeProfile, bioguideId: string | undefined): number | null {
  if (!bioguideId) return null;
  return sub.roster.find((r) => r.bioguideId === bioguideId)?.dim1 ?? null;
}

function SubcommitteeRow({
  sub,
  committeeDim1,
  open,
  onToggle,
}: {
  sub: SubcommitteeProfile;
  committeeDim1: number | null;
  open: boolean;
  onToggle: () => void;
}) {
  const panelId = `subcommittee-${sub.subcommitteeId}`;

  const chairDim1 = leadDim1(sub, sub.chair?.bioguideId);
  const rmDim1 = leadDim1(sub, sub.rankingMember?.bioguideId);
  const points: AlignmentTrackPoint[] = [];
  if (committeeDim1 != null) points.push({ value: committeeDim1, faint: true });
  if (sub.chair && chairDim1 != null) {
    points.push({ value: chairDim1, color: GROUP_VAR[sub.chair.group] });
  }
  if (sub.rankingMember && rmDim1 != null) {
    points.push({ value: rmDim1, color: GROUP_VAR[sub.rankingMember.group] });
  }

  return (
    <div className="border-b border-line">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className={`grid w-full grid-cols-[1fr_140px] items-center gap-4 px-1 py-[0.7rem] text-left hover:bg-surface-raised sm:grid-cols-[1fr_180px] ${FOCUS_RING}`}
      >
        <div className="min-w-0">
          <span className="text-[0.9rem] text-ink">{sub.name}</span>
          <span className="ml-2 text-[0.72rem] text-ink-faint">
            {sub.memberCount} {sub.memberCount === 1 ? "member" : "members"}
          </span>
          <div className="mt-0.5 text-[0.72rem] text-ink-faint">
            {sub.chair && (
              <div>
                Chair: {sub.chair.name} ({partyAbbr(sub.chair.party)})
              </div>
            )}
            {sub.rankingMember && (
              <div>
                Ranking Member: {sub.rankingMember.name} ({partyAbbr(sub.rankingMember.party)})
              </div>
            )}
            {!sub.chair && !sub.rankingMember && <div>Leadership not recorded</div>}
          </div>
        </div>
        <div>
          {points.length > 0 ? (
            <AlignmentTrack points={points} />
          ) : (
            <div className="text-right text-[0.72rem] text-ink-faint">
              Not enough scored members to compare
            </div>
          )}
        </div>
      </button>

      <div id={panelId} className={open ? "block" : "hidden"}>
        <table className="w-full border-collapse text-[0.82rem]">
          <thead>
            <tr>
              {["Name", "Party", "Dim. 1"].map((h) => (
                <th
                  key={h}
                  className="sticky top-0 border-b border-line bg-surface px-[0.4rem] py-2 text-left font-mono text-[0.68rem] uppercase tracking-[0.06em] text-ink-faint"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sub.roster.map((m) => (
              <tr key={m.bioguideId}>
                <td className="border-b border-line px-[0.4rem] py-[0.42rem]">
                  <span
                    className="mr-[0.4rem] inline-block size-2 rounded-full align-middle"
                    style={{ background: GROUP_VAR[m.group] }}
                  />
                  {hasProfilePage(m) ? (
                    <Link href={memberPath(m)} className="hover:text-accent hover:underline">
                      {m.name}
                    </Link>
                  ) : (
                    m.name
                  )}
                </td>
                <td className="border-b border-line px-[0.4rem] py-[0.42rem]">
                  {partyAbbr(m.party)}
                </td>
                <td className="border-b border-line px-[0.4rem] py-[0.42rem] font-mono tabular-nums">
                  {fmt3(m.dim1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Every subcommittee of this committee, one collapsed row each — expansion
 * is per-row (a `Set` of open ids), not a single-open accordion, so any
 * number of rows can be open at once. Renders nothing when the committee has
 * no subcommittees in the raw source (some select/joint committees don't).
 */
export function SubcommitteeSection({ committee }: { committee: CommitteeProfile }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  if (committee.subcommittees.length === 0) return null;

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <ProfilePanel label="Subcommittees">
      <p className="mb-2 text-[0.85rem] leading-[1.6] text-ink-muted">
        {committee.subcommittees.length}{" "}
        {committee.subcommittees.length === 1 ? "subcommittee" : "subcommittees"} of the{" "}
        {committee.shortName} committee. Each row&rsquo;s tick is the full committee&rsquo;s own
        blended position — subcommittee rosters are usually too small for a separate mean
        to mean much, so there isn&rsquo;t one here; the dots are the subcommittee&rsquo;s
        chair and ranking member.
      </p>

      <div className="border-t border-line">
        {committee.subcommittees.map((sub) => (
          <SubcommitteeRow
            key={sub.subcommitteeId}
            sub={sub}
            committeeDim1={committee.dim1}
            open={open.has(sub.subcommitteeId)}
            onToggle={() => toggle(sub.subcommitteeId)}
          />
        ))}
      </div>
    </ProfilePanel>
  );
}
