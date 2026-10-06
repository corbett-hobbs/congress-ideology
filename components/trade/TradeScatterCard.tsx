"use client";

import { Y_GUTTER } from "@/lib/chart-bars";
import { TABLE_TOGGLE } from "@/components/charts/table-toggle";
import { memo, useId, useMemo, useRef, useState } from "react";
import { scaleLinear, scaleSymlog } from "d3-scale";
import { Axis } from "@/components/charts/Axis";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { useZoomPan, viewDomains } from "@/components/charts/use-zoom-pan";
import { ZoomControls } from "@/components/charts/ZoomControls";
import { CONTINENTS, continentOf } from "@/lib/trade-continents";
import { Tooltip, usePinnedTooltip, useTooltip } from "@/components/charts/Tooltip";
import { useElementWidth } from "@/lib/use-element-width";
import { useMediaQuery } from "@/lib/use-media-query";
import { MONTH_NAMES } from "@/lib/indicator-time";
import { fmtMoney } from "@/lib/trade-chart";
import {
  fmtPct,
  fmtPp,
  placeLabels,
  scatterAxes,
  toDot,
  Y_CAP_PCT,
  Y_MIN_PCT,
  Y_SYMLOG_CONSTANT,
  Y_TICKS_PCT,
  type PlottedDot,
  type ScatterRow,
  type ScatterWindows,
} from "@/lib/trade-scatter";
import { MethodologyNote } from "@/components/MethodologyNote";

const FALLBACK_W = 1080;
/** Below this chart width the layout drops long titles and labels (a half-width card on a laptop stays above it). */
const COMPACT_W = 440;
const LABEL_COUNT = 5;
/** Phones: fewer, smaller labels. */
const COMPACT_LABEL_COUNT = 3;
const MAX_ZOOM = 12;
const contFill = (code: string) => `var(--cont-${continentOf(code)})`;

const monthYear = (p: string) => `${MONTH_NAMES[Number(p.slice(5)) - 1].slice(0, 3)} ${p.slice(0, 4)}`;
const windowText = (w: { from: string; to: string }) => (w.from.slice(0, 4) === w.to.slice(0, 4) ? `${MONTH_NAMES[Number(w.from.slice(5)) - 1].slice(0, 3)}–${monthYear(w.to)}` : `${monthYear(w.from)}–${monthYear(w.to)}`);
const pctRate = (r: number | null) => (r === null ? "—" : `${(r * 100).toFixed(1)}%`);

interface Dot {
  row: ScatterRow;
  d: PlottedDot;
}

const Triangle = ({ x, y, up, className, fill }: { x: number; y: number; up: boolean; className?: string; fill?: string }) => (
  <polygon points={up ? `${x - 5},${y + 6} ${x + 5},${y + 6} ${x},${y - 5}` : `${x - 5},${y - 6} ${x + 5},${y - 6} ${x},${y + 5}`} className={className} fill={fill} />
);

