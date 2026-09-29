"use client";

import { useState } from "react";
import type { MemberProfile } from "@/lib/congress-types";
import type { MemberWealthProfile } from "@/lib/wealth-data";
import { chamberLabel } from "@/lib/chamber";
import { formatCompactUSD, formatOpenEndedUSD } from "@/lib/format-money";
import { MemberNetWorthChart } from "@/components/wealth/MemberNetWorthChart";
import { MemberWealthItemsPanel } from "@/components/wealth/MemberWealthItemsPanel";

interface Props {
  profile: MemberProfile;
  wealthProfile: MemberWealthProfile;
}

/**
 * Full-width "Net worth over time" card, below the ideology sections (see
 * MemberProfileView's future-verticals comment). Combines Session 1's usable
 * financial-disclosure rows with Session 5's per-item extraction: the chart
 * (left) plots every year 2013–2025 in one of four states, and the right
 * column lists the actual assets/liabilities for whichever year is selected
 * — driven either by the dropdown or by clicking a point on the chart.
 */
export function MemberWealthSection({ profile, wealthProfile }: Props) {
  const { years, lineItemRows } = wealthProfile;
  const dataYears = years.filter((y) => y.kind === "usable" || y.kind === "needs_review") as Extract<
    (typeof years)[number],
    { kind: "usable" | "needs_review" }
  >[];

  const defaultYear = lineItemRows.length
    ? lineItemRows[lineItemRows.length - 1].year
    : (dataYears[dataYears.length - 1] ?? years[years.length - 1]).year;
  const [selectedYear, setSelectedYear] = useState(defaultYear);

  // No card at all when the member has no usable/reviewable filing rows —
  // not an empty state, an absent section (matches CommitteeMembershipsCard's
  // own convention for a member with nothing to show). Checked after the
  // hook above, never before (rules-of-hooks).
  if (dataYears.length === 0) return null;

  const latest = dataYears[dataYears.length - 1];

  return (
    <section
      aria-label="Net worth"
      className="rounded-xl border border-line-strong bg-surface p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.08em] text-ink-faint">
            Financial disclosures · {chamberLabel(profile.chamber)}
          </p>
          <h2 className="mt-1 font-serif text-xl font-medium text-ink sm:text-2xl">
            Net worth over time
          </h2>
        </div>
        <div className="text-right">
          <p className="text-[0.78rem] text-ink-muted">Net worth for {latest.year}</p>
          <p className="font-mono text-2xl font-semibold tabular-nums text-ink">
            {latest.range.openEnded ? formatOpenEndedUSD(latest.midpoint) : formatCompactUSD(latest.midpoint)}
          </p>
          <p className="font-mono text-[0.72rem] tabular-nums text-ink-faint">
            {latest.range.unavailable
              ? "Range unavailable"
              : latest.range.openEnded
                ? `Range ${formatCompactUSD(latest.range.lo!)} or more`
                : `Range ${formatCompactUSD(latest.range.lo!)} – ${formatCompactUSD(latest.range.hi!)}`}
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_20rem]">
        <MemberNetWorthChart
          years={years}
          selectedYear={selectedYear}
          onSelectYear={setSelectedYear}
          memberName={profile.name}
        />
        <MemberWealthItemsPanel
          lineItemRows={lineItemRows}
          years={years}
          selectedYear={selectedYear}
          onSelectYear={setSelectedYear}
        />
      </div>

      <p className="mt-4 text-[0.72rem] leading-relaxed text-ink-faint">
        Estimated from the asset and liability ranges on each annual
        disclosure. Years are the year each report covers, so a report filed
        in 2025 appears as 2024. Ranges are wide by design: the line traces
        the midpoint and the shaded band shows the full reported range. How
        we estimate this · Source: {chamberLabel(profile.chamber) === "House" ? "House Clerk" : "Senate eFD"}.
      </p>
    </section>
  );
}
