"use client";

import Link from "next/link";
import { Swatch } from "@/components/decisions/shared";
import { STAGES, billLabel, congressGovUrl, passedHere, stageVar, timelineSteps, type PreparedBill } from "@/lib/committee-bills-derive";
import type { BillSponsorCell, CommitteeBillsPayload, Stage } from "@/lib/committee-bills-types";
import { fmtInt } from "@/lib/decisions-derive";
import { FOCUS_RING, dateOrDash, fmtDate } from "./shared";

const BADGE = "inline-block whitespace-nowrap rounded-full border border-line-strong bg-surface-raised px-1.5 py-px align-baseline text-[0.66rem] font-medium text-ink-muted";
const PARTY_DOT: Record<string, string> = { D: "var(--dem)", R: "var(--rep)" };
const partyDot = (p: string) => PARTY_DOT[p] ?? "var(--oth)";

/** The step's plain-language name for a bill: "Reported", "Discharged", "Passed the House" ... */
export function stageWords(b: PreparedBill, chamber: CommitteeBillsPayload["chamber"]): string {
  const r = b.row;
  if (b.stage === 6) return "Became law";
  if (b.stage === 5) return chamber === "senate" ? "Passed the Senate" : chamber === "house" ? "Passed the House" : "Passed a chamber";
  if (b.stage === 4) return r.d && !r.p ? "Discharged" : "Reported";
  return STAGES[b.stage - 1]!.label;
}

/** Six pips: referred, hearing, markup, out of committee, passed the chamber, law. Filled where the source records the step; the line fills as far as the bill got. */
function Track({ b, chamber }: { b: PreparedBill; chamber: CommitteeBillsPayload["chamber"] }) {
  const r = b.row;
  const done = [true, !!r.h, !!r.m, !!(r.p || r.d), passedHere(r.g, chamber), !!r.l];
  return (
    <span className="flex items-center" aria-hidden>
      {done.map((on, i) => (
        <span key={i} className="flex items-center" style={{ flex: i < 5 ? "1 1 0" : "0 0 auto" }}>
          <b className="block h-[11px] w-[11px] flex-none rounded-full border-2" style={{ borderColor: on ? stageVar((i + 1) as Stage) : "var(--line-strong)", background: on ? stageVar((i + 1) as Stage) : "var(--surface)" }} />
          {i < 5 && <u className="block h-0.5 min-w-[5px] flex-1 no-underline" style={{ background: i + 1 < b.stage ? stageVar((i + 2) as Stage) : "var(--line)" }} />}
        </span>
      ))}
    </span>
  );
}

function Cosponsors({ c }: { c: [number, number, number] | undefined }) {
  const total = c ? c[0] + c[1] + c[2] : 0;
  return (
    <span className="block text-[0.72rem] tabular-nums text-ink-muted">
      {fmtInt(total)}
      <span aria-hidden className="mt-0.5 flex h-[6px] w-full overflow-hidden rounded-[2px] bg-line">
        {c && total > 0 && (
          <>
            <i className="block h-full" style={{ width: `${(c[0] / total) * 100}%`, background: "var(--dem)" }} />
            <i className="block h-full" style={{ width: `${(c[1] / total) * 100}%`, background: "var(--rep)" }} />
            <i className="block h-full" style={{ width: `${(c[2] / total) * 100}%`, background: "var(--oth)" }} />
          </>
        )}
      </span>
      {c && total > 0 && <span className="sr-only">{`${c[0]} Democratic, ${c[1]} Republican, ${c[2]} other`}</span>}
    </span>
  );
}

/** The grid every row and the column header share: bill, sponsor, cosponsors, progress, latest action (below `lg` the middle ones stack). */
export const ROW_GRID = "lg:grid lg:grid-cols-[minmax(0,1fr)_10.5rem_5.5rem_9.5rem_9rem] lg:gap-x-4";

