"use client";

import { useMemo, useState } from "react";
import { ChartCard } from "@/components/charts/ChartCard";
import { PillGroup } from "@/components/charts/PillGroup";
import { RangeReset } from "@/components/charts/RangeReset";
import { RangeSelector } from "@/components/charts/RangeSelector";
import { StackedBars, type StackBand, type StackColumn, type StackSeries } from "@/components/charts/StackedBars";
import { PageHeader } from "@/components/PageHeader";
import {
  EO_TOPICS,
  EO_TOPIC_LABELS,
  topicFill,
  type EoAdmin,
  type EoPayload,
  type EoTopic,
  type EoYear,
} from "@/lib/executive-orders-types";
import { sameRange, termYearRange, type YearRange } from "@/lib/year-range";
import { TopicPatternDefs, TopicSwatch } from "./TopicPatternDefs";
import { MethodologyNote } from "@/components/MethodologyNote";

type Mode = "count" | "share";

const MODES = [
  { value: "count", label: "Count" },
  { value: "share", label: "Share of year" },
] as const;

const SERIES: StackSeries[] = EO_TOPICS.map((t) => ({ id: t, label: EO_TOPIC_LABELS[t], fill: topicFill(t) }));

const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const lastName = (name: string) => name.split(" ").pop() ?? name;
const pct = (n: number, d: number) => `${Math.round((n / (d || 1)) * 100)}%`;

/** A date as a column index: whole years from the first column plus the fraction of that year elapsed. */
function dateIndex(iso: string, firstYear: number): number {
  const d = new Date(`${iso}T00:00:00Z`);
  const y = d.getUTCFullYear();
  const start = Date.UTC(y, 0, 1);
  const days = (Date.UTC(y + 1, 0, 1) - start) / 86_400_000;
  return y - firstYear + (d.getTime() - start) / 86_400_000 / days;
}

