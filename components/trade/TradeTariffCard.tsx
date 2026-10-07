"use client";

import { LegendToggle, useIsolate } from "@/components/charts/LegendToggle";
import { TABLE_TOGGLE } from "@/components/charts/table-toggle";
import { memo, useMemo } from "react";
import { MONTH_ABBR } from "@/lib/indicator-time";
import { fmtDollars, fmtPercent, monthStartDay, rateReadingAtDay, rateScale, ratePercentSeries, termAtDay, termLabel } from "@/lib/trade-chart";
import { MobileReadout } from "./MobileReadout";
import type { Monthly, TariffFlag } from "@/lib/trade-types";
import type { Era } from "./EraLayers";
import { AUTHORITY_LABEL, TradeTariffChart } from "./TradeTariffChart";
import { activeDay, useTradeValues } from "./TradeState";
import { MethodologyNote } from "@/components/MethodologyNote";

const dateText = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTH_ABBR[m - 1]} ${d}, ${y}`;
};
const STATUS: Record<string, string> = {
  in_effect: "In effect",
  in_effect_under_challenge: "In effect, under challenge",
  superseded: "Superseded",
  terminated: "Terminated",
  decided: "Decided",
  stayed: "Stayed",
};

const Swatch = ({ color, border }: { color: string; border?: boolean }) => (
  <span aria-hidden className="inline-block size-3" style={{ background: color, border: border ? "1px solid var(--line)" : undefined }} />
);

/** `<details>` fallback for the flags: every curated action with its authority and status. */
const EventsTable = memo(function EventsTable({ flags, lastReviewed }: { flags: readonly TariffFlag[]; lastReviewed: string }) {
  return (
    <details className="mt-3">
      <summary className={TABLE_TOGGLE}>View as table</summary>
      <p className="m-0 mt-1.5 text-[0.75rem] text-ink-muted">Effective date, action, authority, status and description, for screen readers and copying. Last reviewed {dateText(lastReviewed)}.</p>
      <div className="mt-2 max-h-72 overflow-auto">
        <table className="w-full border-collapse text-left text-[0.75rem]">
          <caption className="sr-only">Tariff actions and court rulings marked on the chart</caption>
          <thead className="sticky top-0 bg-surface-raised">
            <tr className="font-mono text-[0.65rem] uppercase tracking-[0.05em] text-ink-muted">
              <th scope="col" className="px-2 py-1.5">Effective</th>
              <th scope="col" className="px-2 py-1.5">Action</th>
              <th scope="col" className="px-2 py-1.5">Authority</th>
              <th scope="col" className="px-2 py-1.5">Status</th>
              <th scope="col" className="px-2 py-1.5">Description</th>
            </tr>
          </thead>
          <tbody>
            {flags.map((f) => (
              <tr key={f.id} className="border-t border-line align-top">
                <th scope="row" className="whitespace-nowrap px-2 py-1 font-normal tabular-nums">{dateText(f.date)}</th>
                <td className="px-2 py-1">{f.label}</td>
                <td className="px-2 py-1">{AUTHORITY_LABEL[f.authority] ?? f.authority}</td>
                <td className="px-2 py-1">{STATUS[f.status] ?? f.status}</td>
                <td className="px-2 py-1">{f.description}{f.statusNote ? ` ${f.statusNote}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
});

/**
 * Chart 2: calculated duties as a share of imports, monthly, on the same axis as the
 * balance chart so the linked crosshair lines up. Event flags come from the curated
 * tariff timeline. `series` is null while a country's file loads.
 */
