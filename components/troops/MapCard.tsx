"use client";

import { useMemo, useRef, type PointerEvent } from "react";
import { ChartCard } from "@/components/charts/ChartCard";
import { MapCallouts } from "@/components/charts/MapCallouts";
import { Tooltip, useTooltip } from "@/components/charts/Tooltip";
import { useZoomPan } from "@/components/charts/use-zoom-pan";
import { ZoomControls } from "@/components/charts/ZoomControls";
import { MethodologyNote } from "@/components/MethodologyNote";
import type { WorldMapFile } from "@/lib/foreign-aid-entities";
import { BRANCH_NAMES, MAP_BINS, formatCount, measureLabel, periodView } from "@/lib/troops-derive";
import { regionLabel } from "@/lib/troops-regions";
import { useTroopsState } from "./TroopsState";
import { RankedList } from "./RankedList";
import { TD, TH, TableView, branchColor } from "./shared";

interface Hit {
  title: string;
  place: number | null;
  value: number | null;
  /** Source printed this host blank (not reported). */
  suppressed: boolean;
  branches: number[] | null;
}

const LAND = "color-mix(in oklab, var(--ink) 7%, var(--surface))";
const NOT_REPORTED = "color-mix(in oklab, var(--ink) 24%, var(--surface))";
const mix = (base: string, pct: number) => `color-mix(in oklab, ${base} ${pct}%, var(--surface))`;
const MARKER_R = 3.4;
const MAX_ZOOM = 8;

/**
 * "Where they are": a choropleth of the selected quarter on fixed absolute bins (so quarters stay comparable while
 * scrubbing) beside the ranked host list. The selected country is outlined and raised, the rest dimmed; small hosts
 * get a marker. Territories, afloat and unassigned, and hosts with no outline are stated under the map.
 */
