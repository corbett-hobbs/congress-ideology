"use client";

import { useEffect, useMemo, useState, type UIEvent } from "react";
import { ChartCard } from "@/components/charts/ChartCard";
import { CaseRow, JUSTICE_COLUMNS } from "@/components/decisions/CaseListCard";
import { useDecisionCases } from "@/components/decisions/useDecisionCases";
import { MethodologyNote } from "@/components/MethodologyNote";
import { VOTE_DISSENT, VOTE_DIVIDED, VOTE_MAJORITY, VOTE_NONE, type JusticeVote } from "@/lib/decisions-entities";
import { fmtInt } from "@/lib/decisions-derive";
import { ROLE_LABEL, VOTE_FILTERS, VOTE_LABEL, joinVotes, matchesVote, pct, voteStats, type VoteFilter, type VotedCase } from "@/lib/justice-votes-derive";

const PAGE = 120;

/** What the card needs from the Decisions data: the issue-area names (case tuples carry an index) and the case list's cache key. */
export interface JusticeVotesSource {
  casesVersion: string;
  areas: { id: string; label: string }[];
}

const PILL = {
  [VOTE_MAJORITY]: "border-line-strong bg-surface-raised text-ink",
  [VOTE_DISSENT]: "border-transparent bg-ink text-surface",
  [VOTE_DIVIDED]: "border-dashed border-ink-muted text-ink",
  [VOTE_NONE]: "border-line text-ink-faint",
} as const;

/** One justice's votes by case id, fetched once on mount. */
function useJusticeVotes(justiceId: number): { votes: JusticeVote[] | null; failed: boolean } {
  const [state, setState] = useState<{ id: number; votes: JusticeVote[] | null; failed: boolean }>({ id: justiceId, votes: null, failed: false });
  useEffect(() => {
    let live = true;
    fetch(`/data/justices/${justiceId}/votes`)
      .then((r) => (r.ok ? (r.json() as Promise<JusticeVote[]>) : Promise.reject(new Error(String(r.status)))))
      .then(
        (votes) => live && setState({ id: justiceId, votes, failed: false }),
        () => live && setState({ id: justiceId, votes: null, failed: true }),
      );
    return () => {
      live = false;
    };
  }, [justiceId]);
  return state.id === justiceId ? state : { votes: null, failed: false };
}