function termBands(admins: readonly EoAdmin[], firstYear: number, columns: number): StackBand[] {
  return admins.flatMap((a) => {
    const from = Math.max(0, dateIndex(a.start, firstYear));
    const to = a.end
      ? Math.min(columns, dateIndex(new Date(Date.parse(`${a.end}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10), firstYear))
      : columns;
    return to > from ? [{ id: a.termId, label: lastName(a.president), from, to, fill: a.party === "Democratic" ? "var(--dem)" : "var(--rep)" }] : [];
  });
}

export function ExecutiveOrdersPageClient({ data }: { data: EoPayload }) {
  const [mode, setMode] = useState<Mode>("count");
  const [topic, setTopic] = useState<EoTopic | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const first = data.years[0].year;
  const adminById = useMemo(() => new Map(data.administrations.map((a) => [a.termId, a])), [data.administrations]);
  const columns = useMemo<(StackColumn & { year: EoYear })[]>(
    () =>
      data.years.map((y) => ({
        key: String(y.year),
        label: String(y.year),
        sublabel: y.partial ? "YTD" : undefined,
        total: y.total,
        values: y.counts,
        year: y,
      })),
    [data.years],
  );
  const [range, setRange] = useState<YearRange | null>(null);
  const lastYear = data.years[data.years.length - 1].year;
  const full: YearRange = [first, lastYear];
  const [from, to] = range ?? full;
  const termRange = (a: EoAdmin) => termYearRange(Number(a.start.slice(0, 4)), a.end ? Number(a.end.slice(0, 4)) : null, first, lastYear);
  // The president dropdown and the year slider are two views of one window: a president is "selected" when the window is exactly their years.
  const president = data.administrations.find((a) => sameRange(termRange(a), [from, to]))?.termId ?? null;
  const custom = !sameRange([from, to], full) && president === null;
  const visible = useMemo(() => columns.filter((c) => c.year.year >= from && c.year.year <= to), [columns, from, to]);
  const bands = useMemo(() => termBands(data.administrations, from, visible.length), [data.administrations, from, visible.length]);
  const selectedYear = data.years.find((y) => String(y.year) === selected) ?? null;
  const last = data.years[data.years.length - 1];

  return (
    <>
      <TopicPatternDefs />
      <div className="sticky top-0 z-40 border-b border-line-strong bg-surface/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1180px] flex-col px-4 py-2.5 sm:flex-row sm:items-center sm:px-6">
          {/* Phones: President and Topic share one line (long names truncate with an ellipsis), the slider sits below. */}
          <div className="grid grid-cols-2 gap-3 sm:contents">
            <label className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
              <span className="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-ink-faint">President</span>
              <select
                value={custom ? "custom" : (president ?? "")}
                onChange={(e) => {
                  const a = data.administrations.find((x) => x.termId === e.target.value);
                  if (a) setRange(termRange(a));
                  else if (e.target.value === "") setRange(null);
                }}
                className="w-full min-w-0 truncate rounded-md border border-line-strong bg-surface-raised px-[0.55rem] py-[0.42rem] text-[0.8rem] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:w-[15rem]"
              >
                <option value="">All presidents</option>
                {custom && <option value="custom">Custom years</option>}
                {[...data.administrations].reverse().map((a) => (
                  <option key={a.termId} value={a.termId}>
                    {`${a.president}, ${a.start.slice(0, 4)}–${a.end ? a.end.slice(0, 4) : "present"}`}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-0.5 sm:ml-5 sm:flex-row sm:items-center sm:gap-2">
              <span className="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-ink-faint">Topic</span>
              <select
                value={topic ?? ""}
                onChange={(e) => setTopic((e.target.value || null) as EoTopic | null)}
                className="w-full min-w-0 truncate rounded-md border border-line-strong bg-surface-raised px-[0.55rem] py-[0.42rem] text-[0.8rem] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:w-[13rem]"
              >
                <option value="">All topics</option>
                {EO_TOPICS.map((t) => (
                  <option key={t} value={t}>
                    {EO_TOPIC_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {/* Phones: the slider (with Reset beside it) is its own line below the two dropdowns. */}
          <div className="mt-2 flex min-w-0 items-center gap-3 sm:contents">
            <RangeSelector
              min={first}
              max={lastYear}
              value={[from, to]}
              onChange={(r) => setRange(sameRange(r, full) ? null : r)}
              format={String}
              ariaLabel="Years shown"
              className="min-w-0 flex-1 sm:ml-5 sm:min-w-[240px]"
            />
            <RangeReset show={!sameRange([from, to], full)} onReset={() => setRange(null)} className="sm:ml-4" />
          </div>
        </div>
      </div>
      <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-4 pb-16 pt-7 sm:px-6">
        <PageHeader title="How Many Executive Orders Does Each President Sign?">
          <p>
            An executive order is a written directive from the president to the
            federal government, published in the Federal Register with its own
            number. This chart counts the orders signed in each calendar year
            since 1994, split by each order&apos;s primary topic. Switch to
            share of year to compare the mix of topics rather than the totals,
            and select a year to read its orders. The bands under the axis mark
            whose term each stretch of the chart falls in.
          </p>
        </PageHeader>

        <ChartCard
          title="Executive orders signed per year, by topic"
          lede={`${data.total.toLocaleString("en-US")} orders signed ${first}–${last.year}, counted in the year they were signed. ${last.year} is year to date, through ${fmtDate(data.throughDate)}.`}
          action={<PillGroup ariaLabel="Chart view" options={MODES} value={mode} onChange={setMode} />}
        >
          {/* Below `sm` the topic chips stay two rows tall and scroll sideways (see .neighbor-chip-row), so the chart isn't pushed down the page. */}
          <div
            role="group"
            aria-label="Highlight a topic"
            className="neighbor-chip-row mb-3 grid auto-cols-max grid-flow-col grid-rows-2 gap-1.5 overflow-x-auto pb-1.5 sm:flex sm:flex-wrap sm:overflow-visible sm:pb-0"
          >
            {EO_TOPICS.map((t) => {
              const on = topic === t;
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setTopic(on ? null : t)}
                  className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[0.75rem] transition-colors ${
                    on
                      ? "border-accent bg-surface-raised text-ink"
                      : topic
                        ? "border-line text-ink-faint hover:text-ink"
                        : "border-line text-ink-muted hover:border-line-strong hover:text-ink"
                  }`}
                >
                  <TopicSwatch topic={t} />
                  {EO_TOPIC_LABELS[t]}
                </button>
              );
            })}
          </div>

          <StackedBars
            columns={visible}
            series={SERIES}
            mode={mode}
            highlight={topic}
            selectedKey={selected}
            onSelect={setSelected}
            bands={bands}
            yAxisLabel={mode === "share" ? "SHARE OF YEAR’S ORDERS" : "EXECUTIVE ORDERS"}
            ariaLabel={`Stacked columns of executive orders signed per year, ${from} to ${to}, by topic. Select a column to list that year's orders.`}
            renderTooltip={(c) => <YearTooltip col={c} admins={adminById} mode={mode} throughDate={data.throughDate} />}
          />

          <p className="mb-0 mt-3 text-[0.75rem] leading-relaxed text-ink-faint">
            Terms under the axis:{" "}
            {data.administrations
              .map((a) => `${a.president} (${a.start.slice(0, 4)}–${a.end ? a.end.slice(0, 4) : "present"})`)
              .join(", ")}
            .
          </p>

          <TableFallback years={data.years} />
        </ChartCard>

        <YearList year={selectedYear} years={data.years} range={[from, to]} president={president} onClearPresident={() => setRange(null)} topic={topic} admins={adminById} onClearTopic={() => setTopic(null)} throughDate={data.throughDate} />

        <footer className="flex flex-col gap-2 border-t border-line pt-6 text-[0.76rem] leading-[1.6] text-ink-faint">
          <p className="m-0">
            Source:{" "}
            <a
              href="https://www.federalregister.gov/presidential-documents/executive-orders"
              className="text-ink-muted underline decoration-line-strong underline-offset-2 hover:decoration-accent"
            >
              Federal Register
            </a>{" "}
            (federalregister.gov API), executive orders signed {first} to present. Each order links to its
            Federal Register page.
          </p>
          <MethodologyNote className="mt-0">
          <p>
            Orders are counted in the year they were
            signed, not published. Each order has one primary topic, so a year&apos;s columns add up to its true total.
            Topic assignment is classifier-assisted: a language model read each order&apos;s title and issuing agencies,
            and orders that only amend or revoke another order take that order&apos;s topic. A random sample of 100
            assignments was checked by a person and all were confirmed, but the rest have not been individually
            reviewed, and a topic is a judgment call, so a count shows how many orders touched a
            subject, not how significant any of them were. In a transition year the orders signed before and after
            Inauguration Day count toward the outgoing and incoming president respectively.
          </p>
          </MethodologyNote>
        </footer>
      </main>
    </>
  );
}

