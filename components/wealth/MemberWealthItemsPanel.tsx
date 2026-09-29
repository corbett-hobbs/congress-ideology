"use client";

import type { DisclosureLineItem } from "@/lib/entities";
import { filingYearOf, type ProfileYearStatus } from "@/lib/wealth-derive";
import { formatCompactUSD, formatOpenEndedUSD } from "@/lib/format-money";
import { sourceDocUrl, SOURCE_SYSTEM_LABEL } from "@/lib/disclosure-url";

type Item = DisclosureLineItem["items"][number];

function itemSortValue(item: Item): number {
  if (item.lo == null || item.hi == null) {
    // open-ended (lo known, hi null) sorts above every closed band;
    // unavailable (both null) sorts to the bottom.
    return item.lo != null ? item.lo + 1e15 : -Infinity;
  }
  return (item.lo + item.hi) / 2;
}

function sortItems(items: Item[]): Item[] {
  return [...items].sort((a, b) => {
    const diff = itemSortValue(b) - itemSortValue(a);
    return diff !== 0 ? diff : a.description.localeCompare(b.description);
  });
}

function itemMidpointText(item: Item): string {
  if (item.lo == null || item.hi == null) {
    return item.lo != null ? formatOpenEndedUSD(item.lo) : "Unavailable";
  }
  return formatCompactUSD((item.lo + item.hi) / 2);
}

interface BoundSum {
  lo: number | null;
  hi: number | null;
  openEnded: boolean;
  unavailable: boolean;
}

function sumBounds(items: Item[]): BoundSum {
  let lo = 0;
  let hi = 0;
  let openEnded = false;
  let unavailable = false;
  for (const it of items) {
    if (it.lo == null) {
      unavailable = true;
      continue;
    }
    lo += it.lo;
    if (it.hi == null) openEnded = true;
    else hi += it.hi;
  }
  if (unavailable) return { lo: null, hi: null, openEnded, unavailable: true };
  if (openEnded) return { lo, hi: null, openEnded: true, unavailable: false };
  return { lo, hi, openEnded: false, unavailable: false };
}

function boundText(b: BoundSum): string {
  if (b.unavailable) return "unavailable";
  if (b.openEnded) return `${formatCompactUSD(b.lo!)} or more`;
  return `${formatCompactUSD(b.lo!)} – ${formatCompactUSD(b.hi!)}`;
}

function isAmendment(filingType: string | null): boolean {
  if (!filingType) return false;
  return filingType === "A" || filingType.toLowerCase().includes("amend");
}

interface Props {
  lineItemRows: DisclosureLineItem[];
  years: ProfileYearStatus[];
  selectedYear: number;
  onSelectYear: (year: number) => void;
}

/** Right column of the profile net worth card: year dropdown, the scrollable
 *  assets/liabilities list, totals, and the source-filing note. */
