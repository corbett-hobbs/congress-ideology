"use client";

import { forwardRef, useMemo, useRef, useState, type PointerEvent } from "react";
import { ChartCard } from "@/components/charts/ChartCard";
import { MethodologyNote } from "@/components/MethodologyNote";
import { MapCallouts } from "@/components/charts/MapCallouts";
import { ReversibleSortToggle } from "@/components/charts/SortToggle";
import { Tooltip, useTooltip } from "@/components/charts/Tooltip";
import { useZoomPan } from "@/components/charts/use-zoom-pan";
import { ZoomControls } from "@/components/charts/ZoomControls";
import { SECTOR_LABEL, SLOT_NAME, formatAidMoney, militaryShareAvailable, slotOfSector } from "@/lib/foreign-aid-derive";
import type { WorldMapFile } from "@/lib/foreign-aid-entities";
import { DOLLAR_MIX, SHARE_BINS, SHARE_MIX, buildPathIndex, dollarBins, dollarClass, nodeValue, notOnMap, shareClass, undrawnCountries, type NodeValue } from "@/lib/foreign-aid-map";
import { useAidState } from "./ForeignAidState";
import { RankedList } from "./RankedList";
import { TD, TH, TableView, slotColor } from "./shared";

type Measure = "dollars" | "share";
/** The one toggle: which measure the map shades and the list ranks by. Clicking the active button reverses the list only. */
type Pick = { key: Measure; reversed: boolean };

interface Hit {
  title: string;
  cis: number[];
  value: NodeValue;
}

const LAND = "color-mix(in oklab, var(--ink) 7%, var(--surface))";
const mix = (base: string, pct: number) => `color-mix(in oklab, ${base} ${pct}%, var(--surface))`;
const MARKER_R = 3.4;
const MAX_ZOOM = 8;

/**
 * "Where it goes": a choropleth of the selected fiscal year on fixed absolute bins, so years stay
 * comparable while scrubbing. Dollars, or military share (only where military dollars are counted).
 * The selected country is outlined and raised, the rest dimmed; recipients too small to see get a
 * marker. Regional and global programs and entities with no outline are stated under the map.
 */
