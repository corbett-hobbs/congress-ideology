"use client";

import { useMemo, useState, type UIEvent } from "react";
import { ChartCard } from "@/components/charts/ChartCard";
import { MethodologyNote } from "@/components/MethodologyNote";
import { ALL_AREAS_LABEL, areaFilterLabel, caseUrl, filterCases, fmtInt } from "@/lib/decisions-derive";
import { ALL_AREAS, BAND_COLORS, BAND_LONG, BAND_SHORT, type DecisionCase } from "@/lib/decisions-types";
import { useDecisionsActions, useDecisionsValues } from "./DecisionsState";
import { Swatch } from "./shared";
import { useDecisionCases } from "./useDecisionCases";

const PAGE = 120;

const fmtDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

function Chip({ children, onClear, label }: { children: string; onClear: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClear}
      aria-label={label}
      className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-surface-raised px-2 py-0.5 text-[0.75rem] text-ink hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      {children}
      <span aria-hidden className="text-ink-muted">
        ×
      </span>
    </button>
  );
}

/**
 * Card 4: every argued case that matches the page's filters, newest first, in a fixed-height scrolling box (the
 * executive-order list pattern). It follows the pinned bar (years, issue area), the legend of card 1 (issue area), card 2's
 * band (how many dissented) and a pinned term; each active filter is a chip that clears itself. Rows are added as the box is
 * scrolled, so 8,000 cases never sit in the page at once.
 */
export function CaseListCard() {
  const { data, range, area, band, pin } = useDecisionsValues();
  const { setArea, setBand, clearPin } = useDecisionsActions();
  const { cases, failed } = useDecisionCases();
  const rows = useMemo(() => (cases ? filterCases(data, cases, { range, area, band, term: pin }) : []), [data, cases, range, area, band, pin]);
  const sig = `${range[0]}-${range[1]}|${area}|${band}|${pin}`;
  const [shown, setShown] = useState<{ sig: string; n: number }>({ sig, n: PAGE });
  const n = shown.sig === sig ? shown.n : PAGE;
  const grow = (e: UIEvent<HTMLElement>) => {
    const el = e.currentTarget;
    if (n < rows.length && el.scrollTop + el.clientHeight > el.scrollHeight - 240) setShown({ sig, n: n + PAGE });
  };
  const years = range[0] === range[1] ? `the ${range[0]} term` : `${range[0]}–${range[1]}`;

  return (
    <ChartCard title="Every case" lede={`Argued cases decided in ${pin !== null ? `the ${pin} term` : years}, newest first. The list follows the filters above and the charts: pick an issue area, a vote or a term to narrow it.`}>
      <div className="flex flex-wrap items-center gap-1.5 text-[0.78rem] text-ink-muted" aria-live="polite">
        <span className="tabular-nums text-ink">{cases ? `${fmtInt(rows.length)} case${rows.length === 1 ? "" : "s"}` : failed ? "Cases unavailable" : "Loading cases…"}</span>
        {area !== ALL_AREAS && (
          <Chip onClear={() => setArea(ALL_AREAS)} label="Clear the issue area filter">
            {areaFilterLabel(data, area)}
          </Chip>
        )}
        {band !== null && (
          <Chip onClear={() => setBand(null)} label="Clear the vote filter">
            {BAND_LONG[band]}
          </Chip>
        )}
        {pin !== null && (
          <Chip onClear={clearPin} label="Clear the pinned term">
            {`${pin} term`}
          </Chip>
        )}
        {area === ALL_AREAS && band === null && pin === null && <span>{ALL_AREAS_LABEL}, any vote.</span>}
      </div>
      <div
        key={sig}
        tabIndex={0}
        aria-label="Cases, scrollable"
        onScroll={grow}
        className="touch-scroll relative mt-2 max-h-[32rem] overflow-y-auto overscroll-contain rounded-md border border-line"
      >
        {failed ? (
          <p className="m-0 px-4 py-8 text-center text-[0.82rem] text-ink-muted">The case list could not be loaded. Reload the page to try again.</p>
        ) : rows.length === 0 && cases ? (
          <p className="m-0 px-4 py-8 text-center text-[0.82rem] text-ink-muted">No cases match these filters.</p>
        ) : (
          <ol className="m-0 list-none p-0">
            {rows.slice(0, n).map((c, i) => (
              <CaseRow key={`${c[0]}-${c[1]}-${c[3]}-${i}`} c={c} area={c[4] >= 0 ? data.areas[c[4]].label : "No issue area"} />
            ))}
          </ol>
        )}
      </div>
      <MethodologyNote>
        <p>
          The same cases as the charts: orally argued, {fmtInt(data.unclearVotes)} with an unclear vote left out. The vote is the justices in the majority and minority; the colour is how many dissented (the bands of the chart above), so a 5–3 decision is coloured with the 6–3 band. Citations are U.S. Reports where there is one, otherwise the Supreme Court Reporter or Lawyers’ Edition; links go to Justia for U.S. Reports cases.
        </p>
        <p>Case names are the Supreme Court Database’s, re-capitalised for reading. Issue areas are the database’s own.</p>
      </MethodologyNote>
    </ChartCard>
  );
}

function CaseRow({ c, area }: { c: DecisionCase; area: string }) {
  const url = caseUrl(c[3]);
  const name = url ? (
    <a href={url} target="_blank" rel="noreferrer" className="text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
      {c[2]}
    </a>
  ) : (
    <span className="text-ink">{c[2]}</span>
  );
  return (
    <li className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 border-b border-line px-3 py-2 text-[0.82rem] last:border-b-0 sm:grid-cols-[6.5rem_1fr_9.5rem_4.5rem] sm:items-baseline">
      <span className="order-2 text-[0.75rem] tabular-nums text-ink-muted sm:order-none">{fmtDate(c[1])}</span>
      <span className="order-1 col-span-2 min-w-0 sm:order-none sm:col-span-1">
        <span className="break-words">{name}</span>
        {c[3] && <span className="ml-2 whitespace-nowrap text-[0.75rem] tabular-nums text-ink-faint">{c[3]}</span>}
      </span>
      <span className="order-3 col-span-1 truncate text-[0.75rem] text-ink-muted sm:order-none" title={area}>
        {area}
      </span>
      <span className="order-4 inline-flex items-center justify-end gap-1.5 whitespace-nowrap tabular-nums sm:order-none" title={`${BAND_LONG[c[5]]}`}>
        <Swatch color={BAND_COLORS[c[5]]} />
        <span className="font-medium">{`${c[6]}–${c[7]}`}</span>
        <span className="sr-only">{BAND_SHORT[c[5]]} band</span>
      </span>
    </li>
  );
}