const DataTable = memo(function DataTable({ rows, windows }: { rows: ScatterRow[]; windows: ScatterWindows }) {
  return (
    <details className="mt-3">
      <summary className={TABLE_TOGGLE}>View as table</summary>
      <p className="m-0 mt-1.5 text-[0.75rem] text-ink-muted">Country, change in duty rate, change in imports, and months covered, in a table. Countries missing months in either window are listed but not plotted.</p>
      <div className="mt-2 max-h-72 overflow-auto">
        <table className="w-full border-collapse text-left text-[0.75rem] tabular-nums">
          <caption className="sr-only">{`Change in calculated duty rate and imports by country, ${windowText(windows.baseline)} to ${windowText(windows.latest)}`}</caption>
          <thead className="sticky top-0 bg-surface-raised">
            <tr className="font-mono text-[0.65rem] uppercase tracking-[0.05em] text-ink-muted">
              <th scope="col" className="px-2 py-1.5">Country</th>
              <th scope="col" className="px-2 py-1.5">Rate before</th>
              <th scope="col" className="px-2 py-1.5">Rate now</th>
              <th scope="col" className="px-2 py-1.5">Rate change</th>
              <th scope="col" className="px-2 py-1.5">Imports change</th>
              <th scope="col" className="px-2 py-1.5">Months (before, now)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code} className="border-t border-line">
                <th scope="row" className="px-2 py-1 font-normal">{r.name}{r.plotted ? "" : " (not plotted)"}</th>
                <td className="px-2 py-1">{pctRate(r.baseRate)}</td>
                <td className="px-2 py-1">{pctRate(r.latestRate)}</td>
                <td className="px-2 py-1">{r.rateChangePp === null ? "—" : fmtPp(r.rateChangePp)}</td>
                <td className="px-2 py-1">{r.importsChange === null ? "—" : fmtPct(r.importsChange * 100)}</td>
                <td className="px-2 py-1">{`${r.months[0]} of ${windows.months}, ${r.months[1]} of ${windows.months}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
});

/**
 * Chart 5: did tariffs shift trade? One dot per country: across, the change in
 * its calculated duty rate (percentage points); up, the change in its imports
 * for consumption, on a symmetric-log axis with outliers pinned to the edge.
 * The country filter highlights its dot; clicking a dot picks that country.
 */
export function TradeScatterCard({
  rows,
  windows,
  country,
  onPickCountry,
  topCodes,
}: {
  rows: ScatterRow[];
  windows: ScatterWindows;
  country: string | null;
  onPickCountry: (code: string | null) => void;
  /** Partner codes by total trade, biggest first; the first few that are plotted get a name label. */
  topCodes: readonly string[];
}) {
  const [wrapRef, measured] = useElementWidth<HTMLDivElement>();
  const [query, setQuery] = useState("");
  const [tapped, setTapped] = useState<string | null>(null);
  /** Legend filter: one continent, or null for all. */
  const [continent, setContinent] = useState<string | null>(null);
  const tip = useTooltip<Dot>();
  // Scatter rule: a click on a dot pins its card, and the card is the action (here: pick the country above).
  const pin = usePinnedTooltip<Dot>();
  const W = measured || FALLBACK_W;
  const compact = W < COMPACT_W;
  // Tap behaviour follows the device, not the width: a narrow card on a laptop still hovers.
  const tapMode = !useMediaQuery("(hover: hover)");
  const margin = compact ? { top: 22, right: 14, bottom: 52, left: Y_GUTTER + 20 } : { top: 22, right: 24, bottom: 56, left: Y_GUTTER + 22 };
  const pw = W - margin.left - margin.right;
  const ph = compact ? 340 : W >= 900 ? 520 : 440;
  const H = ph + margin.top + margin.bottom;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const clipId = `trade-scatter-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const zoom = useZoomPan({
    svgRef,
    extent: 1, // the plot is zoomed as a unit square; the scales below map it back to data
    maxK: MAX_ZOOM,
    getPlotBox: () => {
      const svg = svgRef.current;
      if (!svg) return null;
      const r = svg.getBoundingClientRect();
      const k = r.width / W;
      return { left: r.left + margin.left * k, top: r.top + margin.top * k, width: pw * k, height: ph * k };
    },
    onViewChange: () => tip.hide(),
  });

  const axes = useMemo(() => scatterAxes(rows), [rows]);
  const x0 = useMemo(() => scaleLinear().domain([axes.xMin, axes.xMax]).range([0, pw]), [axes, pw]);
  const y0 = useMemo(() => scaleSymlog().constant(Y_SYMLOG_CONSTANT).domain([Y_MIN_PCT, Y_CAP_PCT]).range([ph, 0]), [ph]);
  // Zooming narrows the visible window of the same scales, so dots and text keep their pixel size.
  const win = viewDomains(zoom.view, 1);
  const x = useMemo(
    () => x0.copy().domain([x0.invert(((win.x[0] + 1) / 2) * pw), x0.invert(((win.x[1] + 1) / 2) * pw)]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [x0, pw, win.x[0], win.x[1]],
  );
  const y = useMemo(
    () => y0.copy().domain([y0.invert(((1 - win.y[0]) / 2) * ph), y0.invert(((1 - win.y[1]) / 2) * ph)]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [y0, ph, win.y[0], win.y[1]],
  );
  const zoomed = zoom.zoomed;
  const xTicksShown = zoomed ? x.ticks(6) : axes.xTicks;
  const yTicksShown = zoomed ? (() => { const t = Y_TICKS_PCT.filter((v) => v >= y.domain()[0] && v <= y.domain()[1]); return t.length >= 3 ? t : y.ticks(6); })() : Y_TICKS_PCT;
  const dots = useMemo<Dot[]>(
    () => rows.flatMap((row) => {
      const d = toDot(row, axes);
      return d && (!continent || continentOf(row.code) === continent) ? [{ row, d }] : [];
    }),
    [rows, axes, continent],
  );
  const plotted = dots.length;
  const higher = dots.filter((d) => (d.row.rateChangePp as number) > 0).length;
  const sortedMedian = useMemo(() => {
    const xs = dots.map((d) => d.row.rateChangePp as number).sort((a, b) => a - b);
    return xs.length ? xs[Math.floor((xs.length - 1) / 2)] : null;
  }, [dots]);

  // The five biggest partners by total trade get a name beside their dot. A label that would run off
  // the right edge flips to the dot's left; one that still collides with a kept label is dropped.
  const labels = useMemo(() => {
    const byCode = new Map(dots.map((d) => [d.row.code, d]));
    const biggest = topCodes.flatMap((c) => (byCode.has(c) ? [byCode.get(c)!] : [])).slice(0, compact ? COMPACT_LABEL_COUNT : LABEL_COUNT);
    const placed = biggest.map((c) => {
      const width = c.row.name.length * (compact ? 6.4 : 7.4) + 6;
      const flip = x(c.d.x) + 8 + width > pw;
      const left = flip ? x(c.d.x) - 8 - width : x(c.d.x) + 8;
      return { c, flip, box: { id: c.row.code, x: left, y: y(c.d.yPct) - 7, width, height: 15 } };
    });
    const kept = new Set(placeLabels(placed.map((p) => p.box), pw, ph).map((b) => b.id));
    return placed
      .filter((p) => kept.has(p.c.row.code))
      .map((p) => ({ code: p.c.row.code, name: p.c.row.name, x: p.flip ? p.box.x + p.box.width : p.box.x, y: p.box.y + 12, flip: p.flip }));
  }, [dots, compact, topCodes, x, y, pw, ph]);

  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rows.filter((r) => r.name.toLowerCase().includes(q)).slice(0, 8) : [];
  }, [query, rows]);

  const tappedRow = tapped ? rows.find((r) => r.code === tapped) ?? null : null;
  const selectedRow = country ? rows.find((r) => r.code === country) ?? null : null;
  const drawOrder = useMemo(() => [...dots].sort((a, b) => Number(a.row.code === country) - Number(b.row.code === country)), [dots, country]);
  const xTick = (v: number) => (v === 0 ? "0 pp" : `${v > 0 ? "+" : "−"}${Math.abs(v)} pp`);
  const yTick = (v: number) => (v === 0 ? "0" : fmtPct(v));
  const aria = `Scatter plot of ${plotted} countries. Across: change in calculated duties as a share of imports, in percentage points, from ${windowText(windows.baseline)} to ${windowText(windows.latest)}. Up: change in imports over the same months, on a symmetric log scale capped at plus ${Y_CAP_PCT} percent. ${higher} of ${plotted} saw a higher duty rate. The same data is in the table below.`;

  return (
    <section className="min-w-0 rounded-[10px] border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="m-0 font-serif text-[1.6rem] font-medium leading-tight">Did tariffs shift trade?</h2>
        <div className="relative w-full sm:w-44 sm:flex-none">
          <label className="sr-only" htmlFor="trade-scatter-search">Find a country</label>
          <input
            id="trade-scatter-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && found[0]) {
                onPickCountry(found[0].code);
                setQuery("");
              } else if (e.key === "Escape") setQuery("");
            }}
            placeholder="Find a country…"
            className="w-full rounded-md border border-line-strong bg-surface-raised px-3 py-1.5 text-[0.85rem] text-ink placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          />
          {query.trim() && (
            <div className="absolute z-30 mt-1 w-full rounded-md border border-line-strong bg-surface shadow-lg">
              <p className="border-b border-line px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.06em] text-ink-faint">
                {found.length ? `Countries matching "${query.trim()}"` : "No match."}
              </p>
              <ul className="max-h-64 overflow-y-auto">
                {found.map((r) => (
                  <li key={r.code}>
                    <button
                      type="button"
                      onClick={() => {
                        onPickCountry(r.code);
                        setQuery("");
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[0.82rem] hover:bg-surface-raised"
                    >
                      <span className="min-w-0 flex-1 truncate">{r.name}</span>
                      {!r.plotted && <span className="flex-none font-mono text-[0.7rem] text-ink-faint">not plotted</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      <p className="m-0 mt-3 text-[0.875rem] leading-[1.5] text-ink-muted">
            Each dot is a country. Across: how much calculated duties as a share of its imports changed, from {windowText(windows.baseline)} to {windowText(windows.latest)}. Up: how much U.S. imports from it changed over the same months.
          </p>

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[0.78rem] text-ink-muted">
        <span><b className="text-ink">{plotted ? `${Math.round((higher / plotted) * 100)}%` : "—"}</b> higher duty rate</span>
        <span><b className="text-ink">{sortedMedian === null ? "—" : fmtPp(sortedMedian)}</b> median rate change</span>
        <span><b className="text-ink">{plotted}</b> plotted</span>
      </div>
      {selectedRow && !selectedRow.plotted && (
        <p className="m-0 mt-2 text-[0.8rem] text-ink-muted">{`${selectedRow.name} isn’t plotted: it is missing months of duties data in ${selectedRow.months[0] < windows.months ? "the baseline" : "the latest"} window.`}</p>
      )}

      <div ref={wrapRef} className="relative mt-3 -mx-3 sm:mx-0 touch-scroll">
        <ChartFrame width={W} height={H} margin={margin} ariaLabel={aria} svgRef={svgRef} svgProps={zoom.svgProps} onPointerLeave={() => tip.hide()}>
          {() => (
            <>
              <Axis scale={x} orientation="bottom" ticks={xTicksShown} offset={ph} gridExtent={ph} zeroAt={0} format={xTick} />
              <Axis scale={y} orientation="left" ticks={yTicksShown} offset={0} gridExtent={pw} zeroAt={0} format={yTick} />
              <text className="axis-caption" x={pw / 2} y={ph + 44} textAnchor="middle">
                {compact ? "Change in duty rate" : "Change in duties as a share of the country’s imports"}
              </text>
              <text className="axis-caption" transform={`translate(${-(margin.left - 14)},${ph / 2}) rotate(-90)`} textAnchor="middle">
                {compact ? "Change in imports" : "Change in U.S. imports from the country"}
              </text>
              {!compact && (
                <g className="fill-ink-faint font-mono text-[10px] uppercase" pointerEvents="none" style={{ letterSpacing: "0.06em" }}>
                  <text x={4} y={ph + 30}>← Lower tariff rate</text>
                  <text x={pw - 4} y={ph + 30} textAnchor="end">Higher tariff rate →</text>
                  <text x={64} y={12}>More imports ↑</text>
                  <text x={64} y={ph - 6}>Fewer imports ↓</text>
                </g>
              )}
              <clipPath id={clipId}><rect x={-6} y={-8} width={pw + 12} height={ph + 16} /></clipPath>
              <g clipPath={`url(#${clipId})`}>
              {drawOrder.map((c) => {
                const cx = x(c.d.x);
                const cy = y(c.d.yPct);
                const sel = c.row.code === country;
                const className = `dot${sel ? " is-highlighted" : ""}`;
                const fill = contFill(c.row.code);
                const common = {
                  // Phones: a tap fills the card below the chart (no hover); the card holds the action.
                  onPointerEnter: tapMode ? undefined : (e: React.PointerEvent) => tip.show(c, e),
                  onPointerMove: tapMode ? undefined : tip.move,
                  onPointerLeave: tapMode ? undefined : tip.hide,
                  onClick: (e: React.MouseEvent) => {
                    if (tapMode) return setTapped(c.row.code);
                    tip.hide();
                    if (pin.state?.data.row.code === c.row.code) pin.hide();
                    else pin.show(c, e);
                  },
                  style: { cursor: "pointer" } as const,
                };
                if (c.d.pinned) {
                  const up = c.d.pinned === "top" || c.d.pinned === "right";
                  return <g key={c.row.code} {...common}><Triangle x={cx} y={cy} up={up} className={className} fill={fill} />{sel && <circle cx={cx} cy={cy} r={10} fill="none" stroke="var(--accent)" strokeWidth={2.5} />}</g>;
                }
                if (tapMode) {
                  return (
                    <g key={c.row.code} {...common}>
                      <circle cx={cx} cy={cy} r={22} fill="transparent" />
                      <circle cx={cx} cy={cy} r={sel || c.row.code === tapped ? 7 : 4.4} opacity={country && !sel ? 0.55 : 0.85} className={className} fill={fill} />
                      {c.row.code === tapped && <circle cx={cx} cy={cy} r={11} fill="none" stroke="var(--ink)" strokeWidth={1.5} />}
                    </g>
                  );
                }
                return <circle key={c.row.code} cx={cx} cy={cy} r={sel ? 7 : 4.4} opacity={country && !sel ? 0.55 : 0.85} className={className} fill={fill} {...common} />;
              })}
              {labels.map((l) => (
                <text key={l.code} x={l.x} y={l.y} textAnchor={l.flip ? "end" : "start"} className="dot-label" style={{ fill: "var(--ink)", fontSize: compact ? 11 : 13, paintOrder: "stroke", stroke: "var(--surface)", strokeWidth: 4 }}>{l.name}</text>
              ))}
              </g>
            </>
          )}
        </ChartFrame>
        <ZoomControls
          onZoomIn={zoom.zoomIn}
          onZoomOut={zoom.zoomOut}
          onReset={zoom.reset}
          canZoomIn={zoom.canZoomIn}
          zoomed={zoomed}
          className=""
          style={{ right: margin.right + 6, top: margin.top + 6 }}
        />
        <Tooltip state={pin.state ? null : tip.state}>
          {({ row, d }) => (
            <div className="flex min-w-[10rem] flex-col gap-0.5 text-[0.78rem]">
              <div className="font-medium">{row.name}</div>
              <div>Duty rate <span className="font-mono">{pctRate(row.baseRate)} → {pctRate(row.latestRate)}</span></div>
              <div>Change <span className="font-mono">{fmtPp(row.rateChangePp as number)}</span></div>
              <div>Imports <span className="font-mono">{fmtPct((row.importsChange as number) * 100)}</span>{d.pinned ? <span className="opacity-75"> (pinned to the edge)</span> : null}</div>
              <div className="opacity-75">{fmtMoney(row.baseImports / 1e6)} → {fmtMoney(row.latestImports / 1e6)} imports for consumption</div>
            </div>
          )}
        </Tooltip>
        <Tooltip
          state={pin.state}
          onActivate={(dot) => {
            onPickCountry(dot.row.code === country ? null : dot.row.code);
            pin.hide();
          }}
          activateHint="Show in the charts above →"
        >
          {({ row, d }) => (
            <div className="flex min-w-[10rem] flex-col gap-0.5 text-[0.78rem]">
              <div className="font-medium">{row.name}</div>
              <div>Duty rate <span className="font-mono">{pctRate(row.baseRate)} → {pctRate(row.latestRate)}</span></div>
              <div>Change <span className="font-mono">{fmtPp(row.rateChangePp as number)}</span></div>
              <div>Imports <span className="font-mono">{fmtPct((row.importsChange as number) * 100)}</span>{d.pinned ? <span className="opacity-75"> (pinned to the edge)</span> : null}</div>
              <div className="opacity-75">{fmtMoney(row.baseImports / 1e6)} → {fmtMoney(row.latestImports / 1e6)} imports for consumption</div>
            </div>
          )}
        </Tooltip>
      </div>

      <ul className="m-0 mt-3 flex list-none flex-wrap gap-x-2 gap-y-1 p-0 text-[0.78rem] text-ink-muted" aria-label="Continent filter">
        {CONTINENTS.filter((c) => c.id !== "other" || rows.some((r) => r.plotted && continentOf(r.code) === "other")).map((c) => {
          const on = continent === c.id;
          return (
            <li key={c.id}>
              <button
                type="button"
                aria-pressed={on}
                title={on ? "Show every continent" : `Show only ${c.label}`}
                onClick={() => {
                  setContinent(on ? null : c.id);
                  setTapped(null);
                }}
                className={`inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2 py-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${on ? "border-line-strong bg-surface-raised font-medium text-ink" : "border-transparent hover:text-ink"} ${continent && !on ? "opacity-50" : ""}`}
              >
                <span aria-hidden className="inline-block size-2.5 rounded-full" style={{ background: `var(--cont-${c.id})` }} />
                {c.label}
              </button>
            </li>
          );
        })}
        {continent && (
          <li>
            <button type="button" onClick={() => setContinent(null)} className="min-h-8 px-2 text-ink-faint underline hover:text-ink">Show all</button>
          </li>
        )}
      </ul>

      {tapMode && (
        <div className="mt-2 rounded-md border border-line bg-surface-raised p-3 text-[0.8rem]" aria-live="polite">
          {tappedRow && tappedRow.plotted ? (
            <>
              <div className="font-medium text-ink">{tappedRow.name}</div>
              <div className="mt-0.5 text-ink-muted">Duty rate <span className="font-mono text-ink">{pctRate(tappedRow.baseRate)} → {pctRate(tappedRow.latestRate)}</span> ({fmtPp(tappedRow.rateChangePp as number)})</div>
              <div className="text-ink-muted">Imports <span className="font-mono text-ink">{fmtPct((tappedRow.importsChange as number) * 100)}</span></div>
              <button
                type="button"
                onClick={() => onPickCountry(tappedRow.code)}
                className="mt-2 min-h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                Show {tappedRow.name} in the charts above
              </button>
            </>
          ) : (
            <span className="text-ink-muted">Tap a dot to see that country here.</span>
          )}
        </div>
      )}

      <MethodologyNote><p>
        Calculated duties divided by imports for consumption, both from Census import data, over {windowText(windows.latest)} against the same months of {windows.baseline.from.slice(0, 4)}{windows.baseline.from.slice(0, 4) !== windows.baseline.to.slice(0, 4) ? " and the year before" : ""}, so the season matches. Countries missing any month in either window are not plotted. The vertical axis is a symmetric log scale capped at +{Y_CAP_PCT.toLocaleString("en-US")}%: triangles at the top edge are pinned outliers, with their true values in the tooltip. Bilateral figures can be distorted when goods are re-routed through other countries, so treat any one dot with care. Click a continent in the legend to show only its countries (click it again to show all); the counts above follow. Click a dot to pick that country above.
        </p></MethodologyNote>
      <DataTable rows={rows} windows={windows} />
    </section>
  );
}