export const MapCard = forwardRef<HTMLElement, { map: WorldMapFile }>(function MapCard({ map }, ref) {
  const { data, year, sector, country, toggleCountry, isPartial } = useAidState();
  const [pick, setPick] = useState<Pick>({ key: "dollars", reversed: false });
  const tip = useTooltip<Hit>();
  const svgRef = useRef<SVGSVGElement>(null);
  // The hook's square [-1, 1] domain is normalized onto the map's viewBox, so zoom and pan work by moving the viewBox.
  const zoom = useZoomPan({
    svgRef,
    extent: 1,
    maxK: MAX_ZOOM,
    getPlotBox: () => svgRef.current?.getBoundingClientRect() ?? null,
    onViewChange: tip.hide,
  });
  const { k, cx, cy } = zoom.view;
  const vb = { x: ((cx + 1) / 2) * map.width - map.width / (2 * k), y: ((1 - cy) / 2) * map.height - map.height / (2 * k), w: map.width / k, h: map.height / k };
  const yi = year - data.payload.years[0];
  const shareOk = militaryShareAvailable(sector);
  const share = pick.key === "share" && shareOk;
  const reversed = (share ? pick.key === "share" : pick.key === "dollars") && pick.reversed;
  const names = data.payload.countries;

  const pathIndex = useMemo(() => buildPathIndex(data, map), [data, map]);
  const undrawn = useMemo(() => undrawnCountries(data, map), [data, map]);
  const pathValue = useMemo(() => {
    const m = new Map<string, NodeValue>();
    for (const [k, cis] of pathIndex) m.set(k, nodeValue(data, cis, yi, sector));
    return m;
  }, [data, pathIndex, yi, sector]);
  const markers = useMemo(
    () =>
      map.recipients
        .filter((r) => r.marker)
        .map((r) => {
          const ci = names.findIndex((c) => c.name === r.name);
          return { name: r.name, ci, x: r.marker!.x, y: r.marker!.y, value: nodeValue(data, [ci], yi, sector) };
        })
        .filter((m) => m.value.v !== 0),
    [map, names, data, yi, sector],
  );

  const bins = dollarBins(sector);
  const base = share ? "var(--sector-ps)" : sector < 0 ? "var(--ink)" : slotColor(slotOfSector(sector));
  const mixes = share ? SHARE_MIX : DOLLAR_MIX;
  const fillOf = (v: NodeValue) => {
    const c = share ? shareClass(v.v, v.m) : dollarClass(v.v, bins);
    return c ? mix(base, mixes[c - 1]) : LAND;
  };

  const selPaths = new Set(country >= 0 ? map.recipients.filter((r) => r.name === names[country].name).flatMap((r) => r.paths) : []);
  const ordered = [...map.features.filter((f) => !selPaths.has(f.key)), ...map.features.filter((f) => selPaths.has(f.key))];

  const hitFor = (el: Element | null): Hit | null => {
    const m = el?.closest("[data-m]")?.getAttribute("data-m");
    if (m) {
      const mk = markers.find((x) => x.name === m);
      return mk ? { title: mk.name, cis: [mk.ci], value: mk.value } : null;
    }
    const k = el?.closest("[data-k]")?.getAttribute("data-k");
    if (!k) return null;
    const cis = pathIndex.get(k) ?? [];
    const f = map.features.find((x) => x.key === k);
    return { title: cis.length ? cis.map((c) => names[c].name).join(" + ") : (f?.name ?? k), cis, value: pathValue.get(k) ?? { v: 0, m: 0, slots: [] } };
  };
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const h = hitFor(e.target as Element);
    if (h) tip.show(h, e);
    else tip.hide();
  };
  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const h = hitFor(e.target as Element);
    if (!h || !h.cis.length) return;
    toggleCountry(h.cis.find((c) => nodeValue(data, [c], yi, sector).v !== 0) ?? h.cis[0]);
  };

  const n = notOnMap(data, undrawn, year, sector);
  const pct = (a: number, b: number) => Math.round((a / b) * 100);
  const sectorWord = sector === 0 ? "Peace and security" : "all";
  const rowsAll = useMemo(() => {
    const out: { ci: number; v: number; m: number }[] = [];
    for (let c = 0; c < data.nc; c++) {
      const v = nodeValue(data, [c], yi, sector);
      if (v.v !== 0) out.push({ ci: c, v: v.v, m: v.m });
    }
    return out.sort((a, b) => b.v - a.v);
  }, [data, yi, sector]);

  // The three leading recipients (by dollars, or by military share in that view), named on the map.
  const callouts = useMemo(() => {
    const list = share
      ? rowsAll.filter((r) => r.m > 0 && r.v > 0).sort((a, b) => Math.round((b.m / b.v) * 100) - Math.round((a.m / a.v) * 100) || b.m - a.m)
      : rowsAll;
    const out: { key: string; text: string }[] = [];
    for (const r of list) {
      const rec = map.recipients.find((x) => x.name === names[r.ci].name);
      if (!rec?.paths.length) continue;
      out.push({ key: rec.paths[0], text: share ? `${names[r.ci].name} ${Math.round((r.m / r.v) * 100)}%` : `${names[r.ci].name} ${formatAidMoney(r.v)}` });
      if (out.length === 3) break;
    }
    return out;
  }, [rowsAll, share, map, names]);

  const selRank = (() => {
    const i = rowsAll.findIndex((r) => r.ci === country);
    return i < 0 ? null : { rank: i + 1, v: rowsAll[i].v };
  })();

  const legend = share ? SHARE_BINS.labels : bins.labels;
  const legendMix = share ? SHARE_MIX : DOLLAR_MIX;

  return (
    <ChartCard
      ref={ref}
      title="Where it goes, and who receives the most"
      lede={
        share ? (
          <>
            FY{year}
            {isPartial(year) ? " (partial)" : ""} · share of {sectorWord === "all" ? "all" : "Peace and security"} dollars that was military · bars show each country’s sector mix
          </>
        ) : (
          <>
            FY{year}
            {isPartial(year) ? " (partial)" : ""} · <b className="font-semibold text-ink">{formatAidMoney(n.countries)}</b> to {n.countryCount} countries · bars show each country’s sector mix
          </>
        )
      }
      action={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {country >= 0 && (
            <span className="rounded-md border border-line-strong bg-surface-raised px-2 py-0.5 text-[0.75rem] text-ink">
              {selRank ? `${names[country].name} · No. ${selRank.rank} · ${formatAidMoney(selRank.v)}` : `${names[country].name} · no disbursements`}
            </span>
          )}
          <ReversibleSortToggle<Measure>
            ariaLabel="Map measure and list order"
            active={share ? "share" : "dollars"}
            reversed={reversed}
            onSelect={(k) => setPick((p) => (p.key === k ? { key: k, reversed: !p.reversed } : { key: k, reversed: false }))}
            options={[
              { key: "dollars", label: "Dollars", hint: "Largest first; click again to reverse the list (the map doesn’t change)" },
              {
                key: "share",
                label: "Military share",
                hint: shareOk ? "Highest military share first; click again to reverse the list" : "Military assistance sits within Peace and Security, so this view needs Sector set to All or Peace and security.",
                disabled: !shareOk,
              },
            ]}
          />
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-x-4 gap-y-4 md:grid-cols-[1.5fr_1fr] md:items-stretch">
      <div className="flex min-w-0 flex-col">
      <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        role="img"
        aria-label={`World map of U.S. foreign aid ${share ? "military share" : "disbursements"} by recipient country, FY${year}. The ranked list and table view carry the same figures.`}
        className="block h-auto w-full"
        style={{ touchAction: zoom.zoomed ? "none" : "pan-y", cursor: zoom.zoomed ? "grab" : undefined }}
        {...zoom.svgProps}
        onPointerMove={(e) => {
          zoom.svgProps.onPointerMove(e);
          if (e.buttons === 0 || e.pointerType !== "mouse") onMove(e);
          else tip.hide();
        }}
        onPointerDown={(e) => {
          zoom.svgProps.onPointerDown(e);
          onMove(e);
        }}
        onPointerLeave={tip.hide}
        onClick={onClick}
      >
        {ordered.map((f) => {
          const v = pathValue.get(f.key);
          const has = pathIndex.has(f.key);
          const sel = selPaths.has(f.key);
          return (
            <path
              key={f.key}
              data-k={f.key}
              d={f.d}
              style={{
                fill: v ? fillOf(v) : LAND,
                stroke: sel ? "var(--accent)" : "var(--surface)",
                strokeWidth: sel ? 1.7 : 0.5,
                vectorEffect: "non-scaling-stroke",
                opacity: country >= 0 && !sel ? 0.4 : 1,
                cursor: has ? "pointer" : "default",
                transition: "opacity .12s",
              }}
            />
          );
        })}
        {markers.map((m) => {
          const sel = m.ci === country;
          return (
            <circle
              key={m.name}
              data-m={m.name}
              cx={m.x}
              cy={m.y}
              r={MARKER_R / Math.sqrt(k)}
              style={{
                fill: fillOf(m.value),
                stroke: sel ? "var(--accent)" : "var(--ink-muted)",
                strokeWidth: sel ? 1.7 : 0.8,
                opacity: country >= 0 && !sel ? 0.4 : 1,
                cursor: "pointer",
              }}
            />
          );
        })}
        <MapCallouts svgRef={svgRef} entries={callouts} view={vb} />
      </svg>
      <ZoomControls onZoomIn={zoom.zoomIn} onZoomOut={zoom.zoomOut} onReset={zoom.reset} canZoomIn={zoom.canZoomIn} zoomed={zoom.zoomed} />
      </div>
      <Tooltip state={tip.state}>{(h) => <MapTip hit={h} year={year} />}</Tooltip>

      <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[0.75rem] text-ink-muted">
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-[22px] rounded-[2px] border border-line" style={{ background: LAND }} />
          {share ? "None / no aid" : "No aid"}
        </span>
        {legend.map((l, k) => (
          <span key={l} className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2.5 w-[22px] rounded-[2px] border border-line" style={{ background: mix(base, legendMix[k]) }} />
            {l}
          </span>
        ))}
        {markers.length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <svg width="12" height="12" aria-hidden>
              <circle cx="6" cy="6" r="4" fill="none" stroke="var(--ink-muted)" strokeWidth="1.2" />
            </svg>
            Small recipient, marked
          </span>
        )}
      </div>
      </div>
      <RankedList mode={share ? "share" : "dollars"} reversed={reversed} />
      </div>

      <MethodologyNote>
        <p>
        {share ? (
          <>Each country’s military assistance as a share of its {sector === 0 ? "Peace and security" : "total"} disbursements in FY{year}.</>
        ) : (
          <>
            <b className="font-semibold text-ink">Not on the map:</b> {formatAidMoney(n.programs)}
            {n.total > 0 && ` (${pct(n.programs, n.total)}% of the year’s ${formatAidMoney(n.total)})`} went to global and regional programs rather than one country
            {n.undrawn > 5e6 ? `, plus ${formatAidMoney(n.undrawn)} to entities with no modern outline` : ""}.
          </>
        )}
        </p>
      </MethodologyNote>

      <TableView caption={`Disbursements by recipient country, FY${year}`}>
        <thead>
          <tr>
            <th className={TH}>Country</th>
            <th className={TH}>Disbursements</th>
            <th className={TH}>Military</th>
            <th className={TH}>Military share</th>
          </tr>
        </thead>
        <tbody>
          {rowsAll.map((r) => (
            <tr key={r.ci}>
              <td className={TD}>{names[r.ci].name}</td>
              <td className={TD}>{formatAidMoney(r.v)}</td>
              <td className={TD}>{r.m > 0 ? formatAidMoney(r.m) : "–"}</td>
              <td className={TD}>{r.m > 0 && r.v > 0 ? `${pct(r.m, r.v)}%` : "–"}</td>
            </tr>
          ))}
        </tbody>
      </TableView>
    </ChartCard>
  );
});

