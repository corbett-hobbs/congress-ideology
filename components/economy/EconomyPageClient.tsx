"use client";

import { useMemo, useState } from "react";
import { EconomyStateProvider, activeDay, useEconomyActions, useEconomyValues } from "./EconomyState";
import { dateOfDay, dayOf, MONTH_NAMES } from "@/lib/indicator-time";
import { PageHeader } from "@/components/PageHeader";
import { fromEconomyPayload, type EconomyPayload } from "@/lib/indicator-payload";
import { readAll } from "@/lib/indicator-lookup";
import { EconomyCard } from "./EconomyCard";
import type { EconomyData } from "@/lib/indicator-payload";
import { EconomyFilterBar } from "./EconomyFilterBar";
import { CARD_ORDER, SPECS } from "./specs";

const longDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

function Swatch({ color, border }: { color: string; border?: boolean }) {
  return <span aria-hidden className="inline-block size-3" style={{ background: color, border: border ? "1px solid var(--line)" : undefined }} />;
}

export function EconomyPageClient(props: PageProps) {
  return (
    <EconomyStateProvider>
      <EconomyPage {...props} />
    </EconomyStateProvider>
  );
}

interface PageProps {
  payload: EconomyPayload;
  fredNotice: string;
  mortgageAttribution: string;
}

/** "March 2009, Obama 44 (D)" for an axis day. */
function describeDay(data: EconomyData, day: number): string {
  const { year, month } = dateOfDay(day);
  const t = data.terms.find((x) => day >= x.s && day < x.e) ?? data.terms[data.terms.length - 1];
  return `${MONTH_NAMES[month]} ${year}, ${t.label} (${t.party})`;
}

