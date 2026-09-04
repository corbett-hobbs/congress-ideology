"use client";

import { useState } from "react";
import type {
  CommitteeProfile,
  CommitteeSummary,
} from "@/lib/committee-types";
import { nearestNeighbors } from "@/lib/neighbors";
import { CompassPanel } from "@/components/senate/CompassPanel";
import { ProfilePanel } from "@/components/profile/ProfilePanel";
import { ordinal } from "@/components/senate/format";
import { CommitteeCompass } from "./CommitteeCompass";
import { CommitteeNeighborChips } from "./CommitteeNeighborChips";

const N = 5;
type Mode = "all" | "neighbors";

const SCOPE_LABEL = {
  house: "House and joint committees",
  senate: "Senate and joint committees",
  joint: "the joint committees",
} as const;

export function CommitteeCompassCard({
  committee,
  pool,
  backdrop,
}: {
  committee: CommitteeProfile;
  /** The compass field — this committee's chamber + joint (from committee-data). */
  pool: CommitteeSummary[];
  /** Faint member cloud behind the committee dots. */
  backdrop: { dim1: number | null; dim2: number | null }[];
}) {
  const [mode, setMode] = useState<Mode>("all");

  const plottable = committee.dim1 != null && committee.dim2 != null;
  const neighbors = plottable
    ? nearestNeighbors<CommitteeSummary>(
        committee,
        pool,
        N,
        (c) => c.committeeId,
      )
    : [];
  const canToggle = neighbors.length > 0;
  const neighborMode = mode === "neighbors" && canToggle;

  return (
    <ProfilePanel
      label={`In the ${ordinal(committee.latestCongress)} Congress`}
      action={
        canToggle ? (
          <div
            role="group"
            aria-label="Compass view"
            className="flex flex-none overflow-hidden rounded-lg border border-line-strong text-[0.8rem] font-medium"
          >
            {(
              [
                ["all", "All committees"],
                ["neighbors", "Nearest neighbors"],
              ] as const
            ).map(([value, text]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                aria-pressed={mode === value}
                className={`px-2 py-[0.35rem] transition-colors sm:px-[0.85rem] ${
                  mode === value
                    ? "bg-accent text-accent-ink"
                    : "bg-surface-raised text-ink-muted hover:text-ink"
                }`}
              >
                {text}
              </button>
            ))}
          </div>
        ) : undefined
      }
    >
      <p className="mb-2 max-w-[42rem] text-[0.78rem] text-ink-faint">
        {neighborMode
          ? `The ${neighbors.length} committees closest to ${committee.shortName} in ideological space, ringed below; the rest of ${SCOPE_LABEL[committee.chamber]} are faded.`
          : plottable
            ? `${committee.shortName} among ${SCOPE_LABEL[committee.chamber]}, ringed below; the rest are faded.`
            : `${committee.shortName} has no blended position (too few scored members). The field is shown for context.`}
      </p>

      <CompassPanel congress={committee.latestCongress}>
        <CommitteeCompass
          variant="explorer"
          committees={pool}
          subjectId={committee.committeeId}
          neighborIds={
            neighborMode ? neighbors.map((n) => n.member.committeeId) : undefined
          }
          backdrop={backdrop}
          dimUnfocused
        />
      </CompassPanel>

      {neighborMode && (
        <div className="mt-4 border-t border-line pt-3">
          <CommitteeNeighborChips neighbors={neighbors} />
        </div>
      )}
    </ProfilePanel>
  );
}
