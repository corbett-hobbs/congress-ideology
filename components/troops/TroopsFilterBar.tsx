"use client";

import { useMemo } from "react";
import { FiscalYearPlayer } from "@/components/charts/FiscalYearPlayer";
import { CountryCombobox } from "@/components/trade/CountryCombobox";
import { MEASURES } from "@/lib/troops-types";
import type { TradeCountryRef } from "@/lib/trade-types";
import { useTroopsState } from "./TroopsState";

const SELECT =
  "min-w-0 rounded-md border border-line-strong bg-surface-raised px-[0.55rem] py-[0.42rem] text-[0.8rem] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:flex-none";
const LABEL = "font-mono text-[0.62rem] uppercase tracking-[0.08em] text-ink-faint";

/**
 * The pinned filter bar for /presidency/national-security, directly under the site navigation: President (narrows
 * the periods shown), Country (the trade page's combobox, hosts only), Branch, and the quarter slider. Phones:
 * President and Country share a row; Branch and the slider share the next.
 */
export function TroopsFilterBar() {
  const { data, president, setPresident, country, setCountry, measure, setMeasure, yi, pi, range, setYear } = useTroopsState();
  const { terms, places, periods, years } = data.payload;
  const hosts = useMemo(() => places.map((p, i) => ({ p, i })).filter((x) => x.p.cls === "host"), [places]);
  const refs = useMemo<TradeCountryRef[]>(() => hosts.map((h) => ({ code: h.p.name, name: h.p.name, firstYear: null, lastYear: null })), [hosts]);
  const indexOf = useMemo(() => new Map(hosts.map((h) => [h.p.name, h.i])), [hosts]);
  const period = periods[pi];
  const year = years[yi];
  return (
    <div className="sticky top-0 z-40 border-b border-line-strong bg-surface/95 shadow-[0_2px_6px_rgba(26,34,51,0.08)] backdrop-blur sm:shadow-none">
      <div className="mx-auto w-full max-w-[1180px] px-4 pb-2 pt-2 sm:px-6 sm:py-2.5">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 sm:flex sm:flex-wrap sm:items-center lg:flex-nowrap sm:gap-x-4 sm:gap-y-2">
          <label className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
            <span className={`${LABEL} sm:hidden lg:inline`}>President</span>
            <select aria-label="President" value={president} onChange={(e) => setPresident(e.target.value)} className={`${SELECT} h-11 w-full sm:h-auto sm:w-[9.5rem]`}>
              <option value="all">All presidents</option>
              {[...terms].reverse().map((t) => (
                <option key={t.termId} value={t.termId}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
            <span className={`${LABEL} sm:hidden lg:inline`}>Country</span>
            <CountryCombobox
              countries={refs}
              value={country >= 0 ? places[country].name : null}
              onChange={(name) => setCountry(name === null ? -1 : (indexOf.get(name) ?? -1))}
              className="w-full sm:w-[8rem]"
            />
          </div>
          <div className="col-span-2 flex items-center gap-3 sm:contents">
            <label className="flex flex-none items-center gap-0.5 sm:flex-row sm:gap-2">
              <span className={`${LABEL} hidden lg:inline`}>Branch</span>
              <select value={measure} onChange={(e) => setMeasure(Number(e.target.value))} aria-label="Branch" className={`${SELECT} h-10 w-auto max-w-[9.5rem] sm:h-auto sm:w-[9.25rem] sm:max-w-none`}>
                {MEASURES.map((m, i) => (
                  <option key={m.id} value={i}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <FiscalYearPlayer
              year={year.fy}
              range={[years[range[0]].fy, years[range[1]].fy]}
              onYear={(fy) => setYear(fy - years[0].fy)}
              valueText={`FY${year.fy}, ${period.label} table${year.partial ? ", partial year" : ""}`}
              note={year.partial ? "partial year" : undefined}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