export function MemberWealthItemsPanel({ lineItemRows, years, selectedYear, onSelectYear }: Props) {
  const yearOptions = lineItemRows.map((r) => r.year);
  const selectedRow = lineItemRows.find((r) => r.year === selectedYear);
  const meta = years.find((y) => y.year === selectedYear);

  if (yearOptions.length === 0) {
    // Session 5 line items didn't reconcile for any of this member's
    // filings (or none exist) — fall back to the band-count aggregate
    // rather than fabricating an item list.
    const latestUsable = [...years].reverse().find((y) => y.kind === "usable" || y.kind === "needs_review") as
      | Extract<ProfileYearStatus, { kind: "usable" | "needs_review" }>
      | undefined;
    return (
      <div>
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.08em] text-ink-faint">
          Assets &amp; liabilities
        </p>
        <p className="mt-2 text-[0.82rem] text-ink-muted">
          Item-level detail isn&rsquo;t available for this member&rsquo;s filings.
          {latestUsable && (
            <>
              {" "}
              For {latestUsable.year}: assets{" "}
              {latestUsable.assetsTotal != null ? formatCompactUSD(latestUsable.assetsTotal) : "unavailable"},
              liabilities{" "}
              {latestUsable.liabilitiesTotal != null
                ? formatCompactUSD(latestUsable.liabilitiesTotal)
                : "unavailable"}
              .
            </>
          )}
        </p>
      </div>
    );
  }

  const assets = selectedRow ? sortItems(selectedRow.items.filter((i) => i.kind === "asset")) : [];
  const liabilities = selectedRow ? sortItems(selectedRow.items.filter((i) => i.kind === "liability")) : [];
  const assetBounds = sumBounds(assets);
  const liabilityBounds = sumBounds(liabilities);

  const docUrl =
    meta && (meta.kind === "usable" || meta.kind === "needs_review") && meta.sourceDocId
      ? sourceDocUrl(meta.sourceSystem, meta.sourceDocId, meta.year)
      : null;
  const filingYear = meta && (meta.kind === "usable" || meta.kind === "needs_review") ? filingYearOf(meta.filingDate) : null;
  const amended = meta && (meta.kind === "usable" || meta.kind === "needs_review") && isAmendment(meta.filingType);
  const sourceLabel =
    meta && (meta.kind === "usable" || meta.kind === "needs_review") ? SOURCE_SYSTEM_LABEL[meta.sourceSystem] : null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.08em] text-ink-faint">
          Assets &amp; liabilities
        </p>
        <label className="flex items-center gap-1.5 text-[0.78rem] text-ink-muted">
          Year
          <select
            value={selectedYear}
            onChange={(e) => onSelectYear(Number(e.target.value))}
            className="rounded-md border border-line-strong bg-surface-raised px-2 py-1 font-mono text-[0.78rem] text-ink"
          >
            {yearOptions.map((yr) => (
              <option key={yr} value={yr}>
                {yr}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div
        role="region"
        tabIndex={0}
        aria-label={`Assets and liabilities reported for ${selectedYear}`}
        className="mt-3 max-h-[26rem] overflow-y-auto rounded-md border border-line"
      >
        <ItemSection title="Assets" items={assets} />
        <ItemSection title="Liabilities" items={liabilities} />
        {assets.length === 0 && liabilities.length === 0 && (
          <p className="p-4 text-center text-[0.8rem] text-ink-faint">No items reported for {selectedYear}.</p>
        )}
      </div>

      <div className="mt-3 space-y-1 border-t border-line pt-2.5 font-mono text-[0.78rem] text-ink-muted">
        <div className="flex justify-between gap-3">
          <span>Total assets</span>
          <span className="text-ink">{boundText(assetBounds)}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span>Total liabilities</span>
          <span className="text-ink">{boundText(liabilityBounds)}</span>
        </div>
        {meta && (meta.kind === "usable" || meta.kind === "needs_review") && (
          <div className="flex justify-between gap-3 font-semibold">
            <span>Net worth (midpoint)</span>
            <span className="text-ink">
              {meta.range.openEnded ? formatOpenEndedUSD(meta.midpoint) : formatCompactUSD(meta.midpoint)} ·{" "}
              {meta.range.unavailable
                ? "range unavailable"
                : meta.range.openEnded
                  ? `${formatCompactUSD(meta.range.lo!)} or more`
                  : `${formatCompactUSD(meta.range.lo!)} – ${formatCompactUSD(meta.range.hi!)}`}
            </span>
          </div>
        )}
      </div>

      <p className="mt-2.5 text-[0.7rem] leading-relaxed text-ink-faint">
        Values are the bands reported on the filing; midpoints are our estimate.
        {sourceLabel && (
          <>
            {" "}
            Source:{" "}
            {docUrl ? (
              <a href={docUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                {sourceLabel} {amended ? "filing" : "PDF"}
              </a>
            ) : (
              `${sourceLabel} filing`
            )}
            {filingYear != null && `, ${amended ? "amended" : "filed"} in ${filingYear}`}.
          </>
        )}
      </p>
    </div>
  );
}

function ItemSection({ title, items }: { title: string; items: Item[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="sticky top-0 z-10 border-b border-line bg-surface-raised px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.06em] text-ink-faint">
        {title} · {items.length} item{items.length === 1 ? "" : "s"}
      </p>
      {items.map((item, i) => {
        const secondary = [item.owner, item.form_type].filter(Boolean).join(" · ");
        return (
          <div key={i} className="flex items-start justify-between gap-3 border-b border-line px-3 py-2 last:border-0">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.82rem] text-ink">{item.description || "(no description)"}</p>
              {secondary && <p className="mt-0.5 text-[0.7rem] text-ink-faint">{secondary}</p>}
            </div>
            <div className="flex-none text-right">
              <div className="font-mono text-[0.82rem] font-semibold text-ink">{itemMidpointText(item)}</div>
              <div className="font-mono text-[0.66rem] text-ink-faint">{item.band_label}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
