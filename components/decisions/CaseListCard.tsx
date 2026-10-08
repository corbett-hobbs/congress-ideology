"use client";

import { useMemo, useState, type UIEvent } from "react";
import { ChartCard } from "@/components/charts/ChartCard";
import { MethodologyNote } from "@/components/MethodologyNote";
import { ALL_AREAS_LABEL, areaFilterLabel, filterCases, fmtInt, wikiArticleUrl, wikiCaseUrl } from "@/lib/decisions-derive";
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
  const { data, range, area, band, pin, landmark } = useDecisionsValues();
  const { setArea, setBand, clearPin, setLandmark } = useDecisionsActions();
  const { cases, failed } = useDecisionCases(data.casesVersion);
  const rows = useMemo(() => (cases ? filterCases(data, cases, { range, area, band, term: pin, landmark }) : []), [data, cases, range, area, band, pin, landmark]);
  const sig = `${range[0]}-${range[1]}|${area}|${band}|${pin}|${landmark}`;
  const [shown, setShown] = useState<{ sig: string; n: number }>({ sig, n: PAGE });
  const n = shown.sig === sig ? shown.n : PAGE;
  const grow = (e: UIEvent<HTMLElement>) => {
    const el = e.currentTarget;
    if (n < rows.length && el.scrollTop + el.clientHeight > el.scrollHeight - 240) setShown({ sig, n: n + PAGE });
  };
  const years = range[0] === range[1] ? `the ${range[0]} term` : `${range[0]}–${range[1]}`;

  return (
    <ChartCard tight title="Every case" lede={`Argued cases decided in ${pin !== null ? `the ${pin} term` : years}, newest first. The list follows the filters above and the charts: pick an issue area, a vote or a term to narrow it.`}>
      <div className="flex flex-wrap items-center gap-1.5 text-[0.78rem] text-ink-muted" aria-live="polite">
        <span className="tabular-nums text-ink">{cases ? `${fmtInt(rows.length)} case${rows.length === 1 ? "" : "s"}` : failed ? "Cases unavailable" : "Loading cases…"}</span>
        {landmark && (
          <Chip onClear={() => setLandmark(false)} label="Clear the landmark filter">
            Landmark cases
          </Chip>
        )}
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
        {area === ALL_AREAS && band === null && pin === null && !landmark && <span>{ALL_AREAS_LABEL}, any vote.</span>}
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
          The same cases as the charts: orally argued, {fmtInt(data.unclearVotes)} with an unclear vote left out. The vote is the justices in the majority and minority; the colour is how many dissented (the bands of the chart above), so a 5–3 decision is coloured with the 6–3 band. Landmark badges come from Wikipedia’s “List of landmark court decisions in the United States” ({fmtInt(data.landmarkSource.count)} cases on this page, from the {data.landmarkSource.revisionDate} revision, CC BY-SA 4.0); a badge links to the article and names the list’s heading. Citations are U.S. Reports where there is one, otherwise the Supreme Court Reporter or Lawyers’ Edition. The sentence under a case is how Wikipedia’s article on it opens: the first of its first three sentences that states the ruling, with the case name and citation cut off the front, in Wikipedia’s words (CC BY-SA 4.0, {fmtInt(data.summarySource.count)} cases, read {data.summarySource.fetched}). Where an article opens without a ruling, or does not exist, the row has no sentence; it is Wikipedia’s summary, not ours, so check the article before relying on it. A case name links to its Wikipedia article when Wikipedia’s volume and term lists of Supreme Court cases tie it to one (by U.S. Reports citation, docket number, or case name and year; {fmtInt(data.articleSource.count)} cases). A case those lists show with no article, which is most of them, is not linked. The few the lists do not cover (the newest decisions) link to a Wikipedia search for the name.
        </p>
        <p>Case names are the Supreme Court Database’s, re-capitalised for reading. Issue areas are the database’s own.</p>
      </MethodologyNote>
    </ChartCard>
  );
}