export function BillRow({ b, payload, open, onToggle }: { b: PreparedBill; payload: CommitteeBillsPayload; open: boolean; onToggle: () => void }) {
  const r = b.row;
  const sponsor: BillSponsorCell | undefined = r.s === undefined ? undefined : payload.sponsors[r.s];
  const panel = `bill-${r.b}${r.n}`;
  const bypass = b.stage === 5 && !r.p && !r.d;
  const badges = (
    <>
      {r.l && (
        <span className={`${BADGE} !border-[var(--stage-6)] !text-ink`} style={{ background: "color-mix(in oklab, var(--stage-6) 14%, var(--surface))" }}>
          {`Law ${r.l.replace("-", "–")}`}
        </span>
      )}
      {r.y && (
        <span className={`${BADGE} border-dashed`} title={`This bill did not become law on its own; it was enacted as part of ${billLabel({ b: r.y[1], n: r.y[2] })} (Public Law ${r.y[0]}).`}>
          {`In ${billLabel({ b: r.y[1], n: r.y[2] })}`}
        </span>
      )}
      {r.v === 1 && <span className={BADGE}>Vetoed</span>}
      {r.d && !r.p && <span className={BADGE}>Discharged</span>}
      {bypass && (
        <span className={BADGE} title="Passed the chamber without a report from this committee">
          Floor, no report
        </span>
      )}
      {(r.x ?? 0) > 0 && (
        <span className={`${BADGE} border-dashed`} title={`Also referred to ${r.x} other committee${r.x === 1 ? "" : "s"}`}>
          {`+${r.x} committee${r.x === 1 ? "" : "s"}`}
        </span>
      )}
    </>
  );
  const latest = r.y && r.z ? { date: r.z[0], text: `Enacted as part of ${billLabel({ b: r.y[1], n: r.y[2] })} (Pub. L. ${r.y[0].replace("-", "–")})` } : r.z ? { date: r.z[0], text: r.z[1] } : { date: r.r, text: "Referred" };
  return (
    <li className="border-b border-line last:border-b-0">
      <button type="button" aria-expanded={open} aria-controls={panel} onClick={onToggle} className={`block w-full px-3 py-2.5 text-left text-[0.82rem] hover:bg-surface-raised ${ROW_GRID} lg:items-start ${FOCUS_RING}`}>
        <span className="block min-w-0 break-words leading-[1.3]">
          <span className="mr-1.5 whitespace-nowrap font-mono text-[0.72rem] text-ink-muted">{billLabel(r)}</span>
          <span className="text-ink">{r.t}</span>
          <span className="ml-1.5 inline-flex flex-wrap gap-1 align-baseline">{badges}</span>
        </span>
        <span className="mt-1 block text-[0.76rem] leading-[1.3] text-ink-muted lg:mt-0">
          {sponsor ? (
            <>
              <i aria-hidden className="mr-1.5 inline-block size-2 rounded-full align-baseline" style={{ background: partyDot(sponsor[2]) }} />
              {sponsor[0]} <span className="text-ink-faint">({sponsor[1]})</span>
            </>
          ) : (
            <span className="text-ink-faint">No sponsor recorded</span>
          )}
        </span>
        <span className="mt-1 hidden lg:mt-0 lg:block">
          <Cosponsors c={r.c} />
        </span>
        <span className="mt-1.5 block lg:mt-0">
          <Track b={b} chamber={payload.chamber} />
          <span className="mt-0.5 block text-[0.72rem] text-ink">
            {stageWords(b, payload.chamber)}
            {b.waiting !== null && <span className="ml-1.5 text-[var(--note)]">{`Waiting ${fmtInt(b.waiting)} days`}</span>}
          </span>
        </span>
        <span className="mt-1 block text-[0.74rem] leading-[1.35] text-ink-muted lg:mt-0">
          <b className="font-medium tabular-nums text-ink">{fmtDate(latest.date)}</b> {latest.text}
        </span>
      </button>
      {open && <BillDetail id={panel} b={b} payload={payload} sponsor={sponsor} />}
    </li>
  );
}

function BillDetail({ id, b, payload, sponsor }: { id: string; b: PreparedBill; payload: CommitteeBillsPayload; sponsor: BillSponsorCell | undefined }) {
  const r = b.row;
  const steps = timelineSteps(r, payload.chamber);
  const subs = (r.u ?? []).map((u) => payload.subs[u]?.name).filter(Boolean);
  const c = r.c;
  return (
    <div id={id} className="grid gap-x-10 gap-y-3 border-t border-dashed border-line-strong bg-surface-raised px-3 pb-3 pt-2.5 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <ol className="m-0 list-none border-l-2 border-line p-0 pl-3.5 text-[0.76rem]">
        {steps.map((s) => (
          <li key={s.label} className={`relative pb-2 pl-2 leading-[1.35] ${s.done ? "text-ink-muted" : "text-ink-faint"}`}>
            <i aria-hidden className="absolute -left-[1.45rem] top-[3px] block size-2.5 rounded-full border-2 border-surface-raised" style={s.done ? { background: stageVar(s.stage) } : { background: "var(--surface-raised)", boxShadow: "0 0 0 2px var(--line-strong)" }} />
            <b className="font-medium text-ink">{s.label}</b> {s.done ? (s.date ? dateOrDash(s.date) : "") : "· not recorded"}
            {s.done && s.note ? ` · ${s.note}` : ""}
          </li>
        ))}
      </ol>
      <div className="text-[0.76rem] leading-[1.65] text-ink-muted">
        <div>
          Sponsor:{" "}
          {sponsor ? (
            sponsor[3] ? (
              <Link href={sponsor[3]} className="text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink">
                {sponsor[0]}
              </Link>
            ) : (
              <span className="text-ink">{sponsor[0]}</span>
            )
          ) : (
            "none recorded"
          )}
          {sponsor ? ` (${sponsor[1]})` : ""}
        </div>
        <div>
          Cosponsors:{" "}
          {c && c[0] + c[1] + c[2] > 0 ? (
            <span className="inline-flex flex-wrap items-center gap-x-2">
              <span className="inline-flex items-center gap-1"><Swatch color="var(--dem)" />{c[0]} D</span>
              <span className="inline-flex items-center gap-1"><Swatch color="var(--rep)" />{c[1]} R</span>
              {c[2] > 0 && <span className="inline-flex items-center gap-1"><Swatch color="var(--oth)" />{c[2]} other</span>}
            </span>
          ) : (
            "none"
          )}
        </div>
        {r.y && (
          <div>
            Became law as part of {billLabel({ b: r.y[1], n: r.y[2] })} (Public Law {r.y[0].replace("-", "–")}); this bill was not signed on its own, so its stage here is unchanged.
          </div>
        )}
        <div>Introduced {fmtDate(r.i)}</div>
        {r.a !== undefined && <div>Policy area: {payload.areas[r.a]}</div>}
        {subs.length > 0 && <div>Subcommittee: {subs.join(", ")}</div>}
        {(r.x ?? 0) > 0 && <div>Also referred to {r.x} other committee{r.x === 1 ? "" : "s"}</div>}
        <div>CBO cost estimate: {r.o ? `${r.o} on file` : "none on file"}</div>
        <a href={congressGovUrl(r, payload.congress)} target="_blank" rel="noreferrer" className="text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink">
          Bill text and history on Congress.gov →
        </a>
      </div>
    </div>
  );
}
