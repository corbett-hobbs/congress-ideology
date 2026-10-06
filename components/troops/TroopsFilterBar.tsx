"use client";

import { useMemo } from "react";
import { RangeReset } from "@/components/charts/RangeReset";
import { TermBand, type BandTerm } from "@/components/charts/TermBand";
import { RangeSelector } from "@/components/charts/RangeSelector";
import { CountryCombobox } from "@/components/trade/CountryCombobox";
import { MEASURES } from "@/lib/troops-types";
import type { TradeCountryRef } from "@/lib/trade-types";
import { useTroopsState } from "./TroopsState";

const SELECT =
  "min-w-0 rounded-md border border-line-strong bg-surface-raised px-[0.55rem] py-[0.42rem] text-[0.8rem] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:flex-none";
const LABEL = "font-mono text-[0.62rem] uppercase tracking-[0.08em] text-ink-faint";

/**
 * The pinned filter bar for /presidency/national-security, directly under the site navigation: Country (the trade page's
 * combobox, hosts only), Branch, and the two-handle years-shown slider with the presidential-term band under its track
 * (tap a term to select it, drag across several; there is no President dropdown). Phones: Country and Branch share a
 * row, the slider its own.
 */
export function TroopsFilterBar() {
  const { data, country, setCountry, measure, setMeasure, range, setRange } = useTroopsState();
  const { terms, places, years } = data.payload;
  const hosts = useMemo(() => places.map((p, i) => ({ p, i })).filter((x) => x.p.cls === "host"), [places]);
  const refs = useMemo<TradeCountryRef[]>(() => hosts.map((h) => ({ code: h.p.name, name: h.p.name, firstYear: null, lastYear: null })), [hosts]);
  const indexOf = useMemo(() => new Map(hosts.map((h) => [h.p.name, h.i])), [hosts]);
  const bandTerms = useMemo<BandTerm[]>(
    () => terms.filter((t) => t.to >= t.from).map((t) => ({ id: t.termId, label: t.label, last: t.last, initials: t.president.split(" ").map((w) => w[0]).join(""), party: t.party, from: t.from, to: t.to })),
    [terms],
  );
  const full = range[0] === 0 && range[1] === years.length - 1;
  return (
    <div className="sticky top-0 z-40 border-b border-line-strong bg-surface/95 shadow-[0_2px_6px_rgba(26,34,51,0.08)] backdrop-blur sm:shadow-none">
      <div className="mx-auto w-full max-w-[1180px] px-4 pb-2 pt-2 sm:px-6 sm:py-2.5">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 sm:flex sm:flex-wrap sm:items-center lg:flex-nowrap sm:gap-x-4 sm:gap-y-2">
          <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
            <span className={`${LABEL} sm:hidden lg:inline`}>Country</span>
            <CountryCombobox
              countries={refs}
              value={country >= 0 ? places[country].name : null}
              onChange={(name) => setCountry(name === null ? -1 : (indexOf.get(name) ?? -1))}
              className="w-full sm:w-[8rem]"
            />
          </div>
          <div className="flex min-w-0 items-end gap-3 sm:contents">
            <label className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-none sm:flex-row sm:items-center sm:gap-2">
              <span className={`${LABEL} sm:hidden lg:inline`}>Branch</span>
              <select value={measure} onChange={(e) => setMeasure(Number(e.target.value))} aria-label="Branch" className={`${SELECT} w-full max-w-none sm:w-[9.25rem] sm:max-w-none`}>
                {MEASURES.map((m, i) => (
                  <option key={m.id} value={i}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="col-span-2 flex min-w-0 items-center gap-3 sm:ml-auto sm:min-w-[14rem] sm:flex-1">
            <RangeSelector
              min={0}
              max={years.length - 1}
              value={range}
              onChange={setRange}
              format={(i) => String(years[i].fy)}
              ariaLabel="Years shown"
              className="min-w-0 flex-1"
              action={<RangeReset show={!full} onReset={() => setRange([0, years.length - 1])} className="mt-0.5 font-sans leading-none" />}
              below={<TermBand terms={bandTerms} min={0} max={years.length - 1} value={range} onChange={setRange} />}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
