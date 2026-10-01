"use client";

import { RangeSelector } from "@/components/charts/RangeSelector";
import type { EconomyTerm } from "@/lib/economy-presidents";
import type { TradeCountryRef } from "@/lib/trade-types";
import { sameRange, termYearRange, type YearRange } from "@/lib/year-range";

const SELECT =
  "min-w-0 flex-1 rounded-md border border-line-strong bg-surface-raised px-[0.55rem] py-[0.42rem] text-[0.8rem] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:flex-none";
const LABEL = "font-mono text-[0.62rem] uppercase tracking-[0.08em] text-ink-faint";

/**
 * The pinned filter bar for /presidency/trade, same shell as the Economy, Congress
 * and Court bars: a President dropdown and Years-shown slider that are two views of
 * one year window, a Country dropdown, a Congress-control checkbox, and a play
 * button with the year slider. Every control writes the shared `TradeState`.
 */
export function TradeFilterBar({
  terms,
  countries,
  country,
  onCountry,
  range,
  firstYear,
  lastYear,
  onRange,
  showCong,
  onShowCong,
  year,
  playing,
  onYear,
  onTogglePlay,
  status,
  canClear,
  onClear,
}: {
  terms: readonly EconomyTerm[];
  countries: readonly TradeCountryRef[];
  country: string | null;
  onCountry: (code: string | null) => void;
  range: YearRange;
  firstYear: number;
  lastYear: number;
  onRange: (r: YearRange | null) => void;
  showCong: boolean;
  onShowCong: (on: boolean) => void;
  year: number;
  playing: boolean;
  onYear: (y: number) => void;
  onTogglePlay: () => void;
  status: string;
  canClear: boolean;
  onClear: () => void;
}) {
  const order = terms.map((_, i) => i).reverse(); // newest first
  const full: YearRange = [firstYear, lastYear];
  const isFull = sameRange(range, full);
  const termIdx = terms.findIndex((t) => sameRange(termYearRange(t.startYear, t.endYear, firstYear, lastYear), range));
  const presidentValue = isFull ? "" : termIdx >= 0 ? String(termIdx) : "custom";
  return (
    <div className="sticky top-0 z-40 border-b border-line-strong bg-surface/95 backdrop-blur">
      <div className="mx-auto w-full max-w-[1180px] px-4 py-2.5 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 sm:gap-x-5">
          <label className="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none sm:gap-2">
            <span className={LABEL}>President</span>
            <select
              value={presidentValue}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "custom") return;
                if (v === "") return onRange(null);
                const t = terms[Number(v)];
                onRange(termYearRange(t.startYear, t.endYear, firstYear, lastYear));
              }}
              className={`${SELECT} sm:w-[14rem]`}
            >
              <option value="">All presidents</option>
              {presidentValue === "custom" && <option value="custom">Custom years</option>}
              {order.map((i) => {
                const t = terms[i];
                return (
                  <option key={t.termId} value={i}>
                    {`${t.full}, ${t.startYear}–${t.endYear ?? "present"}`}
                  </option>
                );
              })}
            </select>
          </label>
          <label className="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none sm:gap-2">
            <span className={LABEL}>Country</span>
            <select value={country ?? ""} onChange={(e) => onCountry(e.target.value || null)} className={`${SELECT} sm:w-[12rem]`}>
              <option value="">All countries</option>
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-none cursor-pointer items-center gap-2 rounded-md border border-line-strong bg-surface-raised px-[0.65rem] py-[0.42rem] text-[0.8rem] text-ink">
            <input
              type="checkbox"
              checked={showCong}
              onChange={(e) => onShowCong(e.target.checked)}
              className="m-0 accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            />
            Congress control
          </label>
          <div className="order-last flex w-full min-w-0 items-center gap-2.5 sm:order-none sm:w-auto sm:min-w-[260px] sm:flex-1">
            <button
              type="button"
              onClick={onTogglePlay}
              aria-pressed={playing}
              aria-label={playing ? "Pause" : "Play through the years"}
              className="flex size-8 flex-none items-center justify-center rounded-full border border-line-strong bg-surface-raised text-[0.7rem] text-ink transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {playing ? "❚❚" : "▶"}
            </button>
            <input
              type="range"
              min={firstYear}
              max={lastYear}
              step={1}
              value={year}
              aria-label="Year"
              onChange={(e) => onYear(+e.target.value)}
              className="h-6 min-w-0 flex-1 cursor-pointer accent-[var(--accent)]"
            />
            <span className="flex-none font-mono text-[0.95rem] font-semibold tabular-nums text-ink">{year}</span>
          </div>
        </div>
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          <RangeSelector
            min={firstYear}
            max={lastYear}
            value={range}
            onChange={(r) => onRange(sameRange(r, full) ? null : r)}
            format={String}
            ariaLabel="Years shown"
            className="w-full sm:w-auto sm:min-w-[260px] sm:max-w-[420px] sm:flex-1"
          />
          <div className="flex min-w-0 items-center gap-2.5 sm:ml-auto">
            <span className="text-[0.8rem] leading-snug text-ink">{status}</span>
            {canClear && (
              <button
                type="button"
                onClick={onClear}
                className="flex-none rounded-md border border-line-strong bg-surface px-[0.65rem] py-[0.42rem] text-[0.8rem] text-ink transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                Clear date
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
