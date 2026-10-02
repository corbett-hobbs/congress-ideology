"use client";

import { TABLE_TOGGLE } from "@/components/charts/table-toggle";
import { useMemo, useState } from "react";
import { ChartCard } from "@/components/charts/ChartCard";
import { ReversibleSortToggle } from "@/components/charts/SortToggle";
import { StackedRows, type StackedRowData } from "@/components/charts/StackedRows";
import {
  coverageLabel,
  formatChange,
  rankYear,
  sortRanked,
  type RemovalsSortKey,
} from "@/lib/removals-country-derive";
import type { RemovalsCountryPayload } from "@/lib/removals-country-types";
import { InfoMarker } from "./InfoMarker";
import { MethodologyNote } from "@/components/MethodologyNote";

const n = (v: number) => v.toLocaleString("en-US");
const dateLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

/**
 * "Who gets removed": ICE removals by country of citizenship for one fiscal year, as a ranked list of
 * single-color bars on one scale (the foreign-aid "Who receives the most" pattern: `StackedRows`,
 * `ReversibleSortToggle`, change vs. the prior year). There is no year control in the card: the page's pinned
 * fiscal-year slider (or a click on a timeline bar) picks the year, and a year with no country table says so.
 * The President filter never trims the list of countries. Clicking a country highlights it and dims the rest.
 */