function MapTip({ hit, year }: { hit: Hit; year: number }) {
  const { sector, isPartial, data } = useAidState();
  const { v, m, slots } = hit.value;
  const sectorName = sector >= 0 ? data.payload.sectors[sector] : "";
  const top = slots.map((s, k) => [s, k] as const).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]).slice(0, 3);
  return (
    <div>
      <div style={{ fontWeight: 600 }}>{hit.title}</div>
      <div className="tt-mono">
        FY{year}
        {isPartial(year) ? " · partial" : ""}
      </div>
      {!hit.cis.length ? (
        <div className="tt-mono" style={{ marginTop: 4 }}>No aid recorded</div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14, marginTop: 4 }}>
            <span>{sector >= 0 ? (SECTOR_LABEL[sectorName as keyof typeof SECTOR_LABEL] ?? sectorName) : "Total"}</span>
            <span className="tt-mono">{formatAidMoney(v)}</span>
          </div>
          {sector < 0 &&
            top.map(([s, k]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 14, opacity: 0.85 }}>
                <span>
                  <i style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, marginRight: 6, background: slotColor(k), outline: "1px solid color-mix(in oklab, var(--bg) 40%, transparent)" }} />
                  {SLOT_NAME[k]}
                </span>
                <span className="tt-mono">{formatAidMoney(s)}</span>
              </div>
            ))}
          {m > 0 && v > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", gap: 14, fontWeight: 600, borderTop: "1px solid color-mix(in oklab, var(--bg) 30%, transparent)", marginTop: 3, paddingTop: 3 }}>
              <span>Military</span>
              <span className="tt-mono">
                {formatAidMoney(m)} · {Math.round((m / v) * 100)}%
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
