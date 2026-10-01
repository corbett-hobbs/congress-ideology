"use client";

import { memo, useMemo, useState } from "react";
import { scaleLinear, scaleSymlog } from "d3-scale";
import { Axis } from "@/components/charts/Axis";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { Tooltip, useTooltip } from "@/components/charts/Tooltip";
import { useElementWidth } from "@/lib/use-element-width";
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

const FALLBACK_W = 1080;
const COMPACT_W = 560;
const LABEL_COUNT = 6;

const monthYear = (p: string) => `${MONTH_NAMES[Number(p.slice(5)) - 1].slice(0, 3)} ${p.slice(0, 4)}`;
const windowText = (w: { from: string; to: string }) => (w.from.slice(0, 4) === w.to.slice(0, 4) ? `${MONTH_NAMES[Number(w.from.slice(5)) - 1].slice(0, 3)}–${monthYear(w.to)}` : `${monthYear(w.from)}–${monthYear(w.to)}`);
const pctRate = (r: number | null) => (r === null ? "—" : `${(r * 100).toFixed(1)}%`);

interface Dot {
  row: ScatterRow;
  d: PlottedDot;
}

const Triangle = ({ x, y, up, className }: { x: number; y: number; up: boolean; className?: string }) => (
  <polygon points={up ? `${x - 5},${y + 6} ${x + 5},${y + 6} ${x},${y - 5}` : `${x - 5},${y - 6} ${x + 5},${y - 6} ${x},${y + 5}`} className={className} />
);

