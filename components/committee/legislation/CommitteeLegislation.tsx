"use client";

import { useCallback, useMemo, useState } from "react";
import { ChartCard } from "@/components/charts/ChartCard";
import { MethodologyNote } from "@/components/MethodologyNote";
import { NO_FILTER, filterBills, monthColumns, prepareBills, sortBills, stageCounts, subcommitteeMix, type BillFilter, type SortId } from "@/lib/committee-bills-derive";
import type { CommitteeBillsPayload, CommitteeBillsSummary, Stage } from "@/lib/committee-bills-types";
import { fmtInt } from "@/lib/decisions-derive";
import { ordinal } from "@/lib/demographics-chart";
import { BillList } from "./BillList";
import { FlowChart } from "./FlowChart";
import { LegislationFilters } from "./LegislationFilters";
import { MonthChart } from "./MonthChart";
import { StageTiles, type StageView } from "./StageTiles";
import { SubcommitteeStages } from "./SubcommitteeStages";
import { fmtDate, pct } from "./shared";
import { useCommitteeBills } from "./useCommitteeBills";

const TITLE = "Legislation in this committee";

/**
 * The bottom of a committee page: every bill and joint resolution referred to the committee this Congress, and how far each got
 * (referred, hearing, markup, reported or discharged, passed the chamber, law). Three cards on one filter state: the step tiles,
 * month chart and list; the flow of bills from referral to law; and, where the source records subcommittees, each
 * subcommittee's mix. The rows are fetched on mount from `/data/committees/<id>/bills`.
 */
export function CommitteeLegislation({ summary }: { summary: CommitteeBillsSummary }) {
  const { payload, failed } = useCommitteeBills(summary);
  if (payload) return <Loaded payload={payload} />;
  return (
    <section aria-label="Legislation">
      <ChartCard
        title={TITLE}
        lede={failed ? "The list of bills could not be loaded. Reload the page to try again." : `${fmtInt(summary.total)} bills and joint resolutions referred this Congress. Loading their steps…`}
      >
        <div aria-hidden className="h-24 rounded-md bg-surface-raised" />
      </ChartCard>
    </section>
  );
}

