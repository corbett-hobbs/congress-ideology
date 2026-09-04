import { CHAMBER_COLOR_META, chamberCssVar } from "@/lib/committee-palette";
import type { CommitteeChamber } from "@/lib/committee-types";

const ORDER: readonly CommitteeChamber[] = ["house", "senate", "joint"];

/**
 * Chamber-colour legend for the committee compass — required only in the
 * "Both" view, where House, Senate, and (if present) joint dots all coexist
 * on one chart. Senate-only / House-only filtered views need no legend
 * (every visible dot is already known to be that chamber), but the mapping
 * itself never changes — see lib/committee-palette.ts.
 */
export function CommitteeChamberLegend({
  chambers,
}: {
  /** Chambers actually present in the plotted set, so a chamber with zero
   *  committees (e.g. no joint committees this Congress) isn't shown. */
  chambers: readonly CommitteeChamber[];
}) {
  const present = ORDER.filter((c) => chambers.includes(c));
  if (present.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-x-[1.1rem] gap-y-1 border-t border-line pt-3">
      {present.map((chamber) => (
        <span
          key={chamber}
          className="flex items-center gap-[0.4rem] text-[0.8rem] text-ink-muted"
        >
          <span
            className="size-[0.62rem] flex-none rounded-full"
            style={{ background: chamberCssVar(chamber) }}
          />
          {CHAMBER_COLOR_META[chamber].label}
        </span>
      ))}
    </div>
  );
}
