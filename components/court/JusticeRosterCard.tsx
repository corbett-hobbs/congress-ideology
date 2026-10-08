"use client";

import { useState } from "react";
import Link from "next/link";
import { AlignmentTrack } from "@/components/charts/AlignmentTrack";
import { PillGroup } from "@/components/charts/PillGroup";
import { fmtScore } from "@/lib/court-types";
import type { JusticeProfile, RosterRow } from "@/lib/justice-types";
import { JusticeSwarm } from "./JusticeSwarm";
import { MODE_OPTIONS, partyVar, type JusticeMode } from "./justice-mode";

/** Rows visible before the mobile "Show all" expander (and at md+, the scroll viewport). */
const VISIBLE_ROWS = 4;

/**
 * The right-hand card: the career-average swarm, the toggle that picks which
 * justices are highlighted (here and on the chart beside it), and the roster
 * that follows the toggle. The card has a fixed content height — swarm height
 * is the same in both modes, and the roster is a four-row viewport — so the
 * chart card next to it fills the row to match.
 */
export function JusticeRosterCard({
  profile,
  mode,
  onMode,
}: {
  profile: JusticeProfile;
  mode: JusticeMode;
  onMode: (m: JusticeMode) => void;
}) {
  const { last, chart, roster } = profile;
  const rows = roster[mode];
  const [expanded, setExpanded] = useState(false);
  const canExpand = rows.length > VISIBLE_ROWS;

  return (
    <section
      aria-label={`Where ${last} sits among all justices`}
      className="flex min-w-0 flex-col rounded-[10px] border border-line bg-surface p-[1.1rem_1.25rem_1.1rem]"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h2 className="font-serif text-[1.05rem] font-medium">
            Where {last} sits among all justices
          </h2>
          <p className="mt-1 text-[0.82rem] leading-[1.5] text-ink-muted">
            Career average, every justice in the data set
          </p>
        </div>
      </div>

      <div className="mt-3 flex">
        <PillGroup
          options={MODE_OPTIONS}
          value={mode}
          onChange={onMode}
          ariaLabel={`Which justices to highlight for ${last}`}
        />
      </div>

      <div className="mt-3">
        <JusticeSwarm profile={profile} mode={mode} />
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-line pt-3">
        <h3 className="font-serif text-[0.95rem] font-medium">
          {mode === "alongside" ? `Served alongside ${last}` : "Nearest neighbors"}
        </h3>
        <span className="font-mono text-[0.72rem] text-ink-faint">
          {rows.length} {rows.length === 1 ? "justice" : "justices"}
        </span>
      </div>
      <p className="mb-2 mt-0.5 text-[0.74rem] leading-[1.45] text-ink-muted">
        Closest career average first. Filled dot: the peer. Ring: {last}.
      </p>

      {/* The list fills whatever height the row has (190px minimum), so it grows with the left card when its note is opened. */}
      <div className="relative md:min-h-[190px] md:flex-1">
      <div
        role="region"
        tabIndex={0}
        aria-label={`${mode === "alongside" ? "Justices who served alongside" : "Nearest neighbors of"} ${last}`}
        className={`overflow-x-hidden rounded-md border border-line md:absolute md:inset-0 md:overflow-y-auto ${
          expanded ? "" : "max-md:overflow-y-hidden"
        }`}
      >
        <div className="sticky top-0 z-10 grid h-[30px] grid-cols-[minmax(0,1fr)_64px_84px] items-center gap-x-2 border-b border-line bg-surface-raised px-3 font-mono text-[0.62rem] uppercase tracking-[0.05em] text-ink-faint sm:grid-cols-[minmax(0,1fr)_96px_minmax(0,0.9fr)] sm:gap-x-3">
          <span>Justice</span>
          <span className="whitespace-nowrap">
            {mode === "alongside" ? (
              <>
                <span className="sm:hidden">Together</span>
                <span className="hidden sm:inline">Terms together</span>
              </>
            ) : (
              "Tenure"
            )}
          </span>
          <span>Career avg</span>
        </div>
        {rows.map((r, i) => (
          <RosterLine
            key={r.id}
            row={r}
            subject={profile}
            hidden={!expanded && i >= VISIBLE_ROWS}
            mode={mode}
            domain={chart.domain}
          />
        ))}
      </div>
      </div>

      {canExpand && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((e) => !e)}
          className="mt-1.5 flex w-full items-center justify-center gap-1 py-1.5 text-[0.78rem] text-accent hover:underline md:hidden"
        >
          {expanded ? "Show fewer" : `Show all ${rows.length} justices`}
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            aria-hidden
            className={`flex-none transition-transform ${expanded ? "rotate-180" : ""}`}
          >
            <path d="M2 3.5 L5 6.5 L8 3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </section>
  );
}

function RosterLine({
  row,
  subject,
  hidden,
  mode,
  domain,
}: {
  row: RosterRow;
  subject: JusticeProfile;
  hidden: boolean;
  mode: JusticeMode;
  domain: [number, number];
}) {
  return (
    <Link
      href={row.href}
      className={`grid h-12 grid-cols-[minmax(0,1fr)_64px_84px] items-center gap-x-2 border-b border-line px-3 last:border-b-0 hover:bg-surface-raised sm:grid-cols-[minmax(0,1fr)_96px_minmax(0,0.9fr)] sm:gap-x-3 md:h-10 ${hidden ? "max-md:hidden" : ""}`}
    >
      <span className="flex min-w-0 items-center gap-2 text-[0.82rem]">
        <span
          aria-hidden
          className="size-2 flex-none rounded-full"
          style={{ background: partyVar(row.party) }}
        />
        <span className="truncate">{row.name}</span>
      </span>
      <span className="font-mono text-[0.68rem] tabular-nums text-ink-muted">
        {mode === "alongside" ? row.together : row.tenure}
      </span>
      <span className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 px-2">
          <AlignmentTrack
            domain={domain}
            connect
            zeroTick
            points={[
              { value: subject.justice.career, color: partyVar(subject.justice.party), ring: true },
              { value: row.career, color: partyVar(row.party) },
            ]}
          />
        </span>
        <span className="sr-only">
          career average {fmtScore(row.career)} versus {subject.last} at {fmtScore(subject.justice.career)}
        </span>
      </span>
    </Link>
  );
}