function Loaded({ payload }: { payload: CommitteeBillsPayload }) {
  const [filter, setFilter] = useState<BillFilter>(NO_FILTER);
  const [sort, setSort] = useState<SortId>("new");
  const patch = useCallback((p: Partial<BillFilter>) => setFilter((f) => ({ ...f, ...p })), []);
  const pick = filter.stage?.k ?? null;
  const view: StageView = filter.stage?.mode ?? "stop";
  const setPick = useCallback((k: Stage | null, v: StageView = "stop") => setFilter((f) => ({ ...f, stage: k === null ? null : { k, mode: v } })), []);

  const prepared = useMemo(() => prepareBills(payload), [payload]);
  // The tiles and the flow ignore the stage filter (they are how it is picked), the month chart ignores the month.
  const forStages = useMemo(() => filterBills(prepared, filter, payload.sponsors, "stage"), [prepared, filter, payload.sponsors]);
  const counts = useMemo(() => stageCounts(forStages), [forStages]);
  const forMonths = useMemo(() => filterBills(prepared, filter, payload.sponsors, "month"), [prepared, filter, payload.sponsors]);
  const columns = useMemo(() => monthColumns(forMonths, payload.congress, payload.dataThrough), [forMonths, payload.congress, payload.dataThrough]);
  const matched = useMemo(() => sortBills(filterBills(prepared, filter, payload.sponsors), sort), [prepared, filter, payload.sponsors, sort]);
  const mix = useMemo(() => subcommitteeMix(filterBills(prepared, { ...filter, sub: null }, payload.sponsors, "stage"), payload.subs), [prepared, filter, payload.sponsors, payload.subs]);

  const all = useMemo(() => stageCounts(prepared), [prepared]);
  const total = prepared.length;
  const withSub = prepared.filter((b) => (b.row.u ?? []).length > 0).length;
  const narrowed = total !== forStages.length;
  const resetKey = JSON.stringify([filter, sort]);
  const through = fmtDate(payload.dataThrough);

  return (
    <section aria-label="Legislation" className="flex flex-col gap-5">
      <ChartCard
        tight
        title={TITLE}
        lede={
          <>
            <b className="font-semibold text-ink">{fmtInt(total)}</b> bills and joint resolutions referred this {ordinal(payload.congress)} Congress. <b className="font-semibold text-ink">{pct(all.stop[1] ?? 0, total)}</b> have no recorded action since referral; <b className="font-semibold text-ink">{fmtInt(all.reach[4] ?? 0)}</b> left committee and <b className="font-semibold text-ink">{fmtInt(all.reach[6] ?? 0)}</b> became law. Data through {through}.
          </>
        }
      >
        <StageTiles counts={counts} pick={view === "stop" ? pick : null} onPick={(k) => setPick(k, "stop")} />
        <LegislationFilters payload={payload} filter={filter} onChange={patch} />
        <div className="mb-1 mt-5 flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="font-mono text-[0.62rem] uppercase tracking-[0.06em] text-ink-faint">Referred each month, by furthest step</span>
          <span className="text-[0.72rem] text-ink-muted">Select a month to filter</span>
        </div>
        <MonthChart columns={columns} month={filter.month} onMonth={(m) => patch({ month: m })} />
        <div className="mt-5">
          <BillList rows={matched} total={total} payload={payload} sort={sort} onSort={setSort} resetKey={resetKey} />
        </div>
        <MethodologyNote>
          <p>
            Each bill is placed at the furthest step this committee is logged as taking: a hearing the bill was on, a markup (or “ordered to be reported”), a report or a discharge. “Passed chamber” and “Became law” belong to the bill, so a bill referred to several committees appears on each one’s page. Steps appear only where the Library of Congress logged them, so a bill with no recorded action may still have been discussed; subcommittee referral is logged for {pct(withSub, total)} of this committee’s bills. Months count the referral; the latest month is still filling in. Source: GovInfo Bill Status.
          </p>
        </MethodologyNote>
      </ChartCard>

      <ChartCard
        tight
        title="Where do bills go after referral?"
        lede={
          <>
            Each band is a group of bills moving to the next step or ending. Blocks along the bottom show where bills stopped, with no further step recorded. Of the <b className="font-semibold text-ink">{fmtInt(counts.reach[1] ?? 0)}</b> bills{narrowed ? " in the current selection" : ""}, <b className="font-semibold text-ink">{fmtInt(counts.reach[4] ?? 0)}</b> left committee and <b className="font-semibold text-ink">{fmtInt(counts.reach[6] ?? 0)}</b> became law. Select a block to filter the list above.
          </>
        }
      >
        <FlowChart counts={counts} pick={pick} view={view} onPick={(k, v) => setPick(k, v)} />
        <MethodologyNote>
          <p>
            The steps are the stage tiles’. A bill counts as having reached a step only if it is recorded as reaching it, so a bill marked up with no recorded hearing counts at “Markup” but not “Hearing”. A bill that passed the chamber without a report from this committee (another committee handled it, or it was discharged) is counted at “Passed chamber”. Bands follow every filter above except the step. Source: GovInfo Bill Status.
          </p>
        </MethodologyNote>
      </ChartCard>

      {mix.length > 0 && (
        <ChartCard
          tight
          title="Which subcommittees move bills?"
          lede={`Only the ${fmtInt(withSub)} bills with a recorded subcommittee referral are counted. Each bar is that subcommittee's bills, split by furthest step; select one to filter the list above.`}
        >
          <SubcommitteeStages rows={mix} picked={filter.sub} onPick={(i) => patch({ sub: i })} />
          <MethodologyNote>
            <p>A bill referred to two subcommittees counts in both. Many bills are referred to the full committee only, and some committees’ subcommittees are never logged, so this is a partial view. Source: GovInfo Bill Status.</p>
          </MethodologyNote>
        </ChartCard>
      )}
    </section>
  );
}