export function RemovalsCountryCard({
  payload,
  fy,
}: {
  payload: RemovalsCountryPayload;
  /** The fiscal year the page slider is on. */
  fy: number;
}) {
  const coverage = coverageLabel(payload);

  const [sort, setSort] = useState<{ key: RemovalsSortKey; reversed: boolean }>({ key: "total", reversed: false });
  const [country, setCountry] = useState<string | null>(null);

  const year = payload.years.find((y) => y.fy === fy);
  const comparable = !!year && year.rows.some((r) => r[2] !== null);
  const key: RemovalsSortKey = sort.key === "change" && !comparable ? "total" : sort.key;
  const reversed = key === sort.key ? sort.reversed : false;
  const onSort = (k: RemovalsSortKey) => setSort((s) => (s.key === k && key === k ? { key: k, reversed: !s.reversed } : { key: k, reversed: false }));

  const names = payload.countries;
  const ranked = useMemo(() => (year ? rankYear(year) : []), [year]);
  const list = useMemo(() => sortRanked(ranked, names, key, reversed), [ranked, names, key, reversed]);

  const title = (
    <span className="inline-flex items-center gap-2">
      Who gets removed
      <InfoMarker n={1} label="What counts as a removal">
        A removal is a confirmed movement of a non-citizen out of the U.S. that the government enforces. These are ICE’s headline counts, which since FY2007
        include returns (voluntary returns, voluntary departures and withdrawals under docket control). ICE only: removals carried out by Border Patrol, and
        Title 42 expulsions, are not counted.
      </InfoMarker>
    </span>
  );

  if (!year) {
    return (
      <ChartCard title={title} lede={`ICE removals by country of citizenship, ${coverage}.`}>
        <p className="m-0 rounded-md border border-dashed border-line-strong px-4 py-8 text-center text-[0.85rem] leading-[1.6] text-ink-muted">
          ICE publishes removals by country only for {coverage}.{" "}
          FY{fy} has no country table, so there is no country list to show. Move the fiscal-year slider (or click a bar) to a covered year.
        </p>
      </ChartCard>
    );
  }

  const selectedRow = country === null ? undefined : ranked.find((r) => names[r.ci].key === country);
  const selectedName = country === null ? null : (names.find((c) => c.key === country)?.name ?? country);
  const scaleMax = Math.max(1, ...ranked.map((r) => r.removals));
  const rows: StackedRowData[] = list.map((r) => {
    const c = names[r.ci];
    return {
      id: c.key,
      rank: r.rank,
      label: c.name,
      segments: [{ value: r.removals, color: "var(--accent)", title: `${c.name}: ${n(r.removals)}` }],
      total: n(r.removals),
      delta: formatChange(r.change),
      selected: c.key === country,
      dimmed: country !== null && c.key !== country,
    };
  });
  const prev = `FY${String(fy - 1).slice(2)}`;

  return (
    <ChartCard
      title={title}
      lede={
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>ICE removals · FY{fy} · by country of citizenship</span>
          <InfoMarker n={2} label="Citizenship versus destination">
            Country of citizenship, not where a person was sent. A person removed to a third country is counted under their own citizenship.
          </InfoMarker>
          <span>· bars show removals</span>
          <InfoMarker n={3} label="Data coverage">
            ICE prints country tables for {coverage} only. FY2013 lists just the top ten and FY2025 has no table, so neither can be chosen. Countries with no
            removals in a year are left out; “Unknown” and “Stateless” are ICE categories, not countries. FY2020 to FY2023 leave out Title 42 expulsions.
          </InfoMarker>
        </span>
      }
      action={
        selectedName ? (
          <span className="rounded-md border border-line-strong bg-surface-raised px-2 py-0.5 text-[0.75rem] text-ink">
            {selectedRow ? `${selectedName} · No. ${selectedRow.rank} · ${n(selectedRow.removals)}` : `${selectedName} · no removals in FY${fy}`}
          </span>
        ) : undefined
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <ReversibleSortToggle
          ariaLabel="Sort countries"
          active={key}
          reversed={reversed}
          onSelect={onSort}
          options={[
            { key: "total", label: "Total", hint: "Largest first" },
            {
              key: "change",
              label: `Change vs. ${prev}`,
              hint: comparable ? "Biggest increase first" : `No prior year: ICE’s country tables start at FY${payload.years[0].fy}.`,
              disabled: !comparable,
            },
            { key: "name", label: "A–Z", hint: "Alphabetical" },
          ]}
        />
      </div>

      <div className="mt-3 border-t border-line pt-1">
        <div
          className="max-h-[27rem] overflow-y-auto overscroll-contain pr-0.5 touch-scroll"
          tabIndex={0}
          aria-label={`Removals by country, FY${fy}, ${ranked.length} countries, scrollable`}
        >
          <StackedRows
            rows={rows}
            scaleMax={scaleMax}
            onRowClick={(id) => setCountry((c) => (c === id ? null : id))}
            ariaLabel={`ICE removals by country of citizenship, FY${fy}, ranked`}
            emptyText="No removals recorded."
          />
        </div>
      </div>

      <MethodologyNote>
      <p>
        FY{fy}: {n(year.total)} removals across {ranked.length} countries and categories, matching the timeline above. Source:{" "}
        <a href={year.sourceUrl} target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">
          {year.source}
        </a>
        , data as of {dateLabel(year.asOf)}.
      </p>
      </MethodologyNote>

      <details className="mt-3 text-[0.8rem] text-ink-muted">
        <summary className={TABLE_TOGGLE}>View as table</summary>
        <div className="mt-2 max-h-[24rem] overflow-auto">
          <table className="w-full min-w-[26rem] border-collapse text-left">
            <caption className="sr-only">{`ICE removals by country of citizenship, FY${fy}`}</caption>
            <thead>
              <tr className="border-b border-line-strong text-[0.7rem] uppercase tracking-[0.06em] text-ink-faint">
                <th className="py-1.5 pr-3 font-medium">Rank</th>
                <th className="py-1.5 pr-3 font-medium">Country of citizenship</th>
                <th className="py-1.5 pr-3 text-right font-medium">Removals</th>
                <th className="py-1.5 text-right font-medium">{`Change vs. ${prev}`}</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r) => (
                <tr key={r.ci} className="border-b border-line">
                  <td className="py-1.5 pr-3 font-mono">{r.rank}</td>
                  <th scope="row" className="py-1.5 pr-3 font-normal text-ink">{names[r.ci].name}</th>
                  <td className="py-1.5 pr-3 text-right font-mono text-ink">{n(r.removals)}</td>
                  <td className="py-1.5 text-right font-mono">{formatChange(r.change)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </ChartCard>
  );
}
