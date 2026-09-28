import { isListEligible, type WealthMember } from "@/lib/wealth-derive";
import type { ChamberView } from "@/lib/chamber";
import { WealthList } from "./WealthList";

/**
 * The two side-by-side highest/lowest lists, plus their shared footnote.
 * `members` is the already chamber+state-filtered pool (unlike the scatter
 * and party chart, which never filter, only dim/overlay — a ranked "top N"
 * list showing another state's members wouldn't make sense).
 */
export function WealthListsSection({
  members,
  view,
  stateFilter,
}: {
  members: readonly WealthMember[];
  view: ChamberView;
  stateFilter: string | null;
}) {
  const noUsable = members.filter((m) => m.points.length === 0).length;
  const beforeCutoff = members.filter(
    (m) => m.points.length > 0 && !isListEligible(m),
  ).length;
  const excluded = noUsable + beforeCutoff;

  return (
    <div>
      <div className="grid gap-5 md:grid-cols-2">
        <WealthList
          title="Highest net worth"
          direction="highest"
          members={members}
          view={view}
          stateFilter={stateFilter}
        />
        <WealthList
          title="Lowest net worth"
          direction="lowest"
          members={members}
          view={view}
          stateFilter={stateFilter}
        />
      </div>
      <p className="mt-3 text-[0.72rem] leading-relaxed text-ink-faint">
        High-confidence parses only; members whose latest report couldn&rsquo;t
        be parsed are left out of the rankings. Years are the year each report
        covers. Sparklines share one 2013–2025 axis, each scaled to that
        member&rsquo;s own range, so compare members by the midpoint; dashed
        segments bridge years with no usable filing.{" "}
        {excluded > 0 && (
          <>
            {excluded} current {excluded === 1 ? "member is" : "members are"}{" "}
            left out of the rankings: {noUsable} with no usable filing
            {beforeCutoff > 0 &&
              `, ${beforeCutoff} whose latest usable filing is before 2023`}
            .{" "}
          </>
        )}
        How we estimate this. Sources: House Clerk, Senate eFD.
      </p>
    </div>
  );
}