function YearTooltip({
  col,
  admins,
  mode,
  throughDate,
}: {
  col: StackColumn & { year: EoYear };
  admins: Map<string, EoAdmin>;
  mode: Mode;
  throughDate: string;
}) {
  const y = col.year;
  return (
    <div className="flex min-w-[13rem] flex-col gap-1.5 text-[0.78rem]">
      <div>
        <div className="font-serif text-[0.95rem] font-medium">{y.year}</div>
        <div className="opacity-75">
          {y.total} executive orders{y.partial ? ` · year to date, through ${fmtDate(throughDate)}` : ""}
        </div>
      </div>
      {y.byTerm.length > 1 && (
        <div className="opacity-75">
          {y.byTerm
            .map((t) => `${lastName(admins.get(t.termId)?.president ?? "")} ${t.total}`)
            .join(" · ")}
        </div>
      )}
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {EO_TOPICS.filter((t) => y.counts[t] > 0).map((t) => (
          <li key={t} className="flex items-center gap-1.5">
            <TopicSwatch topic={t} size={10} backed />
            <span className="flex-1">{EO_TOPIC_LABELS[t]}</span>
            <span className="font-mono tabular-nums">{mode === "share" ? pct(y.counts[t], y.total) : y.counts[t]}</span>
            {mode === "share" && <span className="font-mono tabular-nums opacity-60">({y.counts[t]})</span>}
          </li>
        ))}
      </ul>
      <div className="opacity-60">Select to list these orders</div>
    </div>
  );
}

