"use client";

import Link from "next/link";
import { useMemo, useState, type UIEvent } from "react";
import { ChartCard } from "@/components/charts/ChartCard";
import { Swatch } from "@/components/decisions/shared";
import { MethodologyNote } from "@/components/MethodologyNote";
import { fmtDate } from "@/components/decisions/CaseListCard";
import { fmtInt } from "@/lib/decisions-derive";
import { ALL_GROUPS, SUPPORT_COLORS, SUPPORT_LABELS, SUPPORT_ORDER, SUPPORT_SHORT, filterLabel, filterLaws, matchLaws, tallyText } from "@/lib/laws-derive";
import type { LawListRow, LawsList, LawsPayload } from "@/lib/laws-types";
import { ordinal } from "@/lib/demographics-chart";
import { useLawsActions, useLawsValues } from "./LawsState";
import { useLawsList } from "./useLawsList";

const PAGE = 120;

/** The id of the wrapper around `LawsListCard`; the jump link scrolls to it. */
export const LAW_LIST_ID = "law-list";

const BADGE =
  "inline-block whitespace-nowrap rounded-full border border-line-strong bg-surface-raised px-1.5 py-px align-baseline text-[0.66rem] font-medium text-ink-muted";
const PARTY_DOT = { D: "var(--dem)", R: "var(--rep)", I: "var(--demrep)" } as const;

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

/** The laws the page-level filters keep, and the count the list and the jump link both show. */
export function useFilteredLaws(): { list: LawsList | null; failed: boolean; rows: LawListRow[] } {
  const { data, window: win, group, major, band, pin } = useLawsValues();
  const { list, failed } = useLawsList(data.listVersion);
  const rows = useMemo(() => (list ? filterLaws(data, list.rows, { window: win, congress: pin, group, major, band }) : []), [data, list, win, pin, group, major, band]);
  return { list, failed, rows };
}

/**
 * Card 4: every public law that matches the page's filters, newest first, in a fixed-height scrolling box (the Decisions case
 * list pattern). It follows the pinned bar (years, policy area, major laws), card 1's legend (policy area), card 2's band and a
 * pinned Congress; each active filter is a chip that clears itself, and the support-band pills are card 2's own filter. Search
 * matches name, bill, sponsor, policy area and summary: every word must. Rows are added as the box is scrolled.
 */
