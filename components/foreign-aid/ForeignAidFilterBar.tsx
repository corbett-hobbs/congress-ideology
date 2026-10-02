"use client";

import { CountryCombobox } from "@/components/trade/CountryCombobox";
import { SECTOR_LABEL } from "@/lib/foreign-aid-derive";
import type { TradeCountryRef } from "@/lib/trade-types";
import { useMemo } from "react";
import { FiscalYearControl } from "./FiscalYearControl";
import { useAidState } from "./ForeignAidState";

const SELECT =
  "min-w-0 rounded-md border border-line-strong bg-surface-raised px-[0.55rem] py-[0.42rem] text-[0.8rem] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:flex-none";
const LABEL = "font-mono text-[0.62rem] uppercase tracking-[0.08em] text-ink-faint";

/**
 * The pinned filter bar for /presidency/foreign-aid, directly under the site navigation: President
 * (narrows the years shown), Country (reuses the trade page's combobox), Sector, and the fiscal-year
 * slider. Every control writes the shared `AidState`. Phones: President and Country share a row,
 * Sector and the slider share the next row.
 */
export function ForeignAidFilterBar() {
  const { data, president, setPresident, country, setCountry, sector, setSector } = useAidState();
  const { terms, countries, sectors } = data.payload;
  const refs = useMemo<TradeCountryRef[]>(() => countries.map((c) => ({ code: c.name, name: c.name, firstYear: null, lastYear: null })), [countries]);
  const indexOf = useMemo(() => new Map(countries.map((c, i) => [c.name, i])), [countries]);
  return (
    <div className="sticky top-0 z-40 border-b border-line-strong bg-surface/95 shadow-[0_2px_6px_rgba(26,34,51,0.08)] backdrop-blur sm:shadow-none">
      <div className="mx-auto w-full max-w-[1180px] px-4 pb-2 pt-2 sm:px-6 sm:py-2.5">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 sm:flex sm:flex-nowrap sm:items-center sm:gap-x-4 sm:gap-y-2">
          <label className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
            <span className={LABEL}>President</span>
            <select value={president} onChange={(e) => setPresident(e.target.value)} className={`${SELECT} h-11 w-full sm:h-auto sm:w-[10.5rem]`}>
              <option value="all">All presidents</option>
              {[...terms].reverse().map((t) => (
                <option key={t.termId} value={t.termId}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
            <span className={LABEL}>Country</span>
            <CountryCombobox
              countries={refs}
              value={country >= 0 ? countries[country].name : null}
              onChange={(name) => setCountry(name === null ? -1 : (indexOf.get(name) ?? -1))}
              className="w-full sm:w-[9rem]"
            />
          </div>
          {/* Phones: Sector (content width, no label: "All sectors" says it) and the year slider share one row,
              as in the Congress explorer toolbar. From `sm` this wrapper is display:contents. */}
          <div className="col-span-2 flex items-center gap-3 sm:contents">
          <label className="flex flex-none items-center gap-0.5 sm:flex-row sm:gap-2">
            <span className={`${LABEL} hidden sm:inline`}>Sector</span>
            <select value={sector} onChange={(e) => setSector(Number(e.target.value))} aria-label="Sector" className={`${SELECT} h-10 w-auto max-w-[9rem] sm:h-auto sm:w-[10rem] sm:max-w-none`}>
              <option value={-1}>All sectors</option>
              {sectors.map((s, i) => (
                <option key={s} value={i}>
                  {SECTOR_LABEL[s as keyof typeof SECTOR_LABEL] ?? s}
                </option>
              ))}
            </select>
          </label>
          <FiscalYearControl />
          </div>
        </div>
      </div>
    </div>
  );
}