export function TradeTariffCard({
  national,
  country,
  countryName,
  era,
  view,
  flags,
  lastReviewed,
  loading,
  error,
}: {
  national: { duties: Monthly; imports: Monthly };
  country: { duties: Monthly; imports: Monthly } | null;
  countryName: string | null;
  era: Era;
  view: readonly [number, number];
  flags: readonly TariffFlag[];
  lastReviewed: string;
  loading: boolean;
  error: boolean;
}) {
  const v = useTradeValues();
  const { showCong } = v;
  const shown = countryName ? country : national;
  const main = useMemo(() => (shown ? ratePercentSeries(shown.duties, shown.imports) : null), [shown]);
  const reference = useMemo(() => (countryName ? ratePercentSeries(national.duties, national.imports) : null), [countryName, national]);
  const [picked, isolate] = useIsolate<"main" | "reference">();
  const only = reference ? picked : null; // a leftover pick means nothing once the comparison line is gone
  const scale = useMemo(() => rateScale(...(main ? [main] : []), ...(reference ? [reference] : [])), [main, reference]);
  const day = activeDay(v);
  const lastIdx = main ? main.map((x) => x !== null).lastIndexOf(true) : -1;
  const rd = shown ? rateReadingAtDay(shown.duties, shown.imports, day ?? (lastIdx >= 0 ? monthStartDay(lastIdx) : -1)) : null;
  const pres = rd ? termAtDay(era.terms, monthStartDay(rd.month)) : undefined;
  const mobileLine = rd ? { values: [`Duty rate ${rd.rate === null ? "\u2014" : fmtPercent(rd.rate)}`, ...(rd.duties !== null ? [`Duties ${fmtDollars(rd.duties)}`] : [])], date: rd.label, term: pres ? termLabel(pres) : undefined } : null;
  const title = countryName ? `Tariffs on imports from ${countryName}` : "Tariffs on imports";
  const aria = `${title}: calculated duties as a share of imports, monthly from 1993, with ${flags.length} tariff actions and court rulings marked, presidential terms and recessions. The same data is in the table below.`;

  return (
    <section className="min-w-0 rounded-[10px] border border-line bg-surface p-5 sm:p-6">
      <h2 className="m-0 font-serif text-[1.6rem] font-medium leading-tight">{title}</h2>
      <p className="m-0 mt-2 text-[0.875rem] leading-[1.5] text-ink-muted">
        Calculated duties as a share of the value of imports, from January 1993, on the same timeline as the trade balance.
        Tariff actions and court rulings are marked where they took effect.
      </p>

      {main && shown && <MobileReadout line={mobileLine} />}
      <div className="mt-3.5">
        {main && shown ? (
          <TradeTariffChart
            main={main}
            duties={shown.duties}
            imports={shown.imports}
            reference={reference}
            only={only}
            scale={scale}
            era={era}
            flags={flags}
            showCong={showCong}
            view={view}
            ariaLabel={aria}
            legend={
        <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-[0.75rem] text-ink-muted">
          {reference ? (
            <LegendToggle active={only === "main"} dimmed={only === "reference"} onClick={() => isolate("main")}><svg width="22" height="8" aria-hidden><line x1="0" x2="22" y1="4" y2="4" stroke="var(--ink)" strokeWidth="2" /></svg>{countryName ? `${countryName}` : "All countries"}, calculated duties ÷ imports</LegendToggle>
          ) : (
            <span className="inline-flex items-center gap-1.5"><svg width="22" height="8" aria-hidden><line x1="0" x2="22" y1="4" y2="4" stroke="var(--ink)" strokeWidth="2" /></svg>{countryName ? `${countryName}` : "All countries"}, calculated duties ÷ imports</span>
          )}
          {reference && <LegendToggle active={only === "reference"} dimmed={only === "main"} onClick={() => isolate("reference")}><svg width="22" height="8" aria-hidden><line x1="0" x2="22" y1="4" y2="4" stroke="var(--ink-faint)" strokeWidth="1.75" /></svg>All countries, for reference</LegendToggle>}
          <span className="inline-flex items-center gap-1.5"><svg width="22" height="10" aria-hidden><line x1="11" x2="11" y1="0" y2="10" stroke="var(--accent)" strokeWidth="1.4" /><circle cx="11" cy="3" r="2.8" fill="var(--accent)" /></svg>Tariff action (solid: major; dashed: other)</span>
          <span className="inline-flex items-center gap-1.5"><Swatch color="color-mix(in srgb, var(--ink) 9%, transparent)" border />Recession (NBER)</span>
        </div>
            }
          />
        ) : (
          <div role="status" className="flex h-[260px] items-center justify-center rounded-md border border-dashed border-line text-[0.85rem] text-ink-muted">
            {error ? `Couldn’t load ${countryName ?? "that country"}. Pick it again to retry.` : loading ? `Loading ${countryName ?? "country"}…` : ""}
          </div>
        )}
      </div>

      <MethodologyNote><p>
          The line is calculated duties divided by imports for consumption, both from Census import data: from the Census Bureau from January 2010, and from the U.S. International Trade Commission’s
        DataWeb for 1993 to 2009, which serves the same Census entries (the two sources match exactly over 2010 to 2012). Calculated duties are computed from import entries, not taken from Treasury’s receipts, so don’t read them as tariff revenue.
        The line can fall without any tariff being cut if importers shift to other countries or products, and exemptions and timing also move it. Not seasonally adjusted. Census data runs about two months behind,
        so the latest events may sit at the edge of the line; actions dated after the last month of data are pinned to the right edge. Dates are when each action took effect. Legal status is as of the last review, {dateText(lastReviewed)}.
        </p></MethodologyNote>
      <EventsTable flags={flags} lastReviewed={lastReviewed} />
    </section>
  );
}