const BADGE =
  "inline-block whitespace-nowrap rounded-full border border-line-strong bg-surface-raised px-1.5 py-px align-baseline text-[0.66rem] font-medium text-ink-muted no-underline hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/**
 * One case. Phones: the name on its own line; under it the date and citation on the left with the vote on the right (the
 * count a reader scans for); the issue area and the landmark badge below. From `sm`: date, name (badge and citation inline),
 * issue area and vote in four columns. The phone and wide copies of the citation and badge are one or the other (display:none),
 * never both exposed.
 */
function CaseRow({ c, area }: { c: DecisionCase; area: string }) {
  const href = wikiCaseUrl(c);
  const name = href ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={c[8] || c[10] ? "Wikipedia article" : "Search Wikipedia for this case"}
      className="text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      {c[2]}
    </a>
  ) : (
    c[2]
  );
  const badge = c[8] ? (
    <a
      href={wikiArticleUrl(c[8])}
      target="_blank"
      rel="noreferrer"
      title={`Landmark decision on Wikipedia${c[9] ? `: ${c[9]}` : ""}`}
      className={BADGE}
    >
      Landmark{c[9] ? ` \u00b7 ${c[9]}` : ""}
    </a>
  ) : null;
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-b border-line px-3 py-2.5 text-[0.82rem] last:border-b-0 sm:grid-cols-[6.5rem_minmax(0,1fr)_9.5rem_4.5rem] sm:items-baseline sm:gap-y-0.5 sm:py-2">
      {/* name (+ badge and citation inline from sm) */}
      <span className="col-span-2 min-w-0 break-words sm:col-span-1 sm:col-start-2 sm:row-start-1">
        {name}
        {badge && <span className="ml-2 max-sm:hidden">{badge}</span>}
        {c[3] && <span className="ml-2 whitespace-nowrap text-[0.75rem] tabular-nums text-ink-faint max-sm:hidden">{c[3]}</span>}
      </span>
      {/* date (and, on phones, the citation) */}
      <span className="col-start-1 row-start-2 text-[0.75rem] tabular-nums text-ink-muted sm:col-start-1 sm:row-start-1">
        {fmtDate(c[1])}
        {c[3] && <span className="text-ink-faint sm:hidden">{` \u00b7 ${c[3]}`}</span>}
      </span>
      {/* issue area (and, on phones, the landmark badge) */}
      <span className="col-start-1 row-start-3 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[0.75rem] text-ink-muted sm:col-start-3 sm:row-start-1 sm:block sm:truncate" title={area}>
        {area}
        {badge && <span className="sm:hidden">{badge}</span>}
      </span>
      {/* vote: right-aligned under the name on phones */}
      <span
        className="col-start-2 row-span-2 row-start-2 inline-flex items-center justify-end gap-1.5 self-center whitespace-nowrap text-[0.95rem] tabular-nums sm:col-start-4 sm:row-span-1 sm:row-start-1 sm:self-baseline sm:text-[0.82rem]"
        title={BAND_LONG[c[5]]}
      >
        <Swatch color={BAND_COLORS[c[5]]} />
        <span className="font-medium">{`${c[6]}\u2013${c[7]}`}</span>
        <span className="sr-only">{BAND_SHORT[c[5]]} band</span>
      </span>
      {c[11] && <Summary text={c[11]} />}
    </li>
  );
}

/**
 * The one-sentence summary under a case: how the Court ruled, in the opening words of the case's Wikipedia article. Full width
 * under the row (from `sm` it lines up with the name column). On phones it holds to three lines and a tap opens the rest; a
 * wide row shows the whole sentence, which is at most 300 characters.
 */
function Summary({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <p className="col-span-2 m-0 text-[0.76rem] leading-[1.45] text-ink-muted sm:col-span-3 sm:col-start-2 sm:row-start-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={`block w-full cursor-pointer border-0 bg-transparent p-0 text-left font-[inherit] text-inherit sm:cursor-text ${open ? "" : "max-sm:line-clamp-3"} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus`}
      >
        {text}
      </button>
    </p>
  );
}
