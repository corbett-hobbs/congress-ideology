"use client";

import { useEffect, useMemo, useState, type UIEvent } from "react";
import { ChartCard } from "@/components/charts/ChartCard";
import { LawRow } from "@/components/laws/LawsListCard";
import { MethodologyNote } from "@/components/MethodologyNote";
import { fmtInt } from "@/lib/decisions-derive";
import type { MemberLaws } from "@/lib/laws-types";

const PAGE = 120;

type RoleFilter = "all" | "sponsored" | "cosponsored";
const ROLE_FILTERS: { value: RoleFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "sponsored", label: "Sponsored" },
  { value: "cosponsored", label: "Cosponsored" },
];

/** One member's laws, fetched once on mount. */
function useMemberLaws(bioguideId: string): { laws: MemberLaws | null; failed: boolean } {
  const [state, setState] = useState<{ id: string; laws: MemberLaws | null; failed: boolean }>({ id: bioguideId, laws: null, failed: false });
  useEffect(() => {
    let live = true;
    fetch(`/data/members/${bioguideId}/laws`)
      .then((r) => (r.ok ? (r.json() as Promise<MemberLaws>) : Promise.reject(new Error(String(r.status)))))
      .then(
        (laws) => live && setState({ id: bioguideId, laws, failed: false }),
        () => live && setState({ id: bioguideId, laws: null, failed: true }),
      );
    return () => {
      live = false;
    };
  }, [bioguideId]);
  return state.id === bioguideId ? state : { laws: null, failed: false };
}

const BADGE =
  "inline-block whitespace-nowrap rounded-full border px-1.5 py-px align-baseline text-[0.66rem] font-medium";

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-raised px-3 py-2">
      <b className="block text-[1.15rem] font-medium tabular-nums">{value}</b>
      <span className="block text-[0.72rem] leading-[1.35] text-ink-muted">{label}</span>
    </div>
  );
}

/**
 * The member page's last card: every public law since 1973 the member sponsored or cosponsored, newest first, in the Laws page's
 * rows (the same `LawRow`), each tagged with the member's part in it. The rows come from `/data/members/[id]/laws`, the Laws list
 * cut down to this member. Rows are added as the box scrolls.
 */