function YearList({
  year,
  years,
  range,
  president,
  onClearPresident,
  topic,
  admins,
  onClearTopic,
  throughDate,
}: {
  year: EoYear | null;
  years: readonly EoYear[];
  /** The years shown in the chart, inclusive. */
  range: readonly [number, number];
  president: string | null;
  onClearPresident: () => void;
  topic: EoTopic | null;
  admins: Map<string, EoAdmin>;
  onClearTopic: () => void;
  throughDate: string;
}) {
  if (president) {
    const a = admins.get(president);
    const scope = year ? [year] : years;
    const all = scope.flatMap((y) => y.items).filter((i) => i.termId === president);
    const items = topic ? all.filter((i) => i.topic === topic) : all;
    return (
      <section aria-live="polite" aria-label={`Executive orders signed by ${a?.president ?? "this president"}`} className="rounded-[10px] border border-line bg-surface">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-5 py-3">
          <h2 className="font-serif text-[1.05rem] font-medium">
            {a?.president}: {items.length} executive orders{year ? ` signed in ${year.year}` : ""}
          </h2>
          <button type="button" onClick={onClearPresident} className="text-[0.78rem] font-medium text-accent hover:underline">
            Show all presidents
          </button>
        </div>
        {(topic || year) && (
          <div className="border-b border-line bg-surface-raised px-5 py-2 text-[0.78rem] text-ink-muted">
            Also filtered by{year ? ` year ${year.year}` : ""}
            {topic ? `${year ? " and" : ""} topic ${EO_TOPIC_LABELS[topic]}` : ""}.
          </div>
        )}
        <OrderRows items={items} showPresident={false} admins={admins} />
      </section>
    );
  }
  if (!year && topic) {
    // A topic with no year selected: every order on that topic in the years the chart shows, newest first.
    const items = years.filter((y) => y.year >= range[0] && y.year <= range[1]).flatMap((y) => y.items).filter((i) => i.topic === topic).sort((a, b) => b.n - a.n);
    return (
      <section aria-live="polite" aria-label={`Executive orders on ${EO_TOPIC_LABELS[topic]}`} className="rounded-[10px] border border-line bg-surface">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-5 py-3">
          <h2 className="font-serif text-[1.05rem] font-medium">
            {EO_TOPIC_LABELS[topic]}: {items.length} executive orders, {range[0]}–{range[1]}
          </h2>
          <button type="button" onClick={onClearTopic} className="text-[0.78rem] font-medium text-accent hover:underline">
            Show all topics
          </button>
        </div>
        <div className="border-b border-line bg-surface-raised px-5 py-2 text-[0.78rem] text-ink-muted">Newest first. Select a year in the chart to narrow the list to that year.</div>
        <OrderRows items={items} showPresident admins={admins} />
      </section>
    );
  }
  if (!year) {
    return (
      <section aria-live="polite" className="rounded-[10px] border border-dashed border-line-strong px-5 py-6 text-[0.85rem] text-ink-muted">
        Select a year in the chart to list its executive orders.
      </section>
    );
  }
  const items = topic ? year.items.filter((i) => i.topic === topic) : year.items;
  return (
    <section aria-live="polite" aria-label={`Executive orders signed in ${year.year}`} className="rounded-[10px] border border-line bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-5 py-3">
        <h2 className="font-serif text-[1.05rem] font-medium">
          {year.year}: {year.total} executive orders
          {year.partial && <span className="text-ink-muted"> (year to date, through {fmtDate(throughDate)})</span>}
        </h2>
        <div className="text-[0.78rem] text-ink-muted">
          {year.byTerm.map((t) => `${admins.get(t.termId)?.president ?? ""}: ${t.total}`).join(" · ")}
        </div>
      </div>
      {topic && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-raised px-5 py-2 text-[0.78rem] text-ink-muted">
          Showing {items.length} of {year.total}, topic: {EO_TOPIC_LABELS[topic]}.
          <button type="button" onClick={onClearTopic} className="font-medium text-accent hover:underline">
            Show all topics
          </button>
        </div>
      )}
      <OrderRows items={items} showPresident={year.byTerm.length > 1} admins={admins} />
    </section>
  );
}

/** The chart as a plain table (collapsed), as on the wealth scatter. */
function TableFallback({ years }: { years: readonly EoYear[] }) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-[0.75rem] font-medium text-accent">View as table</summary>
      <div className="mt-2 max-h-80 overflow-auto rounded-md border border-line">
        <table className="w-full border-collapse text-[0.78rem]">
          <thead className="sticky top-0 bg-surface-raised">
            <tr>
              {["Year", "Total", ...EO_TOPICS.map((t) => EO_TOPIC_LABELS[t])].map((h) => (
                <th key={h} scope="col" className="border-b border-line px-2 py-1.5 text-left font-mono text-[0.65rem] uppercase tracking-[0.05em] text-ink-faint">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {years.map((y) => (
              <tr key={y.year} className="border-b border-line last:border-0">
                <th scope="row" className="px-2 py-1 text-left font-medium">
                  {y.year}
                  {y.partial ? " (YTD)" : ""}
                </th>
                <td className="px-2 py-1 tabular-nums">{y.total}</td>
                {EO_TOPICS.map((t) => (
                  <td key={t} className="px-2 py-1 tabular-nums">
                    {y.counts[t]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function OrderRows({ items, showPresident, admins }: { items: EoYear["items"]; showPresident: boolean; admins: Map<string, EoAdmin> }) {
  return (
    <ol className="m-0 max-h-[32rem] list-none overflow-y-auto p-0">
      {items.map((i) => (
        <li key={i.n} className="grid grid-cols-[3.9rem_1fr] gap-x-3 gap-y-1 border-b border-line px-5 py-2.5 last:border-0 sm:grid-cols-[4.4rem_1fr_auto]">
          <span className="pt-[0.1rem] font-mono text-[0.72rem] text-ink-faint">EO {i.n}</span>
          <div className="min-w-0">
            <a
              href={`https://www.federalregister.gov/d/${i.doc}`}
              className="text-[0.88rem] leading-snug text-ink hover:text-accent hover:underline"
            >
              {i.title}
              <span className="sr-only"> (Federal Register)</span>
            </a>
            <div className="mt-0.5 text-[0.72rem] text-ink-faint">
              Signed {fmtDate(i.signed)}
              {showPresident ? ` · ${admins.get(i.termId)?.president ?? ""}` : ""}
            </div>
          </div>
          <span className="col-start-2 flex items-center gap-1.5 text-[0.74rem] text-ink-muted sm:col-start-3 sm:justify-end">
            <TopicSwatch topic={i.topic} size={10} />
            {EO_TOPIC_LABELS[i.topic]}
          </span>
        </li>
      ))}
    </ol>
  );
}
