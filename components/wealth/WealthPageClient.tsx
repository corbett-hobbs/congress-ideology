"use client";

import { useMemo, useState } from "react";
import { stateName } from "@/lib/states";
import type { ChamberView } from "@/lib/chamber";
import type { WealthMember } from "@/lib/wealth-data";
import { HowToReadNotes } from "@/components/wealth/HowToReadNotes";
import { WealthFilterBar } from "./WealthFilterBar";
import { NetWorthScatterCard } from "./NetWorthScatterCard";
import { WealthListsSection } from "./WealthListsSection";

/**
 * Owns the one shared chamber/state filter for the whole page (plan §2,
 * decision 2) — page-level React state, not URL params: unlike the homepage
 * explorer, /wealth's filter bar only has a chamber switch and a state
 * dropdown, no per-view page to link back to from elsewhere, so there's no
 * cross-page link that needs a shareable URL yet. Every section below reads
 * `view/stateFilter` from here; nothing keeps independent filter state.
 */
export function WealthPageClient({ members }: { members: WealthMember[] }) {
  const [view, setView] = useState<ChamberView>("both");
  const [stateFilter, setStateFilter] = useState<string | null>(null);

  const chamberPool = useMemo(
    () => (view === "both" ? members : members.filter((m) => m.chamber === view)),
    [members, view],
  );

  // Same list/order as the homepage: every state (incl. territorial
  // delegates, who ride along under their delegate "state" code) present
  // among current members of the selected chamber, sorted by display name.
  const states = useMemo(
    () =>
      [...new Set(chamberPool.map((m) => m.state))].sort((a, b) =>
        stateName(a).localeCompare(stateName(b)),
      ),
    [chamberPool],
  );

  // Changing chamber can strand a state that isn't in the new pool (e.g. a
  // territory only the House has) — drop the filter rather than show a
  // selection that no longer applies, same as the explorer.
  const effectiveStateFilter =
    stateFilter && states.includes(stateFilter) ? stateFilter : null;

  const pool = useMemo(
    () =>
      effectiveStateFilter
        ? chamberPool.filter((m) => m.state === effectiveStateFilter)
        : chamberPool,
    [chamberPool, effectiveStateFilter],
  );

  const withData = useMemo(
    () => pool.filter((m) => m.points.length > 0),
    [pool],
  );

  return (
    <>
      <WealthFilterBar
        view={view}
        onViewChange={setView}
        states={states}
        stateFilter={effectiveStateFilter}
        onStateFilterChange={setStateFilter}
        count={withData.length}
      />

      <main className="mx-auto flex w-full max-w-[1120px] flex-col gap-8 px-4 pb-16 pt-7 sm:px-6">
        <div>
          <h1 className="mb-3 font-serif text-[clamp(1.7rem,3.6vw,2.35rem)] font-medium leading-[1.1] tracking-[-0.01em]">
            How Much Is Congress Worth?
          </h1>
          <p className="max-w-[46rem] text-[0.92rem] leading-[1.65] text-ink-muted">
            Members of Congress don&apos;t report their net worth. They file an
            annual financial disclosure listing what they own and what they
            owe, and for almost every line, they report a range instead of a
            dollar figure. A stock might be &ldquo;$15,001-$50,000&rdquo;; a
            loan might be &ldquo;$100,001-$250,000.&rdquo; We take the midpoint
            of each range, add up the assets, subtract the liabilities, and get
            an estimate of net worth for each member and year. The ranges are
            wide, so treat every number here as an estimate rather than a
            precise total. Where they add up to something big enough, the
            estimates still show which members have grown their wealth the
            fastest, which have fallen behind, and how much a member&apos;s
            finances have changed since they took office.
          </p>
          <details className="mt-3 max-w-[46rem] text-[0.92rem] leading-[1.65] text-ink-muted">
            <summary className="cursor-pointer font-medium text-ink">
              How to read this
            </summary>
            <HowToReadNotes />
          </details>
        </div>

        <NetWorthScatterCard
          key={view}
          view={view}
          chamberMembers={chamberPool}
          stateFilter={effectiveStateFilter}
        />
        <WealthListsSection
          members={pool}
          view={view}
          stateFilter={effectiveStateFilter}
        />
      </main>
    </>
  );
}