export function MemberLawsCard({ bioguideId, name }: { bioguideId: string; name: string }) {
  const { laws, failed } = useMemberLaws(bioguideId);
  const [filter, setFilter] = useState<RoleFilter>("all");
  const [major, setMajor] = useState(false);
  const [query, setQuery] = useState("");
  const terms = useMemo(() => query.toLowerCase().split(/\s+/).filter(Boolean), [query]);

  const stats = useMemo(() => {
    let sponsored = 0;
    let majorN = 0;
    if (laws) laws.rows.forEach((r, i) => {
      if (laws.roles[i] === 1) sponsored++;
      if (r[9] === 1) majorN++;
    });
    return { sponsored, cosponsored: (laws?.rows.length ?? 0) - sponsored, major: majorN };
  }, [laws]);

  const rows = useMemo(() => {
    if (!laws) return [];
    const out: number[] = [];
    laws.rows.forEach((r, i) => {
      const sponsor = laws.roles[i] === 1;
      if ((filter === "sponsored" && !sponsor) || (filter === "cosponsored" && sponsor) || (major && r[9] !== 1)) return;
      if (terms.length > 0) {
        const hay = `${r[3]} ${r[12]} ${laws.areas[r[4]]?.name ?? "Not classified"} ${r[11]} ${r[0]}-${r[1]} pub. l. ${r[0]}–${r[1]}`.toLowerCase();
        if (!terms.every((t) => hay.includes(t))) return;
      }
      out.push(i);
    });
    return out;
  }, [laws, filter, major, terms]);

  const sig = `${filter}|${major}|${terms.join(" ")}`;
  const [shown, setShown] = useState<{ sig: string; n: number }>({ sig, n: PAGE });
  const n = shown.sig === sig ? shown.n : PAGE;
  const grow = (e: UIEvent<HTMLElement>) => {
    const el = e.currentTarget;
    if (n < rows.length && el.scrollTop + el.clientHeight > el.scrollHeight - 240) setShown({ sig, n: n + PAGE });
  };

  const total = laws?.rows.length ?? 0;
  const oldest = total ? laws!.rows[total - 1]![2].slice(0, 4) : null;
  const newest = total ? laws!.rows[0]![2].slice(0, 4) : null;
  const span = oldest === null ? "" : oldest === newest ? ` in ${oldest}` : ` from ${oldest} to ${newest}`;
  const pill = (on: boolean) =>
    `rounded-full border px-2.5 py-0.5 text-[0.75rem] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${on ? "border-ink bg-surface text-ink" : "border-line-strong bg-surface-raised text-ink-muted hover:text-ink"}`;

  return (
    <ChartCard
      tight
      title={`Laws ${name} sponsored or cosponsored`}
      action={
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, bill or area"
          aria-label={`Search ${name}'s laws by name, bill, policy area or summary`}
          className="w-full rounded-md border border-line-strong bg-surface-raised px-2.5 py-1 text-[0.82rem] text-ink placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:w-60"
        />
      }
      lede={`Every public law${span} that ${name} sponsored or cosponsored, newest first. Each law shows the part ${name} played, the policy area, and its closest recorded final-passage vote. Only bills that became law appear: most bills a member sponsors never do.`}>
      {laws && total > 0 && (
        <div className="mb-3 grid grid-cols-3 gap-2">
          <Stat value={fmtInt(stats.sponsored)} label="laws sponsored" />
          <Stat value={fmtInt(stats.cosponsored)} label="laws cosponsored" />
          <Stat value={fmtInt(stats.major)} label="major laws" />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5 text-[0.78rem] text-ink-muted" aria-live="polite">
        <span className="tabular-nums text-ink">{laws ? `${fmtInt(rows.length)} law${rows.length === 1 ? "" : "s"}` : failed ? "Laws unavailable" : "Loading laws…"}</span>
        <div role="group" aria-label={`${name}'s part in the law`} className="flex flex-wrap items-center gap-1.5">
          {ROLE_FILTERS.map((f) => (
            <button key={f.value} type="button" aria-pressed={filter === f.value} onClick={() => setFilter(f.value)} className={pill(filter === f.value)}>
              {f.label}
            </button>
          ))}
        </div>
        <button type="button" aria-pressed={major} onClick={() => setMajor(!major)} className={pill(major)}>
          Major laws
        </button>
      </div>
      <div key={sig} tabIndex={0} aria-label={`${name}'s laws, scrollable`} onScroll={grow} className="touch-scroll relative mt-2 max-h-[32rem] overflow-y-auto overscroll-contain rounded-md border border-line">
        {failed ? (
          <p className="m-0 px-4 py-8 text-center text-[0.82rem] text-ink-muted">The laws could not be loaded. Reload the page to try again.</p>
        ) : laws && total === 0 ? (
          <p className="m-0 px-4 py-8 text-center text-[0.82rem] text-ink-muted">{`No bill ${name} sponsored or cosponsored has become law since 1973.`}</p>
        ) : laws && rows.length === 0 ? (
          <p className="m-0 px-4 py-8 text-center text-[0.82rem] text-ink-muted">No laws match these filters.</p>
        ) : (
          <ol className="m-0 list-none p-0">
            {laws &&
              rows.slice(0, n).map((i) => {
                const r = laws.rows[i]!;
                const sponsor = laws.roles[i] === 1;
                return (
                  <LawRow
                    key={`${r[0]}-${r[1]}`}
                    r={r}
                    data={laws}
                    list={laws}
                    extraBadge={<span className={`${BADGE} ${sponsor ? "border-transparent bg-ink text-surface" : "border-line-strong bg-surface-raised text-ink"}`}>{sponsor ? "Sponsor" : "Cosponsor"}</span>}
                  />
                );
              })}
          </ol>
        )}
      </div>
      <MethodologyNote>
        <p>
          Public laws from the 93rd Congress (1973) on, from Congress.gov and GovInfo bill data, listed under the bill that was enacted. Cosponsors who withdrew are not counted. &ldquo;Major&rdquo; follows David Mayhew&rsquo;s list of important enactments, which stops at the 118th Congress; later laws are not yet assessed. Votes and policy areas are as on the Laws page.
        </p>
      </MethodologyNote>
    </ChartCard>
  );
}
