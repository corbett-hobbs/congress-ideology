"use client";

/**
 * A ranked list whose every row carries a stacked bar on one shared scale: rank, label, segments,
 * a total and a delta. The sibling of `SwarmRows` for composition instead of position (SwarmRows
 * draws dots on a shared axis and has no segment concept). HTML, not SVG, so long labels wrap on
 * phones. No entity knowledge: the caller supplies rows, colors and the formatted strings.
 *
 * Layout adapts to the list's own width (container query): five columns when wide, and under 400px
 * the bar drops to a second line and labels may wrap instead of truncating.
 */
export interface StackedRowData {
  id: string;
  rank?: number;
  label: string;
  segments: { value: number; color: string; title?: string }[];
  total: string;
  /** Right-hand text, e.g. "▲ $3.5B" or "–". */
  delta?: string;
  selected?: boolean;
  /** Fade the row (another row is selected). */
  dimmed?: boolean;
}

export function StackedRows({
  rows,
  scaleMax,
  onRowClick,
  ariaLabel,
  emptyText,
}: {
  rows: readonly StackedRowData[];
  /** The value a full-width bar stands for. */
  scaleMax: number;
  onRowClick: (id: string) => void;
  ariaLabel: string;
  emptyText: string;
}) {
  // No row has a second value (a delta, a military dollar figure): drop its column so the bar runs the full width.
  const hasDelta = rows.some((r) => !!r.delta);
  if (rows.length === 0) return <div className="px-2 py-10 text-center text-[0.82rem] text-ink-muted">{emptyText}</div>;
  return (
    <ul aria-label={ariaLabel} className="@container m-0 list-none p-0">
      {rows.map((r) => (
        <li key={r.id}>
          <button
            type="button"
            onClick={() => onRowClick(r.id)}
            aria-pressed={!!r.selected}
            className={`grid w-full cursor-pointer ${hasDelta ? "grid-cols-[24px_minmax(86px,118px)_minmax(60px,1fr)_50px_58px]" : "grid-cols-[24px_minmax(86px,118px)_minmax(60px,1fr)_56px]"} items-center gap-x-2 rounded-md border-0 px-2 py-1.5 text-left text-ink hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus ${hasDelta ? "@max-[400px]:grid-cols-[24px_1fr_auto_auto]" : "@max-[400px]:grid-cols-[24px_1fr_auto]"} @max-[400px]:gap-y-1 ${
              r.selected ? "bg-[color-mix(in_oklab,var(--accent)_13%,var(--surface))]" : "bg-transparent"
            } ${r.dimmed ? "opacity-50" : ""}`}
          >
            <span className="text-right font-mono text-[0.7rem] tabular-nums text-ink-faint">{r.rank ?? ""}</span>
            <span title={r.label} className={`truncate text-[0.82rem] @max-[400px]:whitespace-normal @max-[400px]:text-[0.85rem] @max-[400px]:leading-tight ${r.selected ? "font-semibold" : ""}`}>
              {r.label}
            </span>
            <span className="flex h-[11px] overflow-hidden rounded-[2px] bg-[color-mix(in_oklab,var(--ink)_5%,transparent)] @max-[400px]:order-last @max-[400px]:col-[2/-1]">
              {r.segments.map((s, i) =>
                s.value > 0 ? <i key={i} title={s.title} className="block h-full" style={{ width: `${(s.value / scaleMax) * 100}%`, background: s.color }} /> : null,
              )}
            </span>
            <span className="text-right font-mono text-[0.75rem] tabular-nums">{r.total}</span>
            {hasDelta && <span className="whitespace-nowrap text-left font-mono text-[0.7rem] tabular-nums text-ink-muted">{r.delta ?? ""}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}
