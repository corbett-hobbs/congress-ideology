"use client";

import { MemberPhoto } from "@/components/MemberPhoto";
import { chamberLabel } from "@/lib/chamber";
import { memberPath } from "@/lib/member-url";
import { isListEligible, type WealthMember, type WealthYearPoint } from "@/lib/wealth-derive";
import { wealthCountNoun } from "@/lib/wealth-copy";
import { formatCompactUSD, formatOpenEndedUSD } from "@/lib/format-money";
import { stateName } from "@/lib/states";
import { Sparkline } from "./Sparkline";
import type { ChamberView } from "@/lib/chamber";

function lastNameOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1];
}

interface WealthListProps {
  title: string;
  direction: "highest" | "lowest";
  members: readonly WealthMember[];
  view: ChamberView;
  stateFilter: string | null;
}

/** One of the two side-by-side ranked lists on /wealth. */
export function WealthList({ title, direction, members, view, stateFilter }: WealthListProps) {
  const eligible = members.filter(isListEligible);
  const ranked = [...eligible].sort((a, b) => {
    const av = a.points[a.points.length - 1].midpoint;
    const bv = b.points[b.points.length - 1].midpoint;
    if (av !== bv) return direction === "highest" ? bv - av : av - bv;
    return lastNameOf(a.name).localeCompare(lastNameOf(b.name));
  });

  const hasNegative = direction === "lowest" && ranked.some((m) => m.points[m.points.length - 1].midpoint < 0);
  const noun = wealthCountNoun(view);

  return (
    <section className="flex min-w-0 flex-col rounded-xl border border-line-strong bg-surface p-5 sm:p-6">
      <h2 className="font-serif text-lg font-medium text-ink sm:text-xl">{title}</h2>
      <p className="mt-1 text-[0.8rem] text-ink-muted">
        Ranked from the {direction === "highest" ? "top" : "bottom"} · {ranked.length} {noun} with
        net worth data from 2023 or later
        {stateFilter && ` in ${stateName(stateFilter)}`}
      </p>
      {hasNegative && (
        <p className="mt-1 text-[0.75rem] text-ink-faint">
          Some members here have liabilities that exceed their assets — a negative estimated net
          worth.
        </p>
      )}

      <div
        role="region"
        tabIndex={0}
        aria-label={`${title} table, ${ranked.length} rows`}
        className="mt-3 max-h-[26rem] overflow-x-auto overflow-y-auto rounded-md border border-line"
      >
        <table className="w-full min-w-[22rem] border-collapse text-[0.82rem]">
          <thead className="sticky top-0 z-10 bg-surface-raised">
            <tr>
              <th className="w-8 border-b border-line px-2 py-2 text-left font-mono text-[0.62rem] uppercase tracking-[0.05em] text-ink-faint">
                #
              </th>
              <th className="border-b border-line px-2 py-2 text-left font-mono text-[0.62rem] uppercase tracking-[0.05em] text-ink-faint">
                Member
              </th>
              <th className="border-b border-line px-2 py-2 text-left font-mono text-[0.62rem] uppercase tracking-[0.05em] text-ink-faint">
                Trend
              </th>
              <th className="border-b border-line px-2 py-2 text-right font-mono text-[0.62rem] uppercase tracking-[0.05em] text-ink-faint">
                Est. net worth
              </th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((m, i) => (
              <WealthListRow key={m.bioguideId} rank={i + 1} member={m} />
            ))}
          </tbody>
        </table>
        {ranked.length === 0 && (
          <p className="p-4 text-center text-[0.82rem] text-ink-faint">
            No members match these filters.
          </p>
        )}
      </div>
    </section>
  );
}

function WealthListRow({ rank, member }: { rank: number; member: WealthMember }) {
  const latest = member.points[member.points.length - 1];
  const district = member.chamber === "house" && member.district ? `-${member.district}` : "";

  return (
    <tr className="h-14 border-b border-line last:border-0 hover:bg-surface-raised">
      <td className="px-2 py-1 font-mono tabular-nums text-ink-faint">{rank}</td>
      <td className="px-2 py-1">
        <a href={memberPath(member)} className="flex items-center gap-2">
          <MemberPhoto
            bioguideId={member.bioguideId}
            hasPhoto={member.hasPhoto}
            size="small"
            className="h-9 w-7 flex-none rounded-sm object-cover object-top"
          />
          <span className="min-w-0">
            <span className="block truncate font-medium text-ink">{member.name}</span>
            <span className="flex items-center gap-1 text-[0.72rem] text-ink-faint">
              <span
                aria-hidden
                className={`size-1.5 flex-none rounded-full ${member.caucus === "Democrat" ? "bg-dem" : "bg-rep"}`}
              />
              {member.caucus === "Democrat" ? "D" : "R"} · {chamberLabel(member.chamber)} ·{" "}
              {member.state}
              {district}
            </span>
          </span>
        </a>
      </td>
      <td className="px-2 py-1">
        <Sparkline series={member.series} />
      </td>
      <td className="px-2 py-1 text-right">
        <NetWorthCell point={latest} />
      </td>
    </tr>
  );
}

function NetWorthCell({ point }: { point: WealthYearPoint }) {
  const { midpoint, range } = point;
  const midpointText = range.openEnded ? formatOpenEndedUSD(midpoint) : formatCompactUSD(midpoint);

  let rangeText: string;
  if (range.unavailable) rangeText = "Open-ended band";
  else if (range.openEnded) rangeText = `${formatCompactUSD(range.lo!)} or more`;
  else rangeText = `${formatCompactUSD(range.lo!)} – ${formatCompactUSD(range.hi!)}`;

  return (
    <div>
      <div className="font-mono font-semibold tabular-nums text-ink">{midpointText}</div>
      <div className="font-mono text-[0.68rem] tabular-nums text-ink-faint">{rangeText}</div>
    </div>
  );
}