export function MapCard({ map }: { map: WorldMapFile }) {
  const { data, pi, country, toggleCountry, measure } = useTroopsState();
  const { places, periods } = data.payload;
  const tip = useTooltip<Hit>();
  const svgRef = useRef<SVGSVGElement>(null);
  const zoom = useZoomPan({ svgRef, extent: 1, maxK: MAX_ZOOM, getPlotBox: () => svgRef.current?.getBoundingClientRect() ?? null, onViewChange: tip.hide });
  const { k, cx, cy } = zoom.view;
  const vb = { x: ((cx + 1) / 2) * map.width - map.width / (2 * k), y: ((1 - cy) / 2) * map.height - map.height / (2 * k), w: map.width / k, h: map.height / k };

  const view = useMemo(() => periodView(data, measure, pi), [data, measure, pi]);
  const p = periods[pi];
  const base = measure === 0 ? "var(--accent)" : branchColor(measure - 1);

  const byIso = useMemo(() => {
    const m = new Map<string, Hit>();
    for (const r of view.ranked) {
      const pl = places[r.place];
      if (pl.iso3) m.set(pl.iso3, { title: pl.name, place: r.place, value: r.value, suppressed: false, branches: r.branches });
    }
    for (const sp of view.suppressed) {
      const pl = places[sp];
      if (pl.iso3) m.set(pl.iso3, { title: pl.name, place: sp, value: null, suppressed: true, branches: null });
    }
    return m;
  }, [view, places]);
  const featureKeys = useMemo(() => new Set(map.features.map((f) => f.key)), [map]);
  const markerOf = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    for (const r of map.recipients) if (r.marker && r.paths.length === 1) m.set(r.paths[0], r.marker);
    return m;
  }, [map]);
  const markers = useMemo(
    () => [...byIso].filter(([iso, h]) => markerOf.has(iso) && (h.suppressed || (h.value ?? 0) > 0)).map(([iso, h]) => ({ iso, hit: h, ...markerOf.get(iso)! })),
    [byIso, markerOf],
  );

  const selIso = country >= 0 ? places[country].iso3 : null;
  const ordered = [...map.features.filter((f) => f.key !== selIso), ...map.features.filter((f) => f.key === selIso)];
  const fillOf = (h: Hit | undefined) => (!h ? LAND : h.suppressed ? NOT_REPORTED : h.value ? mix(base, MAP_BINS.mix[MAP_BINS.classOf(h.value) - 1]) : LAND);

  const hitFor = (el: Element | null): Hit | null => {
    const iso = el?.closest("[data-m]")?.getAttribute("data-m") ?? el?.closest("[data-k]")?.getAttribute("data-k");
    if (!iso) return null;
    return byIso.get(iso) ?? { title: map.features.find((f) => f.key === iso)?.name ?? iso, place: null, value: null, suppressed: false, branches: null };
  };
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const h = hitFor(e.target as Element);
    if (h) tip.show(h, e);
    else tip.hide();
  };
  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const h = hitFor(e.target as Element);
    if (h?.place != null) toggleCountry(h.place);
  };

  const callouts = useMemo(
    () =>
      view.ranked
        .filter((r) => places[r.place].iso3 && featureKeys.has(places[r.place].iso3!))
        .slice(0, 3)
        .map((r) => ({ key: places[r.place].iso3!, text: `${places[r.place].name} ${formatCount(r.value)}` })),
    [view, places, featureKeys],
  );

  const noOutline = view.ranked.filter((r) => !places[r.place].iso3 || !featureKeys.has(places[r.place].iso3!));
  const selRank = country >= 0 ? view.ranked.find((r) => r.place === country) : undefined;
  const nHosts = view.ranked.length;

  return (
    <ChartCard
      title="Where they are, and who hosts the most"
      lede={
        view.unavailable ? (
          <>
            {p.label} · the Army did not report this quarter, so the map and list need a single branch from the Branch filter
          </>
        ) : (
          <>
            {p.label} · <b className="font-semibold text-ink">{formatCount(view.hostTotal)}</b> in {nHosts} countries
            {view.afloat > 0 && `, plus ${formatCount(view.afloat)} afloat or unassigned`}
            {measure > 0 && ` · ${measureLabel(measure)} only`}
            {measure === 0 && " · bars show each country’s branch mix"}
          </>
        )
      }
      action={
        country >= 0 ? (
          <span className="rounded-md border border-line-strong bg-surface-raised px-2 py-0.5 text-[0.75rem] text-ink">
            {selRank ? `${places[country].name} · No. ${selRank.rank} · ${formatCount(selRank.value)}` : `${places[country].name} · ${view.suppressed.includes(country) ? "not reported" : "no troops reported"}`}
          </span>
        ) : undefined
      }
    >
      <div className="grid grid-cols-1 gap-x-4 gap-y-4 md:grid-cols-[1.5fr_1fr] md:items-stretch">
        <div className="flex min-w-0 flex-col">
          <div className="relative">
            <svg
              ref={svgRef}
              viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
              role="img"
              aria-label={`World map of active-duty personnel by host country, ${p.label}. The ranked list and table view carry the same figures.`}
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
                const h = byIso.get(f.key);
                const sel = f.key === selIso;
                return (
                  <path
                    key={f.key}
                    data-k={f.key}
                    d={f.d}
                    style={{
                      fill: fillOf(h),
                      stroke: sel ? "var(--accent)" : "var(--surface)",
                      strokeWidth: sel ? 1.7 : 0.5,
                      vectorEffect: "non-scaling-stroke",
                      opacity: country >= 0 && !sel ? 0.4 : 1,
                      cursor: h ? "pointer" : "default",
                      transition: "opacity .12s",
                    }}
                  />
                );
              })}
              {markers.map((m) => {
                const sel = m.iso === selIso;
                return (
                  <circle
                    key={m.iso}
                    data-m={m.iso}
                    cx={m.x}
                    cy={m.y}
                    r={MARKER_R / Math.sqrt(k)}
                    style={{ fill: fillOf(m.hit), stroke: sel ? "var(--accent)" : "var(--ink-muted)", strokeWidth: sel ? 1.7 : 0.8, opacity: country >= 0 && !sel ? 0.4 : 1, cursor: "pointer" }}
                  />
                );
              })}
              <MapCallouts svgRef={svgRef} entries={callouts} view={vb} />
            </svg>
            <ZoomControls onZoomIn={zoom.zoomIn} onZoomOut={zoom.zoomOut} onReset={zoom.reset} canZoomIn={zoom.canZoomIn} zoomed={zoom.zoomed} />
          </div>
          <Tooltip state={tip.state}>{(h) => <MapTip hit={h} />}</Tooltip>

          {!view.unavailable && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[0.75rem] text-ink-muted">
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block h-2.5 w-[22px] rounded-[2px] border border-line" style={{ background: LAND }} />
              None reported
            </span>
            {MAP_BINS.labels.map((l, i) => (
              <span key={l} className="inline-flex items-center gap-1.5">
                <i className="inline-block h-2.5 w-[22px] rounded-[2px] border border-line" style={{ background: mix(base, MAP_BINS.mix[i]) }} />
                {l}
              </span>
            ))}
            {view.suppressed.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <i className="inline-block h-2.5 w-[22px] rounded-[2px] border border-line" style={{ background: NOT_REPORTED }} />
                Blank in source (not reported)
              </span>
            )}
            {markers.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <svg width="12" height="12" aria-hidden>
                  <circle cx="6" cy="6" r="4" fill="none" stroke="var(--ink-muted)" strokeWidth="1.2" />
                </svg>
                Small host, marked
              </span>
            )}
          </div>
          )}
        </div>
        <RankedList view={view} />
      </div>

      <MethodologyNote>
        <p>
          <b className="font-semibold text-ink">Not on the map:</b>{" "}
          {view.territories.length > 0
            ? `U.S. territories ${view.territories.map((t) => `${places[t.place].name} ${formatCount(t.value)}`).join(", ")} (${formatCount(view.territoryTotal)}) sit inside DMDC’s overseas total but are not hosts and are not counted above`
            : "no U.S. territory figures this quarter"}
          {view.afloat > 0 ? `; ${formatCount(view.afloat)} are afloat or unassigned (DMDC’s UNKNOWN row)` : ""}
          {noOutline.length > 0 ? `; no outline is drawn for ${noOutline.map((r) => `${places[r.place].name} ${formatCount(r.value)}`).join(", ")}` : ""}.
        </p>
        <p>
          {view.suppressed.length > 0 ? (
            <>
              {view.suppressed.map((s) => places[s].name).join(", ")} {view.suppressed.length > 1 ? "print" : "prints"} blank in this quarter’s table (listed “n/r”): not reported, not zero. Afghanistan has no row at all from Sep 2023, and Iraq and
              Syria have none from Dec 2023; an absent row is not a zero either.
            </>
          ) : (
            <>Afghanistan has no row at all from Sep 2023, and Iraq and Syria have none from Dec 2023; before Sep 2021 they print blank. An absent or blank row is not a zero.</>
          )}{" "}
          Counts are active-duty personnel assigned to the place; from Dec 2017 that excludes deployed forces, so the quarters before and after are not like-for-like.
        </p>
      </MethodologyNote>

      <TableView caption={`Active-duty personnel by host country, ${p.label}`}>
        <thead>
          <tr>
            <th className={TH}>Country</th>
            <th className={TH}>Region</th>
            <th className={TH}>{measureLabel(measure)}</th>
            {measure === 0 && BRANCH_NAMES.map((n) => <th key={n} className={TH}>{n}</th>)}
          </tr>
        </thead>
        <tbody>
          {view.ranked.map((r) => (
            <tr key={r.place}>
              <td className={TD}>{places[r.place].name}</td>
              <td className={TD}>{regionLabel(places[r.place].region!)}</td>
              <td className={TD}>{formatCount(r.value)}</td>
              {measure === 0 && r.branches.map((v, i) => <td key={i} className={TD}>{formatCount(v)}</td>)}
            </tr>
          ))}
          {view.suppressed.map((s) => (
            <tr key={s}>
              <td className={TD}>{places[s].name}</td>
              <td className={TD}>{regionLabel(places[s].region!)}</td>
              <td className={TD}>n/r</td>
              {measure === 0 && BRANCH_NAMES.map((n) => <td key={n} className={TD}>n/r</td>)}
            </tr>
          ))}
        </tbody>
      </TableView>
    </ChartCard>
  );
}

