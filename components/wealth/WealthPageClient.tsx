"use client";

import { useMemo, useState } from "react";
import { stateName } from "@/lib/states";
import type { ChamberView } from "@/lib/chamber";
import type { WealthMember } from "@/lib/wealth-data";
import { WealthFilterBar } from "./WealthFilterBar";
import { NetWorthScatterCard } from "./NetWorthScatterCard";
import { PartyWealthChart } from "./PartyWealthChart";

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
            Congressional net worth
          </h1>
          <p className="max-w-[46rem] text-[0.92rem] leading-[1.65] text-ink-muted">
            Estimated from annual House Clerk and Senate eFD financial
            disclosures. Every figure is a range reported in bands, so trend
            lines trace the midpoint of each band.
          </p>
        </div>

        <NetWorthScatterCard
          key={view}
          view={view}
          chamberMembers={chamberPool}
          stateFilter={effectiveStateFilter}
        />
        <PartyWealthChart
          view={view}
          chamberMembers={chamberPool}
          stateFilter={effectiveStateFilter}
        />
        <div className="grid gap-5 md:grid-cols-2">
          <PlaceholderSection title="Highest net worth" note="Session 4." />
          <PlaceholderSection title="Lowest net worth" note="Session 4." />
        </div>
      </main>
    </>
  );
}

function PlaceholderSection({ title, note }: { title: string; note: string }) {
  return (
    <section className="rounded-xl border border-dashed border-line-strong bg-surface-raised/40 p-6">
      <h2 className="font-serif text-lg font-medium text-ink">{title}</h2>
      <p className="mt-1 font-mono text-[0.72rem] text-ink-faint">{note}</p>
    </section>
  );
}