export function LawsListCard() {
  const { data, group, major, band, pin, window: win, range } = useLawsValues();
  const { setGroup, setMajor, setBand, clearPin } = useLawsActions();
  const { list, failed, rows } = useFilteredLaws();
  const [query, setQuery] = useState("");
  const matched = useMemo(() => (list ? matchLaws(data, list, rows, query) : []), [data, list, rows, query]);
  const sig = `${win[0]}-${win[1]}|${group}|${major}|${band}|${pin}|${query.trim().toLowerCase()}`;
  const [shown, setShown] = useState<{ sig: string; n: number }>({ sig, n: PAGE });
  const n = shown.sig === sig ? shown.n : PAGE;
  const grow = (e: UIEvent<HTMLElement>) => {
    const el = e.currentTarget;
    if (n < matched.length && el.scrollTop + el.clientHeight > el.scrollHeight - 240) setShown({ sig, n: n + PAGE });
  };
  const years = range[0] === range[1] ? `${range[0]}` : `${range[0]}–${range[1]}`;
  const queryOn = query.trim() !== "";
  const anyFilter = group !== ALL_GROUPS || band !== null || pin !== null || major || queryOn;

  return (
    <ChartCard
      tight
      title="Every law"
      action={
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, bill, sponsor or area"
          aria-label="Search laws by name, bill, sponsor, policy area or summary"
          className="w-full rounded-md border border-line-strong bg-surface-raised px-2.5 py-1 text-[0.82rem] text-ink placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:w-64"
        />
      }
      lede={`${major ? "Major laws" : "Public laws"} enacted ${pin !== null ? `by the ${ordinal(pin)} Congress` : `in ${years}`}, newest first. The list follows the filters above and the charts: pick a policy area, a vote or a Congress to narrow it. Each law shows its closest recorded final-passage vote; a law passed by voice vote or unanimous consent in both chambers shows as a voice vote.`}
    >
      <div className="flex flex-wrap items-center gap-1.5 text-[0.78rem] text-ink-muted" aria-live="polite">
        <span className="tabular-nums text-ink">{list ? `${fmtInt(matched.length)} law${matched.length === 1 ? "" : "s"}` : failed ? "Laws unavailable" : "Loading laws…"}</span>
        <div role="group" aria-label="Support" className="flex flex-wrap items-center gap-1.5">
          {[null, ...SUPPORT_ORDER].map((b) => {
            const on = band === b;
            return (
              <button
                key={b ?? "all"}
                type="button"
                aria-pressed={on}
                onClick={() => setBand(b)}
                title={b === null ? undefined : SUPPORT_LABELS[b]}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.75rem] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${on ? "border-ink bg-surface text-ink" : "border-line-strong bg-surface-raised text-ink-muted hover:text-ink"}`}
              >
                {b !== null && <Swatch color={SUPPORT_COLORS[b]!} />}
                {b === null ? "Any vote" : SUPPORT_SHORT[b]}
              </button>
            );
          })}
        </div>
        {major && (
          <Chip onClear={() => setMajor(false)} label="Clear the major laws filter">
            Major laws
          </Chip>
        )}
        {group !== ALL_GROUPS && (
          <Chip onClear={() => setGroup(ALL_GROUPS)} label="Clear the policy area filter">
            {filterLabel(data, group)}
          </Chip>
        )}
        {pin !== null && (
          <Chip onClear={clearPin} label="Clear the pinned Congress">
            {`${ordinal(pin)} Congress`}
          </Chip>
        )}
        {queryOn && (
          <Chip onClear={() => setQuery("")} label="Clear the search">
            {`“${query.trim()}”`}
          </Chip>
        )}
        {!anyFilter && <span>All policy areas, any vote.</span>}
      </div>
      <div key={sig} tabIndex={0} aria-label="Laws, scrollable" onScroll={grow} className="touch-scroll relative mt-2 max-h-[32rem] overflow-y-auto overscroll-contain rounded-md border border-line">
        {failed ? (
          <p className="m-0 px-4 py-8 text-center text-[0.82rem] text-ink-muted">The list of laws could not be loaded. Reload the page to try again.</p>
        ) : matched.length === 0 && list ? (
          <p className="m-0 px-4 py-8 text-center text-[0.82rem] text-ink-muted">No laws match these filters.</p>
        ) : (
          <ol className="m-0 list-none p-0">
            {list && matched.slice(0, n).map((r) => <LawRow key={`${r[0]}-${r[1]}`} r={r} data={data} list={list} />)}
          </ol>
        )}
      </div>
      <MethodologyNote>
        <p>
          The date is when the president signed the law (or the veto was overridden). Laws after the {ordinal(data.majorThrough)} Congress read &ldquo;Not yet assessed&rdquo;, not &ldquo;not major&rdquo;. The sentence under a law is the first sentence of the Congressional Research Service summary, kept only where it stands alone, so many of the oldest and newest laws have none. The swatch is the closest recorded final-passage vote, with each chamber&rsquo;s tally beside it. A sponsor links to their page only for members of the current Congress.
        </p>
      </MethodologyNote>
    </ChartCard>
  );
}

const BILL_SLUG: Record<string, string> = { "H.R.": "house-bill", "S.": "senate-bill", "H.J.Res.": "house-joint-resolution", "S.J.Res.": "senate-joint-resolution" };

/** The law's bill page on Congress.gov, or null if the bill label isn't one we can map. */
export function congressGovUrl(r: LawListRow): string | null {
  const m = /^(\S+) (\d+)$/.exec(r[12]);
  const slug = m && BILL_SLUG[m[1]!];
  return slug ? `https://www.congress.gov/bill/${ordinal(r[0])}-congress/${slug}/${m[2]}` : null;
}

/** "Pub. L. 118-90". */
export const pubLaw = (r: LawListRow): string => `Pub. L. ${r[0]}–${r[1]}`;

/**
 * One law. Phones: the title on its own line; under it the date and Pub. L. number on the left with the vote swatch on the
 * right; then the sponsor line, the policy area and the badges. From `sm`: date, title (badges inline), policy area and vote in
 * four columns, with the bill and sponsor line and the CRS sentence under the title.
 */
export function LawRow({ r, data, list }: { r: LawListRow; data: LawsPayload; list: LawsList }) {
  const area = data.areas[r[4]]!;
  const areaLabel = area.name ?? "Not classified";
  const sponsor = r[8] >= 0 ? list.sponsors[r[8]]! : null;
  const signer = list.signers[r[13]]!;
  const votes = r[5] === 0 && r[6][0] === 3 && r[7][0] === 3 ? "No method stated in either chamber" : `${tallyText("House", r[6])}, ${tallyText("Senate", r[7])}`;
  const badges = (
    <>
      {r[9] === 1 && (
        <span className={BADGE} title="One of David Mayhew’s important enactments">
          Major law
        </span>
      )}
      {r[10] === 1 && (
        <span className={BADGE} title={r[14] ? `Passed over a veto. Override votes: House ${r[14][0] ?? "?"}–${r[14][1] ?? "?"}, Senate ${r[14][2] ?? "?"}–${r[14][3] ?? "?"}` : "Passed over a veto"}>
          Veto override
        </span>
      )}
    </>
  );
  const hasBadge = r[9] === 1 || r[10] === 1;
  const href = congressGovUrl(r);
  const title = href ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title="View on Congress.gov"
      className="text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      {r[3]}
    </a>
  ) : (
    r[3]
  );
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-b border-line px-3 py-2.5 text-[0.82rem] last:border-b-0 sm:grid-cols-[6.5rem_minmax(0,1fr)_9.5rem_9rem] sm:items-baseline sm:gap-y-0.5 sm:py-2">
      <span className="col-span-2 min-w-0 break-words sm:col-span-1 sm:col-start-2 sm:row-start-1">
        {title}
        {hasBadge && <span className="ml-2 inline-flex flex-wrap gap-1 max-sm:hidden">{badges}</span>}
        <span className="ml-2 whitespace-nowrap text-[0.75rem] tabular-nums text-ink-faint max-sm:hidden">{pubLaw(r)}</span>
      </span>
      <span className="col-start-1 row-start-2 text-[0.75rem] tabular-nums text-ink-muted sm:col-start-1 sm:row-start-1">
        {fmtDate(r[2])}
        <span className="text-ink-faint sm:hidden">{` · ${pubLaw(r)}`}</span>
      </span>
      <span className="col-start-1 row-start-3 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[0.75rem] text-ink-muted sm:col-start-3 sm:row-start-1 sm:block sm:truncate" title={areaLabel}>
        {areaLabel}
        {hasBadge && <span className="inline-flex flex-wrap gap-1 sm:hidden">{badges}</span>}
      </span>
      <span className="col-start-2 row-span-2 row-start-2 inline-flex items-center justify-end gap-1.5 self-center whitespace-nowrap text-[0.85rem] tabular-nums sm:col-start-4 sm:row-span-1 sm:row-start-1 sm:self-baseline sm:text-[0.78rem]" title={`${SUPPORT_LABELS[r[5]]}. ${votes}`}>
        <Swatch color={SUPPORT_COLORS[r[5]]!} />
        <span className="font-medium">{SUPPORT_SHORT[r[5]]}</span>
        <span className="sr-only">{`. ${votes}`}</span>
      </span>
      <p className="col-span-2 m-0 text-[0.75rem] leading-[1.45] text-ink-muted sm:col-start-2 sm:row-start-2 sm:col-span-3">
        {r[12]}
        {sponsor ? (
          <>
            {" · sponsored by "}
            {sponsor[3] ? (
              <Link href={sponsor[3]} className="text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink">
                {sponsor[0]}
              </Link>
            ) : (
              <span className="text-ink">{sponsor[0]}</span>
            )}
            {` (${sponsor[1]})`}
          </>
        ) : null}
        {" · signed by "}
        <span className="inline-flex items-center gap-1 whitespace-nowrap text-ink">
          <i aria-hidden className="inline-block h-2 w-2 flex-none rounded-full" style={{ background: PARTY_DOT[signer[1]] }} />
          {signer[0]}
        </span>
        <span className="text-ink-faint">{` (${signer[1]})`}</span>
        {` · ${votes}`}
      </p>
      {r[11] && <p className="col-span-2 m-0 text-[0.76rem] leading-[1.45] text-ink-muted sm:col-start-2 sm:row-start-3 sm:col-span-3">{r[11]}</p>}
    </li>
  );
}