function MapTip({ hit }: { hit: Hit }) {
  const { data, pi, measure } = useTroopsState();
  const p = data.payload.periods[pi];
  const region = hit.place != null ? data.payload.places[hit.place].region : null;
  return (
    <div>
      <div style={{ fontWeight: 600 }}>{hit.title}</div>
      <div className="tt-mono">
        {p.label}
        {region ? ` · ${regionLabel(region)}` : ""}
      </div>
      {hit.suppressed ? (
        <div className="tt-mono" style={{ marginTop: 4 }}>Blank in source (not reported, not zero)</div>
      ) : hit.value === null ? (
        <div className="tt-mono" style={{ marginTop: 4 }}>No troops reported</div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14, marginTop: 4, fontWeight: 600 }}>
            <span>{measureLabel(measure)}</span>
            <span className="tt-mono">{formatCount(hit.value)}</span>
          </div>
          {measure === 0 &&
            hit.branches
              ?.map((v, k) => [v, k] as const)
              .filter(([v]) => v > 0)
              .sort((a, b) => b[0] - a[0])
              .map(([v, k]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 14, opacity: 0.85 }}>
                  <span>
                    <i style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, marginRight: 6, background: branchColor(k), outline: "1px solid color-mix(in oklab, var(--bg) 40%, transparent)" }} />
                    {BRANCH_NAMES[k]}
                  </span>
                  <span className="tt-mono">{formatCount(v)}</span>
                </div>
              ))}
        </>
      )}
    </div>
  );
}