function EconomyPage({
  payload,
  fredNotice,
  mortgageAttribution,
}: PageProps) {
  const data = useMemo(() => fromEconomyPayload(payload), [payload]);
  const values = useEconomyValues();
  const { setTerm, clearPin } = useEconomyActions();
  const term = values.term;
  const [showCong, setShowCong] = useState(false);
  const day = activeDay(values);
  // Hero and cards read the same date, from the same lookup module.
  const latest = useMemo(() => readAll(data, day), [data, day]);
  const pinned = useMemo(() => (values.pin === null ? null : readAll(data, values.pin)), [data, values.pin]);
  const status =
    day === null
      ? "Hover a chart to compare a date. Click to pin it."
      : `${describeDay(data, day)}${values.hover === null ? ", pinned" : ""}`;
  // Announced only when a date is pinned, never on every mouse move.
  const announcement =
    values.pin === null || pinned === null
      ? ""
      : `Pinned ${describeDay(data, values.pin)}. ` +
        (Object.keys(pinned) as (keyof typeof pinned)[])
          .map((k) => `${SPECS[k].title} ${pinned[k].value === null ? "no reading" : SPECS[k].head(pinned[k].value!)}`)
          .join("; ");

  const lastFy = Math.max(...Object.keys(data.def).map(Number));
  const lastIncomeYear = Math.max(...Object.keys(data.inc).map(Number));
  const firstYear = dateOfDay(0).year;
  const lastYear = dateOfDay(data.span - 1).year;
  const range = useMemo<[number, number]>(() => values.range ?? [firstYear, lastYear], [values.range, firstYear, lastYear]);
  const view = useMemo<[number, number]>(() => [dayOf(range[0], 0, 1), Math.min(data.span, dayOf(range[1] + 1, 0, 1))], [range, data.span]);
  const common = { data, showCong, term, view, range, firstYear, lastYear };

  const notes: Partial<Record<keyof typeof SPECS, string>> = {
    infl: "The October 2025 gap is real: prices weren’t collected that month, so that year-over-year figure doesn’t exist.",
    jobs: "Axis capped at ±1M a month so ordinary months stay readable; months beyond it run to the edge with a triangle, and the largest gain and loss are labeled with their true values.",
    un: "No survey was collected in October 2025, so the line has a one-month gap.",
    mort: "Freddie Mac changed how it collects the rate in November 2022, so comparisons across that line aren’t exact.",
    inc: `Published each September for the prior year, so ${lastIncomeYear + 1} isn’t available yet.`,
    def: `Fiscal years run October to September. Fiscal ${lastFy + 1} ends September 30, ${lastFy + 1} and isn’t reported yet.`,
  };
  const incomeDesc = `Median household income, adjusted for inflation to ${data.incomeUnits.match(/\d{4}/)?.[0] ?? ""} dollars. One value per year.`;

  return (
    <>
      <EconomyFilterBar
        terms={data.terms}
        term={term}
        onTerm={setTerm}
        showCong={showCong}
        onShowCong={setShowCong}
        status={status}
        canClear={values.pin !== null}
        onClear={clearPin}
      />
      <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-4 pb-16 pt-7 sm:px-6">
        <div aria-live="polite" className="sr-only">
          {announcement}
        </div>
        <PageHeader title="What Was the Economy Like?">
          <p>
            Gas, mortgage rates, jobs, prices, income and the federal budget, month by month since 1991. The colored bar
            under each chart shows who was president, and the gray columns mark recessions. These are conditions during
            each term, not a score of what any one official caused.
          </p>
        </PageHeader>

        <EconomyCard
          {...common}
          hero
          spec={SPECS.mis}
          reading={latest.mis}
          desc={SPECS.mis.desc}
          legend={
            <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-[0.75rem] text-ink-muted">
              <span className="inline-flex items-center gap-1.5"><Swatch color="var(--dem)" />Democratic</span>
              <span className="inline-flex items-center gap-1.5"><Swatch color="var(--rep)" />Republican</span>
              <span className="inline-flex items-center gap-1.5"><Swatch color="color-mix(in srgb, var(--ink) 9%, transparent)" border />Recession (NBER)</span>
            </div>
          }
        />

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {CARD_ORDER.map((k) => (
            <EconomyCard
              key={k}
              {...common}
              spec={SPECS[k]}
              reading={latest[k]}
              desc={k === "inc" ? incomeDesc : SPECS[k].desc}
              footnote={notes[k]}
              legend={
                k === "debt" ? (
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.75rem] text-ink-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <svg width="22" height="8" aria-hidden><line x1="0" x2="22" y1="4" y2="4" stroke="var(--ink)" strokeWidth="2" /></svg>
                      Held by the public
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <svg width="22" height="8" aria-hidden><line x1="0" x2="22" y1="4" y2="4" stroke="var(--ink-faint)" strokeWidth="2" strokeDasharray="4 3" /></svg>
                      Total, including debt the government owes itself
                    </span>
                  </div>
                ) : undefined
              }
            />
          ))}
        </div>

        <section className="rounded-[10px] border border-line bg-surface p-5 sm:px-6">
          <h2 className="m-0 font-serif text-[1.25rem] font-medium">About these numbers</h2>
          <p className="m-0 mt-2.5 text-[0.875rem] leading-[1.6]">
            The bands show who held office, not who controlled the number. The Federal Reserve sets short-term interest
            rates on its own, and recessions, oil prices and laws passed years earlier all move these figures. Congress
            control bands show the party holding each chamber’s majority, with the Senate’s mid-Congress changes (2001,
            2002 and 2021) shown on their dates. Values are the latest revised numbers as of {longDate(payload.fetchedAt)};
            jobs and income figures are routinely revised after first release.
          </p>
          <p className="m-0 mt-2.5 text-[0.8rem] leading-[1.6] text-ink-muted">
            Sources: U.S. Bureau of Labor Statistics, U.S. Energy Information Administration, U.S. Census Bureau, U.S.
            Office of Management and Budget and the National Bureau of Economic Research, via Federal Reserve Bank of St.
            Louis, FRED®. Mortgage rates: {mortgageAttribution}. Chamber majorities: U.S. Senate and U.S. House
            historians’ party-division tables.
          </p>
          <p className="m-0 mt-2.5 text-[0.8rem] leading-[1.6] text-ink-muted">{fredNotice}</p>
        </section>
      </main>
    </>
  );
}
