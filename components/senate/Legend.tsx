import type { ChamberMember } from "@/lib/congress-types";
import { PARTY_META, partyCssVar, presentParties } from "@/lib/party-palette";

/**
 * Party key + count for every party actually present in the shown members —
 * so the legend tracks the Congress as the slider moves, not a fixed list.
 * Democrats/Republicans first, then third parties, then the "Other" fallback.
 */
export function Legend({ members }: { members: ChamberMember[] }) {
  const present = presentParties(members);

  return (
    <div className="flex flex-wrap gap-x-[1.1rem] gap-y-1 border-t border-line pt-3">
      {present.map(({ key, count }) => (
        <span
          key={key}
          className="flex items-center gap-[0.4rem] text-[0.8rem] text-ink-muted"
        >
          <span
            className="size-[0.62rem] flex-none rounded-full"
            style={{ background: partyCssVar(key) }}
          />
          {PARTY_META[key].label} —{" "}
          <span className="font-mono font-medium text-ink">{count}</span>
        </span>
      ))}
    </div>
  );
}