const DataTable = memo(function DataTable({ rows, windows }: { rows: ScatterRow[]; windows: ScatterWindows }) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-[0.75rem] text-ink-muted hover:text-ink">View as table</summary>
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
}: {
  rows: ScatterRow[];
  windows: ScatterWindows;
  country: string | null;
  onPickCountry: (code: string | null) => void;
}) {
  const [wrapRef, measured] = useElementWidth<HTMLDivElement>();
  const [query, setQuery] = useState("");
  const [tapped, setTapped] = useState<string | null>(null);
  const tip = useTooltip<Dot>();
  const W = measured || FALLBACK_W;
  const compact = W < COMPACT_W;
  const margin = compact ? { top: 22, right: 14, bottom: 52, left: 52 } : { top: 22, right: 24, bottom: 56, left: 70 };
  const pw = W - margin.left - margin.right;
  const ph = compact ? 340 : 440;
  const H = ph + margin.top + margin.bottom;

  const axes = useMemo(() => scatterAxes(rows), [rows]);
  const x = useMemo(() => scaleLinear().domain([axes.xMin, axes.xMax]).range([0, pw]), [axes, pw]);
  const y = useMemo(() => scaleSymlog().constant(Y_SYMLOG_CONSTANT).domain([Y_MIN_PCT, Y_CAP_PCT]).range([ph, 0]), [ph]);
  const dots = useMemo<Dot[]>(
    () => rows.flatMap((row) => {
      const d = toDot(row, axes);
      return d ? [{ row, d }] : [];
    }),
    [rows, axes],
  );
  const plotted = dots.length;
  const higher = dots.filter((d) => (d.row.rateChangePp as number) > 0).length;
  const sortedMedian = useMemo(() => {
    const xs = dots.map((d) => d.row.rateChangePp as number).sort((a, b) => a - b);
    return xs.length ? xs[Math.floor((xs.length - 1) / 2)] : null;
  }, [dots]);

  // Labels for the biggest partners (by baseline imports), dropped where they would collide.
  const labels = useMemo(() => {
    if (compact) return [];
    const biggest = [...dots].sort((a, b) => b.row.baseImports - a.row.baseImports).slice(0, LABEL_COUNT);
    const boxes = biggest.map((c) => ({ id: c.row.code, x: x(c.d.x) + 8, y: y(c.d.yPct) - 6, width: c.row.name.length * 6.4 + 4, height: 13 }));
    const kept = new Set(placeLabels(boxes, pw, ph).map((b) => b.id));
    return biggest.filter((c) => kept.has(c.row.code)).map((c) => ({ code: c.row.code, name: c.row.name, x: x(c.d.x) + 8, y: y(c.d.yPct) + 4 }));
  }, [dots, compact, x, y, pw, ph]);

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
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <h2 className="m-0 font-serif text-[1.6rem] font-medium leading-tight">Did tariffs shift trade?</h2>
          <p className="m-0 mt-2 text-[0.875rem] leading-[1.5] text-ink-muted">
            Each dot is a country. Across: how much calculated duties as a share of its imports changed, from {windowText(windows.baseline)} to {windowText(windows.latest)}. Up: how much U.S. imports from it changed over the same months.
          </p>
        </div>
        <div className="relative w-full sm:w-64">
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

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[0.78rem] text-ink-muted">
        <span><b className="text-ink">{plotted ? `${Math.round((higher / plotted) * 100)}%` : "—"}</b> higher duty rate</span>
        <span><b className="text-ink">{sortedMedian === null ? "—" : fmtPp(sortedMedian)}</b> median rate change</span>
        <span><b className="text-ink">{plotted}</b> plotted</span>
      </div>
      {selectedRow && !selectedRow.plotted && (
        <p className="m-0 mt-2 text-[0.8rem] text-ink-muted">{`${selectedRow.name} isn’t plotted: it is missing months of duties data in ${selectedRow.months[0] < windows.months ? "the baseline" : "the latest"} window.`}</p>
      )}

      <div ref={wrapRef} className="relative mt-3">
        <ChartFrame width={W} height={H} margin={margin} ariaLabel={aria} onPointerLeave={() => tip.hide()}>
          {() => (
            <>
              <Axis scale={x} orientation="bottom" ticks={axes.xTicks} offset={ph} gridExtent={ph} zeroAt={0} format={xTick} />
              <Axis scale={y} orientation="left" ticks={Y_TICKS_PCT} offset={0} gridExtent={pw} zeroAt={0} format={yTick} />
              <text className="axis-caption" x={pw / 2} y={ph + 44} textAnchor="middle">
                {compact ? "Change in duty rate" : "Change in duties as a share of the country’s imports"}
              </text>
              <text className="axis-caption" transform={`translate(${-(margin.left - 14)},${ph / 2}) rotate(-90)`} textAnchor="middle">
                {compact ? "Change in imports" : "Change in U.S. imports from the country"}
              </text>
              {!compact && (
                <g className="fill-ink-faint font-mono text-[10px] uppercase" style={{ letterSpacing: "0.06em" }}>
                  <text x={4} y={ph + 30}>← Lower tariff rate</text>
                  <text x={pw - 4} y={ph + 30} textAnchor="end">Higher tariff rate →</text>
                  <text x={6} y={12}>More imports ↑</text>
                  <text x={6} y={ph - 6}>Fewer imports ↓</text>
                </g>
              )}
              {drawOrder.map((c) => {
                const cx = x(c.d.x);
                const cy = y(c.d.yPct);
                const sel = c.row.code === country;
                const className = `dot fill-ink${sel ? " is-highlighted" : ""}`;
                const common = {
                  // Phones: a tap fills the card below the chart (no hover); the card holds the action.
                  onPointerEnter: compact ? undefined : (e: React.PointerEvent) => tip.show(c, e),
                  onPointerMove: compact ? undefined : tip.move,
                  onPointerLeave: compact ? undefined : tip.hide,
                  onClick: () => (compact ? setTapped(c.row.code) : onPickCountry(sel ? null : c.row.code)),
                  style: { cursor: "pointer" } as const,
                };
                if (c.d.pinned) {
                  const up = c.d.pinned === "top" || c.d.pinned === "right";
                  return <g key={c.row.code} {...common}><Triangle x={cx} y={cy} up={up} className={className} />{sel && <circle cx={cx} cy={cy} r={10} fill="none" stroke="var(--accent)" strokeWidth={2.5} />}</g>;
                }
                if (compact) {
                  return (
                    <g key={c.row.code} {...common}>
                      <circle cx={cx} cy={cy} r={22} fill="transparent" />
                      <circle cx={cx} cy={cy} r={sel || c.row.code === tapped ? 7 : 4.4} opacity={country && !sel ? 0.55 : 0.85} className={className} />
                      {c.row.code === tapped && <circle cx={cx} cy={cy} r={11} fill="none" stroke="var(--ink)" strokeWidth={1.5} />}
                    </g>
                  );
                }
                return <circle key={c.row.code} cx={cx} cy={cy} r={sel ? 7 : 4.4} opacity={country && !sel ? 0.55 : 0.85} className={className} {...common} />;
              })}
              {labels.map((l) => (
                <text key={l.code} x={l.x} y={l.y} className="dot-label" style={{ paintOrder: "stroke", stroke: "var(--surface)", strokeWidth: 3 }}>{l.name}</text>
              ))}
            </>
          )}
        </ChartFrame>
        <Tooltip state={tip.state}>
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

      {compact && (
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

      <p className="m-0 mt-2 text-[0.75rem] leading-[1.45] text-ink-muted">
        Calculated duties divided by imports for consumption, both from Census import data, over {windowText(windows.latest)} against the same months of {windows.baseline.from.slice(0, 4)}{windows.baseline.from.slice(0, 4) !== windows.baseline.to.slice(0, 4) ? " and the year before" : ""}, so the season matches. Countries missing any month in either window are not plotted. The vertical axis is a symmetric log scale capped at +{Y_CAP_PCT.toLocaleString("en-US")}%: triangles at the top edge are pinned outliers, with their true values in the tooltip. Bilateral figures can be distorted when goods are re-routed through other countries, so treat any one dot with care. Click a dot to pick that country above.
      </p>
      <DataTable rows={rows} windows={windows} />
    </section>
  );
}
