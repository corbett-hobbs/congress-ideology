"use client";

import type { BillFilter } from "@/lib/committee-bills-derive";
import { monthLabel } from "@/lib/committee-bills-derive";
import { STAGES } from "@/lib/committee-bills-derive";
import type { CommitteeBillsPayload } from "@/lib/committee-bills-types";
import { FOCUS_RING } from "./shared";

const FIELD = `h-[1.85rem] rounded-md border border-line-strong bg-surface-raised px-2.5 text-[0.8rem] text-ink ${FOCUS_RING}`;
const LABEL = "font-mono text-[0.6rem] uppercase tracking-[0.06em] text-ink-faint";

function Chip({ children, onClear, label }: { children: string; onClear: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClear}
      aria-label={label}
      className={`inline-flex items-center gap-1 rounded-full border border-line-strong bg-surface-raised px-2 py-0.5 text-[0.75rem] text-ink hover:bg-surface ${FOCUS_RING}`}
    >
      {children}
      <span aria-hidden className="text-ink-muted">
        ×
      </span>
    </button>
  );
}

/** Search, sponsor party, policy area, subcommittee and the bipartisan checkbox; the active filters of every kind show as chips that clear themselves. */
export function LegislationFilters({
  payload,
  filter,
  onChange,
}: {
  payload: Pick<CommitteeBillsPayload, "areas" | "subs">;
  filter: BillFilter;
  onChange: (patch: Partial<BillFilter>) => void;
}) {
  const chips: { key: string; text: string; clear: Partial<BillFilter>; label: string }[] = [];
  if (filter.stage) chips.push({ key: "stage", text: `${filter.stage.mode === "stop" ? "Stopped at" : "Reached"}: ${STAGES[filter.stage.k - 1]!.label}`, clear: { stage: null }, label: "Clear the step filter" });
  if (filter.month) chips.push({ key: "month", text: `Referred ${monthLabel(filter.month)}`, clear: { month: null }, label: "Clear the month" });
  if (filter.party) chips.push({ key: "party", text: filter.party === "R" ? "Republican sponsor" : "Democratic sponsor", clear: { party: "" }, label: "Clear the sponsor party" });
  if (filter.bipartisan) chips.push({ key: "bip", text: "Both parties cosponsor", clear: { bipartisan: false }, label: "Clear the bipartisan filter" });
  if (filter.area !== null) chips.push({ key: "area", text: payload.areas[filter.area] ?? "", clear: { area: null }, label: "Clear the policy area" });
  if (filter.sub !== null) chips.push({ key: "sub", text: payload.subs[filter.sub]?.name ?? "", clear: { sub: null }, label: "Clear the subcommittee" });
  if (filter.query.trim()) chips.push({ key: "q", text: `“${filter.query.trim()}”`, clear: { query: "" }, label: "Clear the search" });

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-end gap-x-2.5 gap-y-2">
        <label className="flex min-w-0 flex-[1_1_100%] flex-col gap-0.5 sm:flex-[0_1_15rem]">
          <span className={LABEL}>Search</span>
          <input type="search" value={filter.query} onChange={(e) => onChange({ query: e.target.value })} placeholder="Title, bill number, sponsor" aria-label="Search bills by title, bill number, sponsor, policy area or law number" className={`${FIELD} placeholder:text-ink-faint`} />
        </label>
        <label className="flex min-w-0 flex-[1_1_40%] flex-col gap-0.5 sm:flex-none">
          <span className={LABEL}>Sponsor party</span>
          <select value={filter.party} onChange={(e) => onChange({ party: e.target.value as BillFilter["party"] })} className={`${FIELD} sm:w-[8rem]`}>
            <option value="">Any</option>
            <option value="R">Republican</option>
            <option value="D">Democratic</option>
          </select>
        </label>
        <label className="flex min-w-0 flex-[1_1_40%] flex-col gap-0.5 sm:flex-none">
          <span className={LABEL}>Policy area</span>
          <select value={filter.area ?? ""} onChange={(e) => onChange({ area: e.target.value === "" ? null : Number(e.target.value) })} className={`${FIELD} sm:w-[11rem]`}>
            <option value="">All areas</option>
            {payload.areas.map((a, i) => ({ a, i })).sort((x, y) => x.a.localeCompare(y.a)).map(({ a, i }) => (
              <option key={a} value={i}>
                {a}
              </option>
            ))}
          </select>
        </label>
        {payload.subs.length > 0 && (
          <label className="flex min-w-0 flex-[1_1_40%] flex-col gap-0.5 sm:flex-none">
            <span className={LABEL}>Subcommittee</span>
            <select value={filter.sub ?? ""} onChange={(e) => onChange({ sub: e.target.value === "" ? null : Number(e.target.value) })} className={`${FIELD} sm:w-[12rem]`}>
              <option value="">All</option>
              {payload.subs.map((s, i) => ({ s, i })).sort((x, y) => x.s.name.localeCompare(y.s.name)).map(({ s, i }) => (
                <option key={s.id} value={i}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="inline-flex h-[1.85rem] items-center gap-1.5 whitespace-nowrap text-[0.78rem] text-ink-muted">
          <input type="checkbox" checked={filter.bipartisan} onChange={(e) => onChange({ bipartisan: e.target.checked })} />
          Cosponsors from both parties
        </label>
      </div>
      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <Chip key={c.key} label={c.label} onClear={() => onChange(c.clear)}>
              {c.text}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}
