"use client";

import { TABLE_TOGGLE } from "@/components/charts/table-toggle";
import { useMemo, useState } from "react";
import { ChartCard } from "@/components/charts/ChartCard";
import { YearPicker } from "@/components/charts/YearPicker";
import { StackedRows, type StackedRowData } from "@/components/charts/StackedRows";
import {
  coverageLabel,
  formatChange,
  rankYear,
} from "@/lib/removals-country-derive";
import type { RemovalsCountryPayload } from "@/lib/removals-country-types";
import { MethodologyNote } from "@/components/MethodologyNote";
import { PillGroup } from "@/components/charts/PillGroup";
import { LATIN_AMERICA, RemovalsMap, undrawnRemovals, type Region } from "./RemovalsMap";

const n = (v: number) => v.toLocaleString("en-US");
const dateLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

/**
 * "Who gets removed": ICE removals by country of citizenship for one fiscal year, as a ranked list of
 * single-color bars on one scale (the foreign-aid "Who receives the most" pattern: `StackedRows`,
 * change vs. the prior year). The year comes from the page's selected fiscal year: the year menu in this card
 * (or a click on a timeline bar) picks it, and a year with no country table says so.
 * The years-shown window never trims the list of countries. Clicking a country highlights it and dims the rest.
 */
export function RemovalsCountryCard({
  payload,
  fy,
  range,
  onFy,
  worldMap,
}: {
  payload: RemovalsCountryPayload;
  worldMap: { width: number; height: number; features: { key: string; name: string; d: string }[] };
  /** The selected fiscal year (a bar click, or this card's year menu). */
  fy: number;
  /** The fiscal years the pinned slider's window shows; the year menu lists these. */
  range: readonly [number, number];
  onFy: (fy: number) => void;
}) {
  const coverage = coverageLabel(payload);

  const [region, setRegion] = useState<Region>("americas");
  const [country, setCountry] = useState<string | null>(null);

  const year = payload.years.find((y) => y.fy === fy);
  const names = payload.countries;
  const ranked = useMemo(() => (year ? rankYear(year) : []), [year]);

  const title = "Who gets removed";
  const picker = <YearPicker value={fy} range={range} playRange={[payload.years[0].fy, payload.years[payload.years.length - 1].fy]} onChange={onFy} format={(v) => `FY${v}`} ariaLabel="Fiscal year shown" />;
  const regionToggle = (
    <PillGroup<Region>
      ariaLabel="Region shown on the map and list"
      value={region}
      onChange={(r) => {
        setRegion(r);
        setCountry(null);
      }}
      options={[
        { value: "americas", label: "Latin America" },
        { value: "world", label: "World" },
      ]}
    />
  );

  if (!year) {
    return (
      <ChartCard title={title} lede={`ICE removals by country of citizenship, ${coverage}.`} action={picker}>
        <p className="m-0 rounded-md border border-dashed border-line-strong px-4 py-8 text-center text-[0.85rem] leading-[1.6] text-ink-muted">
          ICE publishes removals by country only for {coverage}.{" "}
          FY{fy} has no country table, so there is no country list to show. Pick a covered year from the year menu (or click a bar).
        </p>
      </ChartCard>
    );
  }

  // The region toggle governs the list as well as the map: Latin America lists only its countries, ranked among themselves.
  const listed = (region === "americas" ? ranked.filter((r) => LATIN_AMERICA.has(names[r.ci].key)) : ranked).map((r, i) => ({ ...r, rank: i + 1 }));
  const selectedRow = country === null ? undefined : listed.find((r) => names[r.ci].key === country);
  const selectedName = country === null ? null : (names.find((c) => c.key === country)?.name ?? country);
  const scaleMax = Math.max(1, ...listed.map((r) => r.removals));
  const rows: StackedRowData[] = listed.map((r) => {
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
  const mapRows = ranked.map((r) => ({ key: names[r.ci].key, name: names[r.ci].name, removals: r.removals }));
  const off = undrawnRemovals(worldMap.features, mapRows);

  return (
    <ChartCard
      title={title}
      lede={`ICE removals · FY${fy} · by country of citizenship · bars show removals`}
      action={
        <div className="flex flex-wrap items-center gap-2">
          {selectedName && (
            <span className="rounded-md border border-line-strong bg-surface-raised px-2 py-0.5 text-[0.75rem] text-ink">
              {selectedRow ? `${selectedName} · No. ${selectedRow.rank} · ${n(selectedRow.removals)}` : `${selectedName} · no removals in FY${fy}`}
            </span>
          )}
          <div className="flex flex-nowrap items-center gap-2">{picker}{regionToggle}</div>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-x-4 gap-y-4 md:grid-cols-[1.5fr_1fr] md:items-stretch">
        <RemovalsMap
          features={worldMap.features}
          rows={mapRows}
          country={country}
          onPick={setCountry}
          fy={fy}
          region={region}
        />
        <div className="flex min-w-0 flex-col">
      <div className="border-t border-line pt-1">
        <div
          className="max-h-[24rem] md:max-h-[27rem] overflow-y-auto overscroll-contain pr-0.5 touch-scroll"
          tabIndex={0}
          aria-label={`Removals by country, FY${fy}, ${listed.length} countries, scrollable`}
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

        </div>
      </div>

      <MethodologyNote>
        <p>
          ICE’s headline removal counts, which since FY2007 include returns, by country of citizenship rather than where a person was sent. ICE only: Border Patrol removals and Title 42 expulsions are not counted. ICE prints country tables for {coverage} only (FY2013 lists just the top ten; FY2025 has none), and “Unknown” and “Stateless” are ICE categories, not countries.
          {off.count > 0 && <>{off.count} rows with no outline ({n(off.removals)} removals) are in the list and table but not on the map. </>}
          FY{fy}: {n(year.total)} removals across {ranked.length} countries and categories. Source:{" "}
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