function Qualifier({ v }: { v: VotedCase }) {
  const role = ROLE_LABEL[v.role];
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 sm:flex-nowrap">
      <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-px text-[0.74rem] font-medium ${PILL[v.vote as keyof typeof PILL]}`}>{VOTE_LABEL[v.vote]}</span>
      {role && <span className="text-[0.7rem] text-ink-muted">{role}</span>}
    </span>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-raised px-3 py-2">
      <b className="block text-[1.15rem] font-medium tabular-nums">{value}</b>
      <span className="block text-[0.72rem] leading-[1.35] text-ink-muted">{label}</span>
    </div>
  );
}

/**
 * The justice page's last card: every argued case the justice has a vote in, newest first, in the Decisions page's list (the same
 * rows, from the same `/data/decisions/cases`), with one extra column saying how they voted. The votes are the justice-centered SCDB
 * file (`/data/justices/[id]/votes`). Rows are added as the box scrolls.
 */
export function JusticeVotesCard({ justiceId, last, source }: { justiceId: number; last: string; source: JusticeVotesSource }) {
  const { cases, failed: casesFailed } = useDecisionCases(source.casesVersion);
  const { votes, failed: votesFailed } = useJusticeVotes(justiceId);
  const failed = casesFailed || votesFailed;
  const joined = useMemo(() => (cases && votes ? joinVotes(votes, cases) : null), [cases, votes]);
  const stats = useMemo(() => voteStats(joined ?? []), [joined]);

  const [filter, setFilter] = useState<VoteFilter>("all");
  const [landmark, setLandmark] = useState(false);
  const [query, setQuery] = useState("");
  const terms = useMemo(() => query.toLowerCase().split(/\s+/).filter(Boolean), [query]);
  const rows = useMemo(() => {
    if (!joined) return [];
    return joined.filter((v) => {
      if (!matchesVote(v, filter) || (landmark && !v.c[8])) return false;
      if (terms.length === 0) return true;
      const c = v.c;
      const hay = `${c[2]} ${c[3]} ${c[4] >= 0 ? source.areas[c[4]]?.label : ""} ${c[9] ?? ""} ${c[11] ?? ""}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [joined, filter, landmark, terms, source.areas]);

  const sig = `${filter}|${landmark}|${terms.join(" ")}`;
  const [shown, setShown] = useState<{ sig: string; n: number }>({ sig, n: PAGE });
  const n = shown.sig === sig ? shown.n : PAGE;
  const grow = (e: UIEvent<HTMLElement>) => {
    const el = e.currentTarget;
    if (n < rows.length && el.scrollTop + el.clientHeight > el.scrollHeight - 240) setShown({ sig, n: n + PAGE });
  };

  const first = joined?.length ? joined[joined.length - 1]!.c[0] : null;
  const latest = joined?.length ? joined[0]!.c[0] : null;
  const span = first === null ? "" : first === latest ? ` in the ${first} term` : ` from the ${first} term to ${latest}`;

  return (
    <ChartCard
      tight
      title={`How ${last} voted`}
      action={
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title or keyword"
          aria-label={`Search ${last}'s cases by title or keyword`}
          className="w-full rounded-md border border-line-strong bg-surface-raised px-2.5 py-1 text-[0.82rem] text-ink placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:w-60"
        />
      }
      lede={`Every argued case ${last} took part in${span}, newest first, with how ${last} voted in each: with the majority, in dissent, or in an equally divided Court. A Liberal or Conservative tag is the Supreme Court Database’s coding of who prevailed in the case, not a rating of the justices.`}>
      {joined && (
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat value={fmtInt(stats.took)} label={`cases ${last} voted in`} />
          <Stat value={`${pct(stats.majority, stats.took) ?? "–"}%`} label="in the majority" />
          <Stat value={`${pct(stats.dissent, stats.took) ?? "–"}%`} label="in dissent" />
          <Stat value={stats.close === 0 ? "–" : `${pct(stats.closeMajority, stats.close)}%`} label="in the majority in 5–4 cases" />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5 text-[0.78rem] text-ink-muted" aria-live="polite">
        <span className="tabular-nums text-ink">{joined ? `${fmtInt(rows.length)} case${rows.length === 1 ? "" : "s"}` : failed ? "Cases unavailable" : "Loading cases…"}</span>
        <div role="group" aria-label={`How ${last} voted`} className="flex flex-wrap items-center gap-1.5">
          {VOTE_FILTERS.map((f) => {
            const on = filter === f.value;
            return (
              <button
                key={f.value}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter(f.value)}
                className={`rounded-full border px-2.5 py-0.5 text-[0.75rem] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${on ? "border-ink bg-surface text-ink" : "border-line-strong bg-surface-raised text-ink-muted hover:text-ink"}`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          aria-pressed={landmark}
          onClick={() => setLandmark(!landmark)}
          className={`rounded-full border px-2.5 py-0.5 text-[0.75rem] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${landmark ? "border-ink bg-surface text-ink" : "border-line-strong bg-surface-raised text-ink-muted hover:text-ink"}`}
        >
          Landmark cases
        </button>
      </div>
      <div key={sig} tabIndex={0} aria-label={`${last}'s cases, scrollable`} onScroll={grow} className="touch-scroll relative mt-2 max-h-[32rem] overflow-y-auto overscroll-contain rounded-md border border-line">
        <div
          className={`sticky top-0 z-10 hidden gap-x-3 border-b border-line-strong bg-surface-raised px-3 py-1.5 font-mono text-[0.62rem] uppercase tracking-[0.05em] text-ink-faint sm:grid ${JUSTICE_COLUMNS}`}
          aria-hidden
        >
          <span>Date</span>
          <span>Case</span>
          <span>Issue area</span>
          <span>Vote</span>
          <span>{`How ${last} voted`}</span>
        </div>
        {failed ? (
          <p className="m-0 px-4 py-8 text-center text-[0.82rem] text-ink-muted">The cases could not be loaded. Reload the page to try again.</p>
        ) : joined && rows.length === 0 ? (
          <p className="m-0 px-4 py-8 text-center text-[0.82rem] text-ink-muted">No cases match these filters.</p>
        ) : (
          <ol className="m-0 list-none p-0">
            {rows.slice(0, n).map((v) => (
              <CaseRow key={v.c[14]} c={v.c} area={v.c[4] >= 0 ? (source.areas[v.c[4]]?.label ?? "No issue area") : "No issue area"} areaId={v.c[4] >= 0 ? (source.areas[v.c[4]]?.id ?? null) : null} qualifier={<Qualifier v={v} />} />
            ))}
          </ol>
        )}
      </div>
      <MethodologyNote>
        <p>
          The same argued cases as the Decisions page, each with the justice’s own row from the Supreme Court Database’s justice-centered file. “Majority” includes a concurrence. A case the justice sat out is marked “Did not take part”; it and any case decided by an equally divided Court are left out of the percentages. The database codes a vote that dissented in part by the side the justice took overall, so there is no “split” vote here. “Wrote” means the justice authored an opinion in the case. Votes, opinion authors and the Liberal and Conservative tags: Supreme Court Database (Spaeth et al.); case sentences from Wikipedia as on the Decisions page.
        </p>
      </MethodologyNote>
    </ChartCard>
  );
}
